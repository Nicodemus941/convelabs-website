/**
 * VOID-STRIPE-INVOICE
 *
 * Properly voids a Stripe invoice + syncs ConveLabs DB. Replaces the
 * fake void path in InvoicesTab.tsx that was just sending an internal
 * email named 'void-stripe-invoice' (no actual Stripe API call) — a
 * critical data-integrity bug that left zombie invoices on Stripe
 * with status='sent' even though admin had marked them cancelled in
 * our DB.
 *
 * Body:
 *   { appointmentId: string, reason?: string }
 *
 * Behavior:
 *   1. Look up the appointment + stripe_invoice_id
 *   2. Retrieve the Stripe invoice. If status='paid', refuse to void
 *      (Stripe doesn't allow voiding paid invoices — admin should issue
 *      a refund instead, separate flow).
 *   3. If 'open' or 'sent' or 'draft', call stripe.invoices.voidInvoice()
 *      OR delete it for drafts (Stripe rules: drafts can be deleted but
 *      not voided; sent/open can be voided).
 *   4. Update appointments.invoice_status = 'voided',
 *      payment_status = 'voided', notes appended with audit string.
 *   5. Insert audit row to invoice_audit_log.
 *
 * Audit row: who/when/what — admin authenticated via JWT, action='voided',
 * reason supplied by caller.
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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { appointmentId, reason } = await req.json().catch(() => ({}));
    if (!appointmentId) {
      return new Response(JSON.stringify({ error: 'appointmentId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve admin user from JWT (for audit log)
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
      .select('id, stripe_invoice_id, invoice_status, payment_status, patient_name, total_amount, notes')
      .eq('id', appointmentId)
      .maybeSingle();

    if (apptErr || !appt) {
      return new Response(JSON.stringify({
        error: 'appointment_not_found',
        message: 'No appointment with that id',
      }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let stripeBefore: string | null = null;
    let stripeAfter: string | null = null;

    if (appt.stripe_invoice_id) {
      let invoice;
      try {
        invoice = await stripe.invoices.retrieve(appt.stripe_invoice_id);
      } catch (e: any) {
        if (e?.statusCode === 404) {
          // Stripe invoice doesn't exist (already deleted or never created).
          // Just update our side.
          stripeBefore = 'not_on_stripe';
          stripeAfter = 'not_on_stripe';
        } else {
          throw new Error(`Stripe lookup failed: ${e?.message || 'unknown'}`);
        }
      }

      if (invoice) {
        stripeBefore = invoice.status || 'unknown';

        if (invoice.status === 'paid') {
          return new Response(JSON.stringify({
            error: 'cannot_void_paid',
            message: 'This invoice is already paid on Stripe. Issue a refund via the refund flow instead — voiding paid invoices is not allowed.',
          }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (invoice.status === 'draft') {
          await stripe.invoices.del(appt.stripe_invoice_id);
          stripeAfter = 'deleted';
        } else if (invoice.status === 'open' || invoice.status === 'uncollectible' || invoice.status === 'sent') {
          const voided = await stripe.invoices.voidInvoice(appt.stripe_invoice_id);
          stripeAfter = voided.status || 'void';
        } else if (invoice.status === 'void') {
          // Already void on Stripe — just sync DB
          stripeAfter = 'void';
        } else {
          // Unknown status — log + proceed
          stripeAfter = invoice.status || 'unknown';
        }
      }
    }

    // Update appointment row
    const auditNote = `[VOIDED ${new Date().toISOString()}${actorEmail ? ' by ' + actorEmail : ''}${reason ? ' — ' + reason : ''}]`;
    const newNotes = appt.notes ? `${appt.notes}\n${auditNote}` : auditNote;

    const { error: updateErr } = await supabase
      .from('appointments')
      .update({
        invoice_status: 'voided',
        payment_status: 'voided',
        notes: newNotes,
      })
      .eq('id', appointmentId);

    if (updateErr) {
      throw new Error(`DB update failed: ${updateErr.message}`);
    }

    // Audit log row — non-blocking. Table may or may not exist; we'll
    // create it via migration alongside this function.
    try {
      await supabase.from('invoice_audit_log' as any).insert({
        appointment_id: appointmentId,
        action: 'voided',
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        stripe_invoice_id: appt.stripe_invoice_id,
        stripe_status_before: stripeBefore,
        stripe_status_after: stripeAfter,
        reason: reason || null,
        amount_cents: Math.round((Number(appt.total_amount) || 0) * 100),
        metadata: {
          patient_name: appt.patient_name,
          previous_invoice_status: appt.invoice_status,
          previous_payment_status: appt.payment_status,
        },
      });
    } catch (e) {
      console.warn('[void-invoice] audit log insert failed (non-blocking):', e);
    }

    return new Response(JSON.stringify({
      ok: true,
      appointment_id: appointmentId,
      stripe_invoice_id: appt.stripe_invoice_id,
      stripe_status_before: stripeBefore,
      stripe_status_after: stripeAfter,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[void-invoice] unhandled:', e);
    return new Response(JSON.stringify({
      error: 'void_failed',
      message: e?.message || 'unknown error',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
