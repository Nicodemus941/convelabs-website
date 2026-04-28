import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
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
      .select('id, billed_to, organization_id, patient_name, patient_email, patient_phone, patient_name_masked, org_reference_id, family_group_id, total_amount')
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

      const emailHtml = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:white;padding:32px;border-radius:16px 16px 0 0;text-align:center;">
      <h1 style="margin:0;font-size:24px;">${headerTitle}</h1>
      <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">ConveLabs Concierge Lab Services</p>
    </div>
    <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 16px 16px;">
      <p style="font-size:16px;color:#374151;">Hello ${greetingName},</p>
      <p style="font-size:14px;color:#6b7280;line-height:1.6;">${purposeLine}</p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:20px 0;">
        <h3 style="margin:0 0 12px;color:#B91C1C;font-size:16px;">Visit Details</h3>
        <table style="width:100%;font-size:14px;color:#374151;">
          <tr><td style="padding:4px 0;color:#6b7280;">Service</td><td style="text-align:right;font-weight:600;">${serviceName || serviceType || 'Mobile Blood Draw'}</td></tr>
          ${billedToOrg && !maskPatient ? `<tr><td style="padding:4px 0;color:#6b7280;">Patient</td><td style="text-align:right;font-weight:600;">${patientLabel}</td></tr>` : ''}
          ${billedToOrg && maskPatient ? `<tr><td style="padding:4px 0;color:#6b7280;">Ref #</td><td style="text-align:right;font-weight:600;">${patientLabel}</td></tr>` : ''}
          ${formattedDate ? `<tr><td style="padding:4px 0;color:#6b7280;">Date</td><td style="text-align:right;font-weight:600;">${formattedDate}</td></tr>` : ''}
          ${appointmentTime ? `<tr><td style="padding:4px 0;color:#6b7280;">Time</td><td style="text-align:right;font-weight:600;">${appointmentTime}</td></tr>` : ''}
          ${address && !billedToOrg ? `<tr><td style="padding:4px 0;color:#6b7280;">Location</td><td style="text-align:right;">${address}</td></tr>` : ''}
          <tr><td colspan="2" style="padding:8px 0 0;"><hr style="border:none;border-top:1px solid #fecaca;"></td></tr>
          <tr><td style="padding:8px 0;color:#B91C1C;font-weight:700;font-size:16px;">Amount Due</td><td style="text-align:right;font-weight:700;font-size:20px;color:#B91C1C;">$${(servicePrice || 0).toFixed(2)}</td></tr>
        </table>
      </div>

      <div style="text-align:center;margin:24px 0;">
        <a href="${paymentUrl}" style="display:inline-block;background:#B91C1C;color:white;padding:14px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">
          Pay Now — $${(servicePrice || 0).toFixed(2)}
        </a>
      </div>

      ${!billedToOrg ? `
      <div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:10px;padding:16px;margin:20px 0;">
        <p style="margin:0;font-size:13px;color:#92400e;font-weight:600;">Payment required within 12 hours</p>
        <p style="margin:6px 0 0;font-size:12px;color:#a16207;line-height:1.5;">
          Due to patient volume, payment must be received within 12 hours. If payment is not received, your appointment may be released to the next patient on standby.
        </p>
      </div>
      ` : `
      <p style="font-size:13px;color:#6b7280;margin:16px 0;">Net 30 terms. Questions on this invoice? Reply to this email or call (941) 527-9169.</p>
      `}

      ${isVip && !billedToOrg ? '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px;margin:16px 0;text-align:center;"><p style="margin:0;font-size:13px;color:#166534;font-weight:600;">VIP Patient — Priority Scheduling</p></div>' : ''}

      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="font-size:11px;color:#9ca3af;">ConveLabs Concierge Lab Services · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
        <p style="font-size:11px;color:#9ca3af;">Questions? Call (941) 527-9169</p>
      </div>
    </div>
  </div>
</body>
</html>`;

      const formData = new FormData();
      formData.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
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
