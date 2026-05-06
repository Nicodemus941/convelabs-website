// create-lab-request
// Provider-initiated: create a lab request for one of their org's patients.
// Runs OCR on the uploaded lab order, sends patient email (Mailgun) + SMS (Twilio).
//
// Auth: caller must be role='provider' + org_id in metadata matching organization_id in body.
// Request: { organization_id, patient_name, patient_email?, patient_phone?,
//            lab_order_file_path?, draw_by_date, next_doctor_appt_date?,
//            next_doctor_appt_notes?, admin_notes? }
// Response: { success: true, request_id, access_token, patient_url }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });
// 100% mobile mirror of schedule-lab-request — keep these in sync
const MOBILE_PRICE_CENTS = 15000;
// NOTE: these used to import from ../_shared/. Inlined below because the MCP
// edge-function deploy path doesn't bundle relative module imports cleanly.
// Single source of truth for the library versions still lives at
// supabase/functions/_shared/availability.ts and _shared/preoffered-slots.ts —
// keep these two copies in sync with the originals when that file changes.

type SupabaseClient = ReturnType<typeof createClient>;

interface Slot { date: string; time: string; label: string }

function fmtTime(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}
function baseGrid(): string[] {
  const g: string[] = [];
  for (let h = 6; h < 12; h++) { g.push(fmtTime(h, 0)); g.push(fmtTime(h, 30)); }
  return g;
}
function nowET(): Date { return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })); }
function isoDate(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseTime(t: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  if (!m) return { h: 0, m: 0 };
  let h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10);
  const p = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return { h, m: mn };
}
function slotsAllowedForDate(dateIso: string, rules: any): string[] {
  const grid = baseGrid();
  const date = new Date(dateIso + 'T12:00:00');
  const dow = date.getDay();
  if (!Array.isArray(rules) || rules.length === 0) return dow === 0 ? [] : grid;
  const rule = rules.find((r: any) => Array.isArray(r.dayOfWeek) && r.dayOfWeek.includes(dow));
  if (!rule) return [];
  return grid.filter(t => {
    const { h, m } = parseTime(t);
    const total = h * 60 + m;
    return total >= rule.startHour * 60 && total < rule.endHour * 60;
  });
}
async function getAvailableSlotsForDate(sb: SupabaseClient, _orgId: string, dateIso: string, rules: any) {
  const allowed = slotsAllowedForDate(dateIso, rules);
  if (allowed.length === 0) return baseGrid().map(t => ({ time: t, available: false }));
  const dayStart = `${dateIso}T00:00:00`;
  const dayEnd = `${dateIso}T23:59:59`;
  const [apptResp, blockResp] = await Promise.all([
    sb.from('appointments').select('appointment_time, status, duration_minutes, service_type').gte('appointment_date', dayStart).lte('appointment_date', dayEnd).neq('status', 'cancelled'),
    sb.from('time_blocks' as any).select('start_date, end_date').lte('start_date', dateIso).gte('end_date', dateIso),
  ]);
  const BUF = 30, DUR = 30, FOOTPRINT = DUR + BUF;
  const isBooked = (t: string): boolean => {
    const { h: th, m: tm } = parseTime(t); const sMin = th * 60 + tm;
    for (const a of apptResp.data || []) {
      if (!a.appointment_time) continue;
      const { h, m } = parseTime(String(a.appointment_time));
      const aStart = h * 60 + m;
      const dur = (a.duration_minutes && a.duration_minutes > 0) ? a.duration_minutes : DUR;
      const buf = a.service_type === 'in-office' ? 0 : BUF;
      const aEnd = aStart + dur + buf;
      if (sMin >= aStart && sMin < aEnd) return true;
      if (sMin > aStart - FOOTPRINT && sMin < aStart) return true;
    }
    return false;
  };
  const fullyBlocked = (blockResp.data || []).length > 0;
  const now = nowET();
  const isToday = isoDate(now) === dateIso;
  const hasLead = (t: string) => {
    if (!isToday) return true;
    const { h, m } = parseTime(t); return (h * 60 + m) >= (now.getHours() * 60 + now.getMinutes()) + 120;
  };
  return baseGrid().map(t => {
    if (fullyBlocked) return { time: t, available: false };
    if (!allowed.includes(t)) return { time: t, available: false };
    if (!hasLead(t)) return { time: t, available: false };
    if (isBooked(t)) return { time: t, available: false };
    return { time: t, available: true };
  });
}
async function nextAvailableSlots(sb: SupabaseClient, orgId: string, drawByIso: string, rules: any, count = 3): Promise<Slot[]> {
  const results: Slot[] = [];
  const drawBy = new Date(drawByIso + 'T23:59:59');
  const d = new Date(nowET()); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0);
  while (results.length < count && d.getTime() <= drawBy.getTime()) {
    const di = isoDate(d);
    const slots = await getAvailableSlotsForDate(sb, orgId, di, rules);
    const first = slots.find(s => s.available);
    if (first) {
      const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      results.push({ date: di, time: first.time, label: `${dateLabel} ${first.time.replace(':00 ', '').toLowerCase()}` });
    }
    d.setDate(d.getDate() + 1);
  }
  return results;
}
function formatSlotsForSms(slots: Slot[]): string {
  if (slots.length === 0) return '';
  return slots.map((s, i) => `${i + 1}) ${s.label}`).join(' · ');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

function daysBetween(iso: string): number {
  const d = new Date(iso); const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userResp } = await admin.auth.getUser(token);
    const user = userResp?.user;
    if (!user || user.user_metadata?.role !== 'provider') {
      return new Response(JSON.stringify({ error: 'Not a provider' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const {
      organization_id, patient_name, patient_email, patient_phone,
      lab_order_file_path, draw_by_date, next_doctor_appt_date,
      next_doctor_appt_notes, admin_notes, billed_to,
    } = body || {};

    // Validate billed_to if provided
    const billedToClean: 'org' | 'patient' | null =
      billed_to === 'org' || billed_to === 'patient' ? billed_to : null;

    if (!organization_id || !patient_name || !draw_by_date) {
      return new Response(JSON.stringify({ error: 'organization_id, patient_name, draw_by_date required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (user.user_metadata.org_id !== organization_id) {
      return new Response(JSON.stringify({ error: 'Cannot create lab request for another org' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!patient_email && !patient_phone) {
      return new Response(JSON.stringify({ error: 'At least one of patient_email or patient_phone required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: org } = await admin.from('organizations')
      .select('id, name, contact_name, default_billed_to, member_stacking_rule, locked_price_cents, org_invoice_price_cents, show_patient_name_on_appointment')
      .eq('id', organization_id).eq('is_active', true).maybeSingle();
    if (!org) return new Response(JSON.stringify({ error: 'Org not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Run OCR on the uploaded lab order if provided (non-blocking — we store nothing special if it fails)
    let detectedPanels: any[] = [];
    let fullText = '';
    let fasting = false, urine = false, gtt = false;
    if (lab_order_file_path) {
      try {
        const ocrResp = await fetch(`${SUPABASE_URL}/functions/v1/ocr-lab-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ filePath: lab_order_file_path }),
        });
        if (ocrResp.ok) {
          const ocr = await ocrResp.json();
          detectedPanels = ocr.panels || [];
          fullText = ocr.fullText || '';
          fasting = !!ocr.fastingRequired;
          urine = !!ocr.urineRequired;
          gtt = !!ocr.gttRequired;
        }
      } catch (e) { console.warn('OCR failed (non-blocking):', e); }
    }

    // Generate one-time token
    const accessToken = crypto.randomUUID() + '-' + crypto.randomUUID().split('-')[0];

    const { data: inserted, error: insErr } = await admin
      .from('patient_lab_requests')
      .insert({
        organization_id,
        created_by: user.id,
        patient_name: patient_name.trim(),
        patient_email: patient_email?.trim().toLowerCase() || null,
        patient_phone: patient_phone?.trim() || null,
        lab_order_file_path: lab_order_file_path || null,
        lab_order_panels: detectedPanels,
        lab_order_full_text: fullText || null,
        fasting_required: fasting,
        urine_required: urine,
        gtt_required: gtt,
        draw_by_date,
        next_doctor_appt_date: next_doctor_appt_date || null,
        next_doctor_appt_notes: next_doctor_appt_notes?.trim() || null,
        admin_notes: admin_notes?.trim() || null,
        access_token: accessToken,
        billed_to: billedToClean,
      })
      .select('*')
      .single();
    if (insErr) {
      console.error('Insert failed:', insErr);
      return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const patientUrl = `${PUBLIC_SITE_URL}/lab-request/${accessToken}`;
    const daysLeft = daysBetween(draw_by_date);
    const urgency = daysLeft <= 2 ? 'URGENT' : daysLeft <= 7 ? 'time-sensitive' : 'ready when you are';
    const providerDisplayName = user.user_metadata?.full_name || org.contact_name || `Your provider at ${org.name}`;
    const patientFirstName = patient_name.split(' ')[0];

    // ── ORG-PAYS BRANCH ─────────────────────────────────────────────────
    // If the org covers the visit (set on the org's default_billed_to or an
    // explicit billed_to='org' override on this request), redirect the
    // submitting provider to Stripe Checkout to collect payment NOW. We
    // hold the patient SMS/email until Stripe confirms the org has paid —
    // the webhook (handleLabRequestProviderPayment) flips org_payment_status
    // to 'paid' and fires the deferred patient notifications. Patient sees
    // a "covered by your provider — just pick a time" message at booking.
    const effectiveBilling: 'org' | 'patient' = billedToClean
      || (org.default_billed_to === 'org' || org.member_stacking_rule === 'org_covers' ? 'org' : 'patient');
    const orgPays = effectiveBilling === 'org';

    if (orgPays) {
      const orgChargeCents = (org.org_invoice_price_cents
        ?? org.locked_price_cents
        ?? MOBILE_PRICE_CENTS) as number;

      let stripeUrl: string | null = null;
      try {
        // Find or create a Stripe customer for this org so future invoices
        // group under one customer record.
        const orgEmail = (user.email || '').toLowerCase() || null;
        let customerId: string | null = null;
        if (orgEmail) {
          const found = await stripe.customers.list({ email: orgEmail, limit: 5 });
          const orgCustomer = found.data.find(c => c.metadata?.convelabs_org_id === organization_id);
          if (orgCustomer) customerId = orgCustomer.id;
          else {
            const c = await stripe.customers.create({
              email: orgEmail,
              name: org.name,
              metadata: { convelabs_org_id: organization_id, source: 'create_lab_request_org_pay' },
            });
            customerId = c.id;
          }
        }

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer: customerId || undefined,
          customer_email: customerId ? undefined : orgEmail || undefined,
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Mobile Blood Draw — ${patient_name}`,
                description: `Covered by ${org.name} on behalf of ${patient_name}`,
              },
              unit_amount: orgChargeCents,
            },
            quantity: 1,
          }],
          success_url: `${PUBLIC_SITE_URL}/dashboard/provider?lab_request_paid=${inserted.id}`,
          cancel_url: `${PUBLIC_SITE_URL}/dashboard/provider?lab_request_payment_cancelled=${inserted.id}`,
          metadata: {
            lab_request_id: inserted.id,
            organization_id,
            patient_name,
            org_pays: 'true',
            // Distinguishes this branch in the stripe-webhook switch
            convelabs_flow: 'lab_request_org_pay',
          },
          payment_intent_data: {
            metadata: {
              lab_request_id: inserted.id,
              organization_id,
              convelabs_flow: 'lab_request_org_pay',
            },
          },
        });
        stripeUrl = session.url || null;

        await admin.from('patient_lab_requests').update({
          provider_payment_status: 'pending',
          provider_stripe_session_id: session.id,
          provider_payment_cents: orgChargeCents,
          billed_to: 'org',
          // Patient_notified_at stays NULL — the webhook fires the notify
          // call once payment completes. Status stays 'pending_schedule'
          // (or whatever the default is) so the public lab-request page
          // is functional but admin can see who's gated on org payment.
          status: 'pending_payment',
        }).eq('id', inserted.id);

        // Return EARLY — do not send patient SMS/email yet. Aliases both
        // the new (`requires_org_payment` / `stripe_url`) and the legacy
        // (`provider_pay_now` / `provider_checkout_url`) response keys so
        // the existing CreateLabRequestModal redirect handler keeps working.
        return new Response(JSON.stringify({
          success: true,
          request_id: inserted.id,
          access_token: accessToken,
          patient_url: patientUrl,
          requires_org_payment: true,
          stripe_url: stripeUrl,
          provider_pay_now: true,
          provider_checkout_url: stripeUrl,
          amount_cents: orgChargeCents,
          message: 'Lab request created. Redirecting to Stripe to collect organization payment. Patient will be notified once payment completes.',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (stripeErr: any) {
        console.error('[create-lab-request] Stripe session create failed:', stripeErr?.message);
        // If Stripe fails, fall through to the normal patient-notify path
        // so the lab request isn't lost. Admin can manually invoice later.
        await admin.from('patient_lab_requests').update({
          provider_payment_status: 'failed',
          status: 'pending_schedule',
          billed_to: 'org',
        }).eq('id', inserted.id);
      }
    }

    // Was the visit covered? Used downstream in patient SMS/email copy.
    // For the inline path (patient pays), this is `false`. The webhook
    // path that fires after org-payment-completed sends a separate copy
    // with `covered=true`.
    const coveredByOrg = orgPays;
    const coveredLine = coveredByOrg
      ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:10px 14px;margin:14px 0;font-size:13px;color:#065f46;"><strong>✓ Covered by ${org.name}</strong> — no payment needed at booking. Just pick a time.</div>`
      : '';
    const smsCoverPart = coveredByOrg ? ` ${org.name} is covering this visit — no payment needed at booking.` : '';

    // ── EMAIL ────────────────────────────────────────────────────────────
    if (patient_email && MAILGUN_API_KEY) {
      const panelChips = detectedPanels.slice(0, 8).map((p: any) =>
        `<span style="display:inline-block;background:#fef2f2;color:#B91C1C;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;margin:2px 3px 0 0;">${typeof p === 'string' ? p : p.name || ''}</span>`
      ).join(' ');
      const urgencyColor = daysLeft <= 2 ? '#B91C1C' : daysLeft <= 7 ? '#D97706' : '#059669';
      const prepNotes = [
        fasting ? '⚠️ Fasting required (12hrs, water only)' : '',
        urine ? '💧 Urine specimen required' : '',
        gtt ? '🧪 Glucose tolerance — allow 2–3 hours' : '',
      ].filter(Boolean).join('<br>');

      const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;margin:0;padding:20px;background:#f4f4f5;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);color:#fff;padding:24px 28px;text-align:center;">
    <h1 style="margin:0;font-size:22px;">${providerDisplayName} ordered your bloodwork</h1>
    <p style="margin:4px 0 0;color:#fecaca;font-size:13px;">ConveLabs Concierge Lab Services</p>
  </div>
  <div style="padding:28px;line-height:1.6;color:#111827;">
    <p>Hi ${patientFirstName},</p>
    <p><strong>${org.name}</strong> requested bloodwork for you. ${next_doctor_appt_date ? `Your next visit with them is <strong>${fmtDate(next_doctor_appt_date)}</strong> — results need to be in their hands before then.` : ''}</p>

    <div style="background:${urgencyColor}15;border-left:4px solid ${urgencyColor};border-radius:8px;padding:14px 18px;margin:18px 0;">
      <p style="margin:0;font-size:14px;color:${urgencyColor};font-weight:700;">${daysLeft <= 2 ? '🔴 URGENT' : daysLeft <= 7 ? '🟡 Time-sensitive' : '🟢 Ready when you are'}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#111827;">Draw by <strong>${fmtDate(draw_by_date)}</strong> · ${daysLeft} day${daysLeft === 1 ? '' : 's'} from now.</p>
    </div>

    ${detectedPanels.length > 0 ? `
    <p style="font-size:13px;color:#6b7280;margin:18px 0 6px;">WHAT YOUR PROVIDER ORDERED</p>
    <div>${panelChips}</div>
    ${prepNotes ? `<p style="font-size:13px;color:#78350f;background:#fef3c7;border-radius:8px;padding:10px 14px;margin:12px 0;">${prepNotes}</p>` : ''}
    ` : ''}

    ${coveredLine}
    ${admin_notes ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#374151;"><strong>Note from ${org.name}:</strong> ${admin_notes}</div>` : ''}

    <div style="text-align:center;margin:28px 0;">
      <a href="${patientUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:15px 42px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">📅 Book my draw (90 seconds) →</a>
    </div>

    <p style="font-size:13px;color:#6b7280;">We come to you (mobile) or you can visit our Maitland office — your choice at booking.</p>

    <p style="margin-top:24px;">Questions? Email <a href="mailto:info@convelabs.com" style="color:#B91C1C;">info@convelabs.com</a> or call (941) 527-9169.</p>

    <p style="margin-top:16px;">— Nicodemme "Nico" Jean-Baptiste<br><em>Founder, ConveLabs Concierge Lab Services</em></p>
  </div>
  <div style="background:#f9fafb;padding:14px 28px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;">
    This link is specific to you and expires in 14 days. ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810
  </div>
</div></body></html>`;

      const fd = new FormData();
      fd.append('from', `Nicodemme Jean-Baptiste <info@convelabs.com>`);
      fd.append('to', patient_email);
      fd.append('subject', `${providerDisplayName} ordered your bloodwork — ${daysLeft}d to book`);
      fd.append('html', html);
      fd.append('o:tracking-clicks', 'no');
      await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: fd,
      });
    }

    // ── SMS ──────────────────────────────────────────────────────────────
    // Authentic, warm, professional. Frames the patient's appointment as
    // exclusive: "your private booking link." No "Reply 1/2/3" friction.
    if (patient_phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      try {
        const drawShort = fmtDate(draw_by_date).replace(',', '');
        const nextShort = next_doctor_appt_date ? fmtDate(next_doctor_appt_date).replace(',', '') : '';
        const fastingPart = fasting ? ' Fasting required — no food 12h before.' : '';
        const nextVisitPart = nextShort ? ` to have results ready for your ${nextShort} visit` : '';
        const smsBody = `Hi ${patientFirstName} — this is ConveLabs. ${org.name} has ordered your bloodwork through us.${smsCoverPart}${fastingPart} Please schedule before ${drawShort}${nextVisitPart}. Your private booking link: ${patientUrl} · We look forward to serving you.`;
        const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
        const fd = new URLSearchParams({ To: normalizePhone(patient_phone), From: TWILIO_FROM, Body: smsBody });
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: fd.toString(),
        });
      } catch (e) { console.warn('SMS send failed:', e); }
    }

    await admin.from('patient_lab_requests').update({
      patient_notified_at: new Date().toISOString(),
    }).eq('id', inserted.id);

    return new Response(JSON.stringify({
      success: true,
      request_id: inserted.id,
      access_token: accessToken,
      patient_url: patientUrl,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('create-lab-request error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
