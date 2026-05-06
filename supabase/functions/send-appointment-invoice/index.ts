import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { brandedEmailWrapper } from '../_shared/branded-email.ts';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

/**
 * BILLING ISOLATION CONTRACT
 *
 * Every appointment can be billed to either the patient or to a partner org.
 * This function is SERVER-AUTHORITATIVE: regardless of what the caller passes,
 * we re-read billed_to + organization_id from the appointment row and route
 * the invoice accordingly. This prevents:
 *
 *   - Sending an org-billed invoice to the patient's email
 *   - Mixing multiple patients of the same org into a single Stripe Customer
 *     (which would expose one patient's invoice history to another)
 *   - Sending the "please pay" email to the patient when the org owes the money
 *
 * Stripe Customer keying:
 *   - billed_to = 'patient' → one Stripe Customer per patient_email
 *   - billed_to = 'org'     → one Stripe Customer per organization_id, flagged
 *                             in metadata. Never shared with patient customers.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      appointmentId, patientName, patientEmail, patientPhone,
      serviceType, serviceName, servicePrice,
      appointmentDate, appointmentTime, address, isVip,
      memo,
    } = body;

    if (!appointmentId) {
      return new Response(
        JSON.stringify({ error: 'appointmentId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ─── SERVER-AUTHORITATIVE BILLING LOOKUP ──────────────────────────────
    // Re-read from the DB rather than trust the caller. If this appointment
    // is marked org-billed we route to the org's Stripe customer + email.
    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select('id, billed_to, organization_id, patient_name, patient_email, patient_phone, patient_name_masked, org_reference_id, family_group_id, total_amount, tip_amount, service_type')
      .eq('id', appointmentId)
      .maybeSingle();
    if (apptErr || !appt) {
      return new Response(
        JSON.stringify({ error: `Appointment ${appointmentId} not found` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const billedToOrg = appt.billed_to === 'org' && !!appt.organization_id;

    let org: {
      id: string;
      name: string;
      billing_email: string | null;
      contact_name: string | null;
      stripe_customer_id: string | null;
      show_patient_name_on_appointment: boolean | null;
    } | null = null;

    if (billedToOrg) {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('id, name, billing_email, contact_name, stripe_customer_id, show_patient_name_on_appointment')
        .eq('id', appt.organization_id)
        .maybeSingle();
      org = orgRow || null;
      if (!org || !org.billing_email) {
        return new Response(
          JSON.stringify({ error: 'Org billing not configured (missing billing_email on organization)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ─── DECIDE RECIPIENT ─────────────────────────────────────────────────
    const invoiceToEmail = billedToOrg ? org!.billing_email! : (patientEmail || appt.patient_email);
    const invoiceToName  = billedToOrg ? (org!.contact_name || org!.name) : (patientName || appt.patient_name);
    const invoiceToPhone = billedToOrg ? undefined : (patientPhone || appt.patient_phone || undefined);

    if (!invoiceToEmail) {
      return new Response(
        JSON.stringify({ error: 'No billable email available for this appointment' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Patient-identifying string used on line items. For orgs that mask
    // patient names (e.g. clinical trial sites), use the org_reference_id.
    const maskPatient = billedToOrg && org!.show_patient_name_on_appointment === false;
    const patientLabel = maskPatient
      ? (appt.org_reference_id || 'Confidential Patient')
      : (appt.patient_name || patientName || 'Patient');

    // ─── STRIPE CUSTOMER (isolated per billing target) ────────────────────
    let customerId: string;

    if (billedToOrg) {
      // Reuse the org's cached Stripe customer id if we have one
      if (org!.stripe_customer_id) {
        customerId = org!.stripe_customer_id;
      } else {
        // Find any existing org customer we may have created before the cache column existed
        const existing = await stripe.customers.search({
          query: `metadata['convelabs_org_id']:'${org!.id}'`,
          limit: 1,
        });
        if (existing.data.length > 0) {
          customerId = existing.data[0].id;
        } else {
          const customer = await stripe.customers.create({
            email: org!.billing_email!,
            name: org!.name,
            metadata: {
              convelabs_org_id: org!.id,
              source: 'org_billing',
            },
          });
          customerId = customer.id;
        }
        // Cache it
        await supabase
          .from('organizations')
          .update({ stripe_customer_id: customerId })
          .eq('id', org!.id);
      }
    } else {
      // Patient billing — one customer per patient email, flagged so it
      // can never collide with org customers on future lookups.
      const existing = await stripe.customers.list({ email: invoiceToEmail, limit: 5 });
      // Prefer a customer that is NOT flagged as an org
      const patientCustomer = existing.data.find(c => !(c.metadata?.convelabs_org_id)) || null;
      if (patientCustomer) {
        customerId = patientCustomer.id;
      } else {
        const customer = await stripe.customers.create({
          email: invoiceToEmail,
          name: invoiceToName,
          phone: invoiceToPhone,
          metadata: { source: 'patient_billing', appointment_id: appointmentId },
        });
        customerId = customer.id;
      }
    }

    // ─── CONNECT ROUTING LOOKUP ───────────────────────────────────────────
    // Find the single connected phleb (owner-phleb pattern). If/when we
    // hire additional phlebs, this needs to resolve from an assignment
    // table; for now there is exactly one Connect account in the system.
    // We compute the phleb's take here so we can pass transfer_data on
    // invoice creation. Works for BOTH patient-billed and org-billed:
    // Stripe routes the configured cents to the destination on payment.
    let phlebConnectId: string | null = null;
    let phlebStaffId: string | null = null;
    {
      const { data: connected } = await supabase
        .from('staff_profiles')
        .select('id, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
        .not('stripe_connect_account_id', 'is', null)
        .eq('stripe_connect_charges_enabled', true)
        .eq('stripe_connect_payouts_enabled', true)
        .limit(2);
      if (connected && connected.length === 1) {
        phlebConnectId = (connected[0] as any).stripe_connect_account_id;
        phlebStaffId = (connected[0] as any).id;
      }
    }

    // ─── CREATE INVOICE ───────────────────────────────────────────────────
    const invoiceDescription = memo
      ? `ConveLabs — ${memo}`
      : billedToOrg
        ? `ConveLabs — ${patientLabel} (Billed to ${org!.name})`
        : `ConveLabs Appointment — ${patientLabel}`;

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: billedToOrg ? 30 : 0,
      description: invoiceDescription,
      metadata: {
        appointment_id: appointmentId,
        service_type: serviceType || '',
        memo: memo || '',
        billed_to: appt.billed_to || 'patient',
        organization_id: appt.organization_id || '',
        org_name: billedToOrg ? org!.name : '',
        // NOTE: intentionally NOT including patient_email here when billed_to=org,
        // so org-facing invoice data never carries patient contact info.
      },
    });

    // Add primary line item
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: Math.round((servicePrice || 0) * 100),
      currency: 'usd',
      description: `${serviceName || serviceType || 'Mobile Blood Draw'} — ${patientLabel} — ${appointmentDate || ''}${appointmentTime ? ` at ${appointmentTime}` : ''}`,
    });

    // ─── COMPANION LINE ITEMS — when this appointment has companions
    // booked under the same family_group_id (same household, same visit
    // window), add ONE Stripe line item per companion so the invoice
    // explicitly shows what each charge covers. Without this, the
    // primary invoice carries one merged amount and patients can't
    // tell what they paid for; org-billed accounts have no per-patient
    // attribution. We only add lines for sibling appointments that
    // are NOT yet invoiced themselves (no stripe_invoice_id) — prevents
    // double-billing if companions were already invoiced separately.
    let companionTotalCents = 0;
    if (appt.family_group_id) {
      try {
        const { data: companions } = await supabase
          .from('appointments')
          .select('id, patient_name, total_amount, service_type, appointment_date, appointment_time, stripe_invoice_id, invoice_status')
          .eq('family_group_id', appt.family_group_id)
          .neq('id', appointmentId)
          .is('stripe_invoice_id', null)
          .not('invoice_status', 'eq', 'cancelled')
          .not('invoice_status', 'eq', 'paid');

        for (const c of (companions || [])) {
          const cAmt = Math.round(Number((c as any).total_amount || 0) * 100);
          if (cAmt < 50) continue; // Stripe min line-item amount
          const cName = (c as any).patient_name || 'Family member';
          const cDate = (c as any).appointment_date || appointmentDate || '';
          const cTime = (c as any).appointment_time || '';
          await stripe.invoiceItems.create({
            customer: customerId,
            invoice: invoice.id,
            amount: cAmt,
            currency: 'usd',
            description: `Family member visit — ${cName} — ${cDate}${cTime ? ` at ${cTime}` : ''}`,
            metadata: { companion_appointment_id: (c as any).id, family_group_id: appt.family_group_id },
          });
          companionTotalCents += cAmt;

          // Mark companion appointment as invoiced under the primary's
          // Stripe invoice so it doesn't get a second invoice from the
          // dunning cron or a manual resend later.
          await supabase.from('appointments').update({
            stripe_invoice_id: invoice.id,
            invoice_status: 'sent',
            invoice_sent_at: new Date().toISOString(),
            notes: `${(c as any).notes || ''}\n[invoice ${invoice.id} — billed via primary ${appointmentId}]`.trim().substring(0, 1000),
          }).eq('id', (c as any).id);
        }
        if (companionTotalCents > 0) {
          console.log(`[send-invoice] added ${(companions || []).length} companion line items totaling $${(companionTotalCents/100).toFixed(2)} to invoice ${invoice.id}`);
        }
      } catch (companionErr) {
        console.warn('[send-invoice] companion line-items failed (non-blocking):', companionErr);
      }
    }

    // ─── COMPUTE PHLEB TAKE + ATTACH transfer_data BEFORE FINALIZE ──────
    // For each appointment on this invoice (primary + invoiced companions),
    // call compute_phleb_take_cents and sum into a single transfer_data.amount
    // routed to the connected phleb. Cap at total invoice amount for safety.
    // Skipped if no Connect account is configured or take is zero.
    let totalTakeCents = 0;
    if (phlebConnectId && phlebStaffId) {
      try {
        const apptsForTake: Array<{ id: string; total_amount: number; tip_amount: number; service_type: string; family_group_id: string | null }> = [
          {
            id: appt.id,
            total_amount: Number(appt.total_amount || servicePrice || 0),
            tip_amount: Number((appt as any).tip_amount || 0),
            service_type: appt.service_type || serviceType || 'mobile',
            family_group_id: appt.family_group_id || null,
          },
        ];
        if (appt.family_group_id) {
          const { data: companionAppts } = await supabase
            .from('appointments')
            .select('id, total_amount, tip_amount, service_type, family_group_id')
            .eq('family_group_id', appt.family_group_id)
            .neq('id', appointmentId)
            .eq('stripe_invoice_id', invoice.id);
          for (const c of (companionAppts || [])) {
            apptsForTake.push({
              id: (c as any).id,
              total_amount: Number((c as any).total_amount || 0),
              tip_amount: Number((c as any).tip_amount || 0),
              service_type: (c as any).service_type || appt.service_type || 'mobile',
              family_group_id: (c as any).family_group_id || null,
            });
          }
        }

        for (const a of apptsForTake) {
          const tipCents = Math.round((a.tip_amount || 0) * 100);
          const hasCompanion = !!a.family_group_id;
          const { data: takeRes } = await supabase.rpc('compute_phleb_take_cents' as any, {
            p_staff_id: phlebStaffId,
            p_service_type: a.service_type,
            p_tip_cents: tipCents,
            p_has_companion: hasCompanion,
            p_surcharges: {},
            p_is_owner: true,
          });
          const t = parseInt(String(takeRes || 0), 10);
          if (t > 0) totalTakeCents += t;
        }

        // Cap at total invoice amount minus a tiny safety margin (Stripe
        // requires transfer amount <= charge amount net of fees).
        const primaryCents = Math.round((servicePrice || appt.total_amount || 0) * 100);
        const totalInvoiceCents = primaryCents + companionTotalCents;
        if (totalTakeCents > totalInvoiceCents) totalTakeCents = totalInvoiceCents;

        if (totalTakeCents > 0) {
          await stripe.invoices.update(invoice.id, {
            transfer_data: {
              destination: phlebConnectId,
              amount: totalTakeCents,
            },
          } as any);
          console.log(`[send-invoice] attached transfer_data ${totalTakeCents}¢ → ${phlebConnectId} on invoice ${invoice.id}`);
        }
      } catch (takeErr) {
        // Non-blocking: invoice still goes out, phleb cut falls back to
        // the invoice.paid webhook → transfer-invoice-phleb-cut catch-up
        // path (which will log manual_owed if balance is insufficient).
        console.warn('[send-invoice] transfer_data attach failed (non-blocking):', takeErr);
      }
    }

    // Finalize + send (Stripe emails the invoice to the customer on file,
    // which is the ORG for org-billed and the PATIENT for patient-billed)
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(invoice.id);

    // Update appointment with Stripe invoice ID + hosted pay URL
    await supabase.from('appointments').update({
      stripe_invoice_id: invoice.id,
      stripe_invoice_url: finalizedInvoice.hosted_invoice_url || null,
      invoice_status: 'sent',
      invoice_sent_at: new Date().toISOString(),
    }).eq('id', appointmentId);

    // ─── BRANDED MAILGUN EMAIL (ALSO recipient-aware) ─────────────────────
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

    if (MAILGUN_API_KEY) {
      const formattedDate = appointmentDate
        ? new Date(appointmentDate + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })
        : '';
      const paymentUrl = finalizedInvoice.hosted_invoice_url || `https://convelabs.com/book-now`;

      const headerTitle = billedToOrg
        ? `Invoice for ${org!.name}`
        : 'Your Appointment Invoice';
      const greetingName = billedToOrg ? (org!.contact_name || org!.name) : patientLabel;
      const purposeLine = billedToOrg
        ? `This invoice covers a ConveLabs concierge lab visit completed on behalf of your organization${maskPatient ? '' : ` for ${patientLabel}`}.`
        : 'Your appointment has been scheduled. Please review the details below and complete your payment to confirm.';

      // Compose body inside the unified branded wrapper. Visit-details
      // table + the urgency / VIP / org-net-30 callouts are body HTML.
      const bodyHtml = `
        <div style="background:#FBF8F2;border:1px solid rgba(127,29,29,0.12);border-radius:12px;padding:18px;margin:8px 0 18px;">
          <h3 style="margin:0 0 10px;color:#7F1D1D;font-size:15px;font-family:'Playfair Display',serif;">Visit Details</h3>
          <table style="width:100%;font-size:14px;color:#1F1410;border-collapse:collapse;">
            <tr><td style="padding:4px 0;color:#6B5E54;">Service</td><td style="text-align:right;font-weight:600;">${serviceName || serviceType || 'Mobile Blood Draw'}</td></tr>
            ${billedToOrg && !maskPatient ? `<tr><td style="padding:4px 0;color:#6B5E54;">Patient</td><td style="text-align:right;font-weight:600;">${patientLabel}</td></tr>` : ''}
            ${billedToOrg && maskPatient ? `<tr><td style="padding:4px 0;color:#6B5E54;">Ref #</td><td style="text-align:right;font-weight:600;">${patientLabel}</td></tr>` : ''}
            ${formattedDate ? `<tr><td style="padding:4px 0;color:#6B5E54;">Date</td><td style="text-align:right;font-weight:600;">${formattedDate}</td></tr>` : ''}
            ${appointmentTime ? `<tr><td style="padding:4px 0;color:#6B5E54;">Time</td><td style="text-align:right;font-weight:600;">${appointmentTime}</td></tr>` : ''}
            ${address && !billedToOrg ? `<tr><td style="padding:4px 0;color:#6B5E54;">Location</td><td style="text-align:right;">${address}</td></tr>` : ''}
            <tr><td colspan="2" style="padding:8px 0 0;"><hr style="border:none;border-top:1px solid rgba(201,169,97,0.5);"></td></tr>
            <tr><td style="padding:8px 0;color:#7F1D1D;font-weight:700;font-size:15px;">Amount Due</td><td style="text-align:right;font-weight:700;font-size:20px;color:#7F1D1D;">$${(servicePrice || 0).toFixed(2)}</td></tr>
          </table>
        </div>

        ${!billedToOrg ? `
        <div style="background:#FFFBEB;border:1px solid #FBBF24;border-radius:10px;padding:14px;margin:16px 0;">
          <p style="margin:0;font-size:13px;color:#92400E;font-weight:700;">Payment required within 12 hours</p>
          <p style="margin:6px 0 0;font-size:12px;color:#A16207;line-height:1.5;">
            Due to patient volume, payment must be received within 12 hours or your appointment may be released to the next patient on standby.
          </p>
        </div>
        ` : `
        <p style="font-size:13px;color:#6B5E54;margin:16px 0;">Net 30 terms. Questions on this invoice? Reply or call (941) 527-9169.</p>
        `}

        ${isVip && !billedToOrg ? '<p style="text-align:center;margin:14px 0;font-size:13px;color:#7F1D1D;font-weight:700;background:#FBF8F2;border:1px solid #C9A961;border-radius:10px;padding:10px;">★ VIP Patient — Priority Scheduling</p>' : ''}
      `;

      const emailHtml = brandedEmailWrapper({
        headline: headerTitle,
        greeting: `Hello ${greetingName},`,
        bodyHtml: `<p style="font-size:14px;color:#3F2A20;margin:0 0 12px;">${purposeLine}</p>${bodyHtml}`,
        ctaLabel: `Pay Now — $${(servicePrice || 0).toFixed(2)}`,
        ctaHref: paymentUrl,
        trustCloser: !billedToOrg ? 'Pays for itself in 1 visit' : undefined,
        footerNote: 'Questions? Call (941) 527-9169 or reply to this email.',
      });

      const formData = new FormData();
      formData.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
      formData.append('to', invoiceToEmail);
      formData.append('subject', billedToOrg
        ? `Invoice from ConveLabs — $${(servicePrice || 0).toFixed(2)} (${org!.name})`
        : `Your ConveLabs Appointment — Invoice for $${(servicePrice || 0).toFixed(2)}`);
      formData.append('html', emailHtml);
      formData.append('o:tracking-clicks', 'no');

      await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: formData,
      });
    }

    console.log(`Invoice ${invoice.id} → ${billedToOrg ? `ORG ${org!.name}` : 'patient'} (${invoiceToEmail}) for appointment ${appointmentId}`);

    return new Response(
      JSON.stringify({
        success: true,
        invoiceId: invoice.id,
        invoiceUrl: finalizedInvoice.hosted_invoice_url,
        billedTo: billedToOrg ? 'org' : 'patient',
        recipient: invoiceToEmail,
        phlebTakeCents: totalTakeCents,
        phlebConnect: phlebConnectId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Invoice error:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
