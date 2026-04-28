/**
 * REISSUE-STRIPE-INVOICE
 *
 * Admin can change invoice amount, recipient (email + name), service
 * label, OR billing target (patient ↔ org) post-send. Stripe doesn't
 * allow editing sent invoices, so the right pattern is:
 *   1. Void the existing Stripe invoice (if it exists + is open/sent)
 *   2. Update the appointment row with new amount / recipient / etc.
 *   3. Call send-appointment-invoice to issue a fresh invoice with
 *      the new details
 *   4. Audit-log both the void AND the reissue, linked via
 *      metadata.replaces / metadata.replaced_by, so admin can trace
 *      'why was X voided?' → 'reissued as Y at correct amount'
 *
 * Body:
 *   {
 *     appointmentId: string,         // required
 *     newTotal?: number,             // dollars; if changed, voids old + reissues
 *     newPatientEmail?: string,      // if changed, voids old + reissues
 *     newPatientName?: string,
 *     newServiceName?: string,       // line-item label
 *     newBilledTo?: 'patient' | 'org',  // toggle billing target
 *     newOrgEmail?: string,          // if newBilledTo='org', who pays
 *     reason?: string                // for audit log
 *   }
 *
 * At least one of newTotal / newPatientEmail / newServiceName / newBilledTo
 * must be supplied. Otherwise call send-appointment-invoice directly to
 * just resend the same invoice.
 */

import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      appointmentId,
      newTotal,
      newPatientEmail,
      newPatientName,
      newServiceName,
      newBilledTo,
      newOrgEmail,
      reason,
    } = body;

    if (!appointmentId) {
      return new Response(JSON.stringify({ error: 'appointmentId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // At least one mutation must be supplied
    const hasChange = newTotal !== undefined || newPatientEmail || newServiceName || newBilledTo || newOrgEmail || newPatientName;
    if (!hasChange) {
      return new Response(JSON.stringify({
        error: 'no_change',
        message: 'Specify at least one of: newTotal, newPatientEmail, newPatientName, newServiceName, newBilledTo, newOrgEmail. To resend without changes, use the standard resend flow.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolve admin actor for audit log
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    let actorUserId: string | null = null;
    let actorEmail: string | null = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      actorUserId = user?.id || null;
      actorEmail = user?.email || null;
    }

    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select('id, stripe_invoice_id, invoice_status, payment_status, patient_name, patient_email, total_amount, service_type, service_name, billed_to, organization_id, address, appointment_date, appointment_time, is_vip, notes')
      .eq('id', appointmentId)
      .maybeSingle();

    if (apptErr || !appt) {
      return new Response(JSON.stringify({ error: 'appointment_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refuse to reissue if already paid — admin should refund + create new
    if (appt.payment_status === 'completed') {
      return new Response(JSON.stringify({
        error: 'already_paid',
        message: 'This appointment is already paid. Issue a refund first, then create a new invoice — reissuing a paid invoice would cause Stripe + ledger drift.',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Snapshot old values for audit
    const oldTotal = Number(appt.total_amount || 0);
    const oldEmail = String(appt.patient_email || '');
    const oldStripeInvoiceId = appt.stripe_invoice_id || null;

    // Compute new values (fallback to existing when not provided)
    const finalTotal = newTotal !== undefined ? Number(newTotal) : oldTotal;
    const finalPatientEmail = newPatientEmail || oldEmail;
    const finalPatientName = newPatientName || appt.patient_name;
    const finalServiceName = newServiceName || appt.service_name || appt.service_type;
    const finalBilledTo = newBilledTo || appt.billed_to || 'patient';

    if (finalTotal <= 0) {
      return new Response(JSON.stringify({
        error: 'invalid_total',
        message: `New total must be > 0. Got ${finalTotal}.`,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolve billing email (patient or org)
    let billingEmail = finalPatientEmail;
    if (finalBilledTo === 'org') {
      if (newOrgEmail) {
        billingEmail = newOrgEmail;
      } else if (appt.organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('billing_email, contact_email')
          .eq('id', appt.organization_id)
          .maybeSingle();
        billingEmail = (org as any)?.billing_email || (org as any)?.contact_email || finalPatientEmail;
      }
    }

    if (!billingEmail) {
      return new Response(JSON.stringify({
        error: 'no_billing_email',
        message: 'No billing email available. Provide newPatientEmail (for patient billing) or newOrgEmail (for org billing).',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── STEP 1: Void existing Stripe invoice if it exists + is voidable
    let oldStripeStatusBefore: string | null = null;
    let oldStripeStatusAfter: string | null = null;
    if (oldStripeInvoiceId) {
      try {
        const oldInv = await stripe.invoices.retrieve(oldStripeInvoiceId);
        oldStripeStatusBefore = oldInv.status || 'unknown';
        if (oldInv.status === 'paid') {
          // Should have been caught above; defensive guard
          return new Response(JSON.stringify({
            error: 'already_paid',
            message: 'Stripe shows this invoice paid. Refund first.',
          }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (oldInv.status === 'draft') {
          await stripe.invoices.del(oldStripeInvoiceId);
          oldStripeStatusAfter = 'deleted';
        } else if (oldInv.status === 'open' || oldInv.status === 'sent' || oldInv.status === 'uncollectible') {
          const voided = await stripe.invoices.voidInvoice(oldStripeInvoiceId);
          oldStripeStatusAfter = voided.status || 'void';
        } else {
          oldStripeStatusAfter = oldInv.status || 'unchanged';
        }
      } catch (e: any) {
        if (e?.statusCode === 404) {
          oldStripeStatusBefore = 'not_on_stripe';
          oldStripeStatusAfter = 'not_on_stripe';
        } else {
          throw new Error(`Stripe void failed: ${e?.message || 'unknown'}`);
        }
      }
    }

    // ─── STEP 2: Update the appointment row with the new values
    const auditNote = `[REISSUED ${new Date().toISOString()}${actorEmail ? ' by ' + actorEmail : ''}: $${oldTotal} → $${finalTotal}, ${oldEmail} → ${billingEmail}${reason ? ' — ' + reason : ''}]`;
    const newNotes = appt.notes ? `${appt.notes}\n${auditNote}` : auditNote;

    const apptUpdates: Record<string, any> = {
      total_amount: finalTotal,
      service_price: finalTotal,
      service_name: finalServiceName,
      patient_email: finalPatientEmail,
      patient_name: finalPatientName,
      billed_to: finalBilledTo,
      stripe_invoice_id: null,           // cleared so send-appointment-invoice will create a fresh one
      invoice_status: 'pending_send',
      invoice_sent_at: null,
      invoice_email_bounced: false,      // reset bounce flag — patient gets a fresh shot
      invoice_email_bounced_at: null,
      invoice_email_bounce_reason: null,
      payment_status: 'pending',
      notes: newNotes,
    };
    if (newOrgEmail) {
      // No appointments column for the org-side email override; send-appointment-invoice
      // resolves it from organizations.billing_email when billed_to='org'. If admin
      // wants a custom org email, they should update the org row instead — flag in note.
    }

    const { error: updErr } = await supabase
      .from('appointments')
      .update(apptUpdates)
      .eq('id', appointmentId);

    if (updErr) throw new Error(`appointment update failed: ${updErr.message}`);

    // ─── STEP 3: Issue fresh invoice via existing send-appointment-invoice
    const dateOnly = String(appt.appointment_date || '').slice(0, 10);
    const { data: sendData, error: sendErr } = await supabase.functions.invoke('send-appointment-invoice', {
      body: {
        appointmentId,
        patientName: finalPatientName,
        patientEmail: billingEmail,
        serviceType: appt.service_type,
        serviceName: finalServiceName,
        servicePrice: finalTotal,
        appointmentDate: dateOnly,
        appointmentTime: appt.appointment_time || '',
        address: appt.address || 'See appointment details',
        isVip: appt.is_vip,
        memo: reason || `Reissued${actorEmail ? ' by ' + actorEmail : ''}`,
      },
    });

    if (sendErr || (sendData as any)?.error) {
      // The new invoice failed to send — leave the appointment in 'pending_send'
      // so admin can manually retry. Audit-log the partial state.
      try {
        await supabase.from('invoice_audit_log' as any).insert({
          appointment_id: appointmentId,
          action: 'amount_changed',
          actor_user_id: actorUserId,
          actor_email: actorEmail,
          stripe_invoice_id: oldStripeInvoiceId,
          stripe_status_before: oldStripeStatusBefore,
          stripe_status_after: oldStripeStatusAfter,
          amount_before_cents: Math.round(oldTotal * 100),
          amount_after_cents: Math.round(finalTotal * 100),
          email_before: oldEmail,
          email_after: billingEmail,
          reason: `${reason || 'reissue'} — VOIDED OLD BUT NEW SEND FAILED`,
          metadata: {
            send_error: sendErr?.message || (sendData as any)?.error || 'unknown',
            patient_name: finalPatientName,
          },
        });
      } catch { /* non-blocking */ }
      return new Response(JSON.stringify({
        error: 'reissue_send_failed',
        message: `Old invoice voided successfully but the new invoice couldn't be sent: ${sendErr?.message || (sendData as any)?.error || 'unknown'}. Appointment is in 'pending_send' state — retry the resend from the Invoices tab.`,
        old_voided: true,
        appointment_id: appointmentId,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── STEP 4: Audit log — link old to new
    try {
      await supabase.from('invoice_audit_log' as any).insert({
        appointment_id: appointmentId,
        action: 'amount_changed',
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        stripe_invoice_id: oldStripeInvoiceId,
        stripe_status_before: oldStripeStatusBefore,
        stripe_status_after: oldStripeStatusAfter,
        amount_before_cents: Math.round(oldTotal * 100),
        amount_after_cents: Math.round(finalTotal * 100),
        email_before: oldEmail,
        email_after: billingEmail,
        reason: reason || 'admin reissue',
        metadata: {
          patient_name: finalPatientName,
          old_billed_to: appt.billed_to,
          new_billed_to: finalBilledTo,
          old_service_name: appt.service_name,
          new_service_name: finalServiceName,
          new_stripe_invoice_id: (sendData as any)?.invoiceId || null,
        },
      });
    } catch (e) {
      console.warn('[reissue-invoice] audit insert failed (non-blocking):', e);
    }

    return new Response(JSON.stringify({
      ok: true,
      appointment_id: appointmentId,
      old_stripe_invoice_id: oldStripeInvoiceId,
      old_stripe_status_before: oldStripeStatusBefore,
      old_stripe_status_after: oldStripeStatusAfter,
      old_total: oldTotal,
      new_total: finalTotal,
      old_email: oldEmail,
      new_email: billingEmail,
      new_invoice: sendData,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[reissue-invoice] unhandled:', e);
    return new Response(JSON.stringify({
      error: 'reissue_failed',
      message: e?.message || 'unknown',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
