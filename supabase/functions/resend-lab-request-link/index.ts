/**
 * RESEND-LAB-REQUEST-LINK
 *
 * Admin-fired: pull a patient_lab_requests row by id, send a fresh
 * SMS+email with the existing access_token. Use case: original SMS
 * lost, patient never booked, admin wants to nudge again without
 * canceling+recreating the lab request.
 *
 * Body: { lab_request_id }
 * verify_jwt=false (gated by row existence + status checks)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

function normPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return p.startsWith('+') ? p : `+${d}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  try {
    const { lab_request_id } = await req.json().catch(() => ({}));
    if (!lab_request_id) {
      return new Response(JSON.stringify({ error: 'lab_request_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: lr } = await admin
      .from('patient_lab_requests')
      .select('id, patient_name, patient_email, patient_phone, access_token, status, organization_id, draw_by_date')
      .eq('id', lab_request_id)
      .maybeSingle();
    if (!lr) {
      return new Response(JSON.stringify({ error: 'lab_request_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (lr.status !== 'pending_schedule') {
      return new Response(JSON.stringify({ error: 'not_pending', status: lr.status }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: org } = await admin
      .from('organizations').select('id, name, default_billed_to, member_stacking_rule')
      .eq('id', lr.organization_id).maybeSingle();
    const orgCovers = org?.default_billed_to === 'org' || org?.member_stacking_rule === 'org_covers';

    const url = `${PUBLIC_SITE_URL}/lab-request/${lr.access_token}`;
    const firstName = String(lr.patient_name || 'there').split(' ')[0];
    const drawShort = lr.draw_by_date
      ? new Date(String(lr.draw_by_date) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : '';
    const orgLine = org?.name ? `${org.name} ordered your bloodwork` : 'Your provider ordered bloodwork';
    const coverLine = orgCovers && org?.name ? ` ${org.name} is covering the cost — no payment at booking.` : '';
    const drawLine = drawShort ? ` Please schedule before ${drawShort}.` : '';

    let smsSent = false, emailSent = false;
    if (lr.patient_phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      const body = `Hi ${firstName} — ConveLabs.${orgLine}.${coverLine}${drawLine} Your booking link: ${url}`;
      const fd = new URLSearchParams({ To: normPhone(lr.patient_phone), From: TWILIO_FROM, Body: body });
      const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fd.toString(),
      });
      smsSent = tw.ok;
    }
    if (lr.patient_email && MAILGUN_API_KEY) {
      const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:22px 24px;text-align:center;"><h1 style="margin:0;font-size:20px;">Your ConveLabs booking link</h1></div>
  <div style="padding:24px;line-height:1.6;color:#111827;">
    <p>Hi ${firstName},</p>
    <p>${orgLine}.${coverLine}${drawLine}</p>
    <p style="text-align:center;margin:22px 0;"><a href="${url}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;">📅 Pick my time →</a></p>
    <p style="font-size:13px;color:#6b7280;">Mobile draws — we come to you. Questions? <a href="mailto:info@convelabs.com">info@convelabs.com</a> · (941) 527-9169</p>
  </div>
</div>`;
      const fd = new FormData();
      fd.append('from', `Nicodemme Jean-Baptiste <info@convelabs.com>`);
      fd.append('to', lr.patient_email);
      fd.append('subject', `${org?.name || 'Your provider'} ordered your bloodwork — book your draw`);
      fd.append('html', html);
      const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: fd,
      });
      emailSent = mg.ok;
    }
    await admin.from('patient_lab_requests').update({ patient_notified_at: new Date().toISOString() }).eq('id', lr.id);
    return new Response(JSON.stringify({ ok: true, sms_sent: smsSent, email_sent: emailSent, url }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[resend-lab-request-link] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
