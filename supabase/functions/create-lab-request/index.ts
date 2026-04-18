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
      next_doctor_appt_notes, admin_notes,
    } = body || {};

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
      fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
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
    if (patient_phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      try {
        const smsBody = `ConveLabs: ${providerDisplayName.split(' ').slice(-1)[0]} at ${org.name} ordered your bloodwork by ${fmtDate(draw_by_date).replace(',', '')}${next_doctor_appt_date ? ` (before your ${fmtDate(next_doctor_appt_date).replace(',', '')} visit)` : ''}. Book: ${patientUrl}`;
        const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
        const fd = new URLSearchParams({ To: normalizePhone(patient_phone), From: TWILIO_FROM, Body: smsBody });
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: fd.toString(),
        });
      } catch (e) { console.warn('SMS send failed:', e); }
    }

    await admin.from('patient_lab_requests').update({ patient_notified_at: new Date().toISOString() }).eq('id', inserted.id);

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
