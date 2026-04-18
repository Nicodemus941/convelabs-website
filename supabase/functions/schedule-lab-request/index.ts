// schedule-lab-request
// Patient books via the token. Creates an appointment, copies the lab
// order file path, links the lab_request, notifies the provider, and
// (if patient owes money) returns a Stripe checkout URL.
//
// Request: { access_token, service_type ('mobile' | 'in-office'),
//            appointment_date (YYYY-MM-DD), appointment_time (HH:MM AM/PM),
//            address?, patient_email_override?, patient_phone_override?,
//            insurance_card_path? }
// Response: { success: true, appointment_id, stripe_url? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

// Mobile vs in-office default pricing (same as main booking flow).
const PRICING: Record<string, number> = { 'mobile': 15000, 'in-office': 5500 };

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const {
      access_token, service_type, appointment_date, appointment_time,
      address, patient_email_override, patient_phone_override, insurance_card_path,
    } = body || {};

    if (!access_token || !service_type || !appointment_date || !appointment_time) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!['mobile', 'in-office'].includes(service_type)) {
      return new Response(JSON.stringify({ error: 'Invalid service_type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (service_type === 'mobile' && !address) {
      return new Response(JSON.stringify({ error: 'Address required for mobile visits' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load lab request
    const { data: request } = await admin
      .from('patient_lab_requests')
      .select('*')
      .eq('access_token', access_token)
      .maybeSingle();
    if (!request) return new Response(JSON.stringify({ error: 'Invalid link' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (request.status !== 'pending_schedule') return new Response(JSON.stringify({ error: 'This request has already been scheduled or is no longer active.' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (new Date(request.access_token_expires_at) < new Date()) return new Response(JSON.stringify({ error: 'This link has expired' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Load org + billing rules
    const { data: org } = await admin.from('organizations')
      .select('id, name, default_billed_to, member_stacking_rule, locked_price_cents, org_invoice_price_cents, show_patient_name_on_appointment, contact_email, billing_email, contact_phone, contact_name')
      .eq('id', request.organization_id).maybeSingle();
    if (!org) return new Response(JSON.stringify({ error: 'Org not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const orgCovers = org.default_billed_to === 'org' || org.member_stacking_rule === 'org_covers';
    const billedTo = orgCovers ? 'org' : 'patient';
    const effectivePriceCents = orgCovers
      ? 0
      : (org.locked_price_cents ?? PRICING[service_type] ?? 15000);

    // Normalize appointment_date to noon ET for TZ stability (matches other booking paths)
    const apptDateIso = `${appointment_date}T12:00:00-04:00`;

    const patientEmail = (patient_email_override || request.patient_email || '').toLowerCase() || null;
    const patientPhone = patient_phone_override || request.patient_phone || null;

    // Create the appointment
    const { data: appt, error: apptErr } = await admin.from('appointments').insert({
      patient_name: request.patient_name,
      patient_email: patientEmail,
      patient_phone: patientPhone,
      address: service_type === 'mobile' ? address : '1800 Pembrook Drive, Suite 300, Orlando, FL 32810',
      service_type,
      service_name: service_type === 'mobile' ? 'Mobile Blood Draw' : 'In-Office Visit',
      appointment_date: apptDateIso,
      appointment_time,
      total_amount: effectivePriceCents / 100,
      status: 'scheduled',
      payment_status: orgCovers ? 'org_billed' : 'pending',
      organization_id: org.id,
      billed_to: billedTo,
      patient_name_masked: org.show_patient_name_on_appointment === false,
      lab_order_file_path: request.lab_order_file_path,
      lab_order_panels: request.lab_order_panels,
      lab_order_full_text: request.lab_order_full_text,
      fasting_required: request.fasting_required,
      urine_required: request.urine_required,
      gtt_required: request.gtt_required,
      insurance_card_path: insurance_card_path || null,
      lab_request_id: request.id,
      notes: request.admin_notes
        ? `[Lab request by ${org.name}] ${request.admin_notes}`
        : `[Lab request by ${org.name}]`,
    }).select('*').single();

    if (apptErr || !appt) {
      console.error('Appointment insert failed:', apptErr);
      return new Response(JSON.stringify({ error: apptErr?.message || 'Failed to schedule' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Mark the lab request as scheduled
    await admin.from('patient_lab_requests').update({
      status: 'scheduled',
      appointment_id: appt.id,
      patient_scheduled_at: new Date().toISOString(),
    }).eq('id', request.id);

    // ── If patient owes money, create Stripe Checkout session ─────────────
    let stripeUrl: string | null = null;
    if (!orgCovers && effectivePriceCents > 0 && patientEmail) {
      try {
        // Find or create Stripe customer for this patient (scoped to patient-only customer — never collides with org customer)
        const existing = await stripe.customers.list({ email: patientEmail, limit: 5 });
        const patientCustomer = existing.data.find(c => !(c.metadata?.convelabs_org_id)) || null;
        let customerId: string;
        if (patientCustomer) customerId = patientCustomer.id;
        else {
          const c = await stripe.customers.create({ email: patientEmail, name: request.patient_name, phone: patientPhone || undefined, metadata: { source: 'patient_billing_lab_request', appointment_id: appt.id } });
          customerId = c.id;
        }

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer: customerId,
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: { name: service_type === 'mobile' ? 'Mobile Blood Draw' : 'In-Office Visit' },
              unit_amount: effectivePriceCents,
            },
            quantity: 1,
          }],
          success_url: `${PUBLIC_SITE_URL}/lab-request/${access_token}?scheduled=1&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${PUBLIC_SITE_URL}/lab-request/${access_token}?cancel=1`,
          metadata: {
            appointment_id: appt.id,
            lab_request_id: request.id,
            organization_id: org.id,
          },
        });
        stripeUrl = session.url || null;
      } catch (e: any) {
        console.error('Stripe session create failed:', e);
        // Non-fatal — appointment still scheduled, admin can invoice later
      }
    }

    // ── Notify provider ──────────────────────────────────────────────────
    const providerEmail = org.contact_email || org.billing_email;
    if (providerEmail && MAILGUN_API_KEY) {
      try {
        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#059669,#047857);color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="margin:0;font-size:19px;">✓ ${request.patient_name} just booked</h1>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;">
    <p>Hi ${org.contact_name || org.name},</p>
    <p><strong>${request.patient_name}</strong> scheduled their lab draw.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin:16px 0;">
      <p style="margin:0;font-size:14px;"><strong>When:</strong> ${fmtDate(appointment_date)} at ${appointment_time}</p>
      <p style="margin:6px 0 0;font-size:14px;"><strong>Where:</strong> ${service_type === 'mobile' ? 'At patient\'s address' : 'ConveLabs Maitland office'}</p>
      ${request.next_doctor_appt_date ? `<p style="margin:6px 0 0;font-size:13px;color:#166534;">In time for their ${fmtDate(request.next_doctor_appt_date)} visit with you ✓</p>` : ''}
    </div>
    <div style="text-align:center;margin:22px 0;">
      <a href="${PUBLIC_SITE_URL}/dashboard/provider" style="display:inline-block;background:#B91C1C;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View in your portal →</a>
    </div>
    <p style="font-size:13px;color:#6b7280;">You'll get another notification when the draw is completed and the specimen is delivered to the reference lab.</p>
    <p style="margin-top:18px;">— Nico</p>
  </div>
</div>`;
        const fd = new FormData();
        fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
        fd.append('to', providerEmail);
        fd.append('subject', `✓ ${request.patient_name} booked: ${fmtDate(appointment_date)} at ${appointment_time}`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: fd,
        });
      } catch (e) { console.warn('provider email failed:', e); }
    }

    await admin.from('patient_lab_requests').update({ provider_notified_at: new Date().toISOString() }).eq('id', request.id);

    return new Response(JSON.stringify({
      success: true,
      appointment_id: appt.id,
      stripe_url: stripeUrl,
      org_covers: orgCovers,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('schedule-lab-request error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
