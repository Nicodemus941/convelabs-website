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
import { isSlotStillAvailable } from '../_shared/availability.ts';

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

// 100% mobile service — ConveLabs does not operate a walk-in lab. In-office
// was removed from the patient flow intentionally.
const MOBILE_PRICE_CENTS = 15000;

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
      access_token, appointment_date, appointment_time,
      address, patient_email_override, patient_phone_override, insurance_card_path,
    } = body || {};
    // service_type is always 'mobile' — we removed the in-office option
    const service_type = 'mobile';

    if (!access_token || !appointment_date || !appointment_time) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!address || String(address).trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Your address is required — we come to you' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
      .select('id, name, default_billed_to, member_stacking_rule, locked_price_cents, org_invoice_price_cents, show_patient_name_on_appointment, contact_email, billing_email, contact_phone, contact_name, time_window_rules')
      .eq('id', request.organization_id).maybeSingle();
    if (!org) return new Response(JSON.stringify({ error: 'Org not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // RACE-CONDITION GUARD: re-check the slot is still available at write time.
    // If a concurrent booking took it in the seconds between page-load and
    // submit, we return 409 so the patient picks a different slot.
    const stillOpen = await isSlotStillAvailable(admin, org.id, appointment_date, appointment_time, org.time_window_rules);
    if (!stillOpen) {
      return new Response(JSON.stringify({
        error: 'That slot was just taken. Please pick a different time.',
        slot_conflict: true,
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const orgCovers = org.default_billed_to === 'org' || org.member_stacking_rule === 'org_covers';
    const billedTo = orgCovers ? 'org' : 'patient';
    const effectivePriceCents = orgCovers
      ? 0
      : (org.locked_price_cents ?? MOBILE_PRICE_CENTS);

    // Normalize appointment_date to noon ET for TZ stability (matches other booking paths)
    const apptDateIso = `${appointment_date}T12:00:00-04:00`;

    // Opportunistic US ZIP parse from the address (5 or 9 digits at end)
    const zipMatch = String(address).match(/\b(\d{5})(?:-\d{4})?\b/);
    const parsedZip = zipMatch ? zipMatch[1] : null;

    const patientEmail = (patient_email_override || request.patient_email || '').toLowerCase() || null;
    const patientPhone = patient_phone_override || request.patient_phone || null;

    // Create the appointment
    const { data: appt, error: apptErr } = await admin.from('appointments').insert({
      patient_name: request.patient_name,
      patient_email: patientEmail,
      patient_phone: patientPhone,
      address: address.trim(),
      service_type: 'mobile',
      service_name: 'Mobile Blood Draw',
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
      zipcode: parsedZip,
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
              product_data: { name: 'Mobile Blood Draw' },
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
      <p style="margin:6px 0 0;font-size:14px;"><strong>Where:</strong> At patient's address (mobile)</p>
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

    // ── PATIENT CONFIRMATION EMAIL ──────────────────────────────────────
    if (patientEmail && MAILGUN_API_KEY) {
      try {
        const fastingBlock = request.fasting_required
          ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin:14px 0;"><strong style="color:#78350f;">🍽️ Fasting required</strong><p style="margin:4px 0 0;font-size:13px;color:#92400e;">Stop eating and drinking 8 hrs before your draw. Water is fine. We'll text you a full reminder at 8 PM the night before.</p></div>`
          : '';
        const panelBlock = (Array.isArray(request.lab_order_panels) && request.lab_order_panels.length > 0)
          ? `<p style="font-size:13px;color:#6b7280;margin:14px 0 4px;">PANELS ORDERED</p><div>${request.lab_order_panels.slice(0, 6).map((p: any) => `<span style="display:inline-block;background:#fef2f2;color:#B91C1C;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;margin:2px 3px 0 0;">${typeof p === 'string' ? p : p.name || ''}</span>`).join(' ')}</div>`
          : '';
        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#059669,#047857);color:#fff;padding:22px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="margin:0;font-size:20px;">✓ Your ConveLabs draw is booked</h1>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111827;">
    <p>Hi ${String(request.patient_name).split(' ')[0]},</p>
    <p>You're all set. Here's the recap:</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;">
      <p style="margin:0;"><strong>When:</strong> ${fmtDate(appointment_date)} at ${appointment_time}</p>
      <p style="margin:6px 0 0;"><strong>Where:</strong> ${String(address).trim()}</p>
      <p style="margin:6px 0 0;"><strong>Ordered by:</strong> ${org.name}</p>
    </div>
    ${fastingBlock}
    ${panelBlock}
    <p style="font-size:13px;color:#6b7280;margin-top:20px;">Need to reschedule? Email <a href="mailto:info@convelabs.com" style="color:#B91C1C;">info@convelabs.com</a> or call (941) 527-9169.</p>
    <div style="background:#f9fafb;border-radius:8px;padding:12px 14px;margin-top:14px;font-size:12px;color:#6b7280;">
      <strong>Our recollection guarantee:</strong> if ConveLabs causes a redraw, it's free. If the reference lab causes it, 50% off.
    </div>
    <p style="margin-top:20px;">— Nico at ConveLabs</p>
  </div>
</div>`;
        const fd = new FormData();
        fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
        fd.append('to', patientEmail);
        fd.append('subject', `✓ Booked: ${fmtDate(appointment_date)} at ${appointment_time}`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, { method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd });
      } catch (e) { console.warn('patient confirmation email failed:', e); }
    }

    // ── PATIENT CONFIRMATION SMS (includes fasting heads-up if applicable) ─
    // Sent now at booking time. The night-before fasting reminder cron will
    // also fire at 8 PM ET the day before — this one is the immediate
    // acknowledgement.
    const patientSmsPhone = patientPhone;
    if (patientSmsPhone) {
      try {
        const TWILIO_SID2 = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
        const TWILIO_TOKEN2 = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
        const TWILIO_FROM2 = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
        if (TWILIO_SID2 && TWILIO_TOKEN2 && TWILIO_FROM2) {
          const fastingLine = request.fasting_required
            ? ` FASTING: stop eating/drinking (water OK) 8 hrs before (e.g., for 8am draw, stop by midnight).`
            : '';
          const smsBody = `ConveLabs: ✓ Booked for ${fmtDate(appointment_date)} at ${appointment_time}. We'll text a reminder the night before.${fastingLine} Questions? Reply HELP.`;
          function normPhone(p: string): string {
            const d = p.replace(/\D/g, '');
            if (d.length === 10) return `+1${d}`;
            if (d.length === 11 && d.startsWith('1')) return `+${d}`;
            if (p.startsWith('+')) return p;
            return `+${d}`;
          }
          const twilioAuth = btoa(`${TWILIO_SID2}:${TWILIO_TOKEN2}`);
          const fd = new URLSearchParams({ To: normPhone(patientSmsPhone), From: TWILIO_FROM2, Body: smsBody });
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID2}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd.toString(),
          });
          await admin.from('appointments').update({ patient_confirmation_sent_at: new Date().toISOString() }).eq('id', appt.id);
        }
      } catch (e) { console.warn('patient confirmation SMS failed:', e); }
    }

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
