// send-reschedule-link
//
// Admin/phleb-triggered: texts + emails the patient a self-reschedule magic
// link (/appt/:view_token/confirm). The link is the patient's existing
// appointment view_token — no new token needed. Returns only { ok } (no PII to
// the caller). Body: { appointment_id }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ORIGIN = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function normPhone(p: string) {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return p.startsWith('+') ? p : `+${d}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const apptId = String(body?.appointment_id || '');
    if (!apptId) return j({ error: 'appointment_id required' }, 400);

    const { data: appt } = await admin
      .from('appointments')
      .select('id, view_token, patient_name, patient_email, patient_phone, appointment_date, appointment_time, status')
      .eq('id', apptId)
      .maybeSingle();
    if (!appt) return j({ error: 'not_found' }, 404);
    if (['cancelled', 'completed', 'no_show'].includes(String(appt.status))) {
      return j({ error: 'not_reschedulable', status: appt.status }, 409);
    }
    if (!appt.view_token) return j({ error: 'no_token' }, 409);

    const link = `${ORIGIN}/appt/${appt.view_token}/confirm`;
    const first = String(appt.patient_name || 'there').split(' ')[0];
    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

    let smsOk = false, emailOk = false;
    const phone = String(appt.patient_phone || '').trim();
    const email = String(appt.patient_email || '').trim();

    if (phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      const smsBody = `ConveLabs: need to change your visit? Pick a new time here: ${link} (moves within 24h have a $25 fee — free for members).`;
      try {
        const fd = new URLSearchParams({ To: normPhone(phone), From: TWILIO_FROM, Body: smsBody });
        const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: fd.toString(),
        });
        smsOk = tw.ok;
        let sid: string | null = null; try { sid = (await tw.json())?.sid || null; } catch { /* */ }
        await admin.from('sms_notifications').insert({
          appointment_id: appt.id, notification_type: 'reschedule_link',
          phone_number: normPhone(phone), message_content: smsBody.substring(0, 1500),
          sent_at: new Date().toISOString(), delivery_status: smsOk ? 'sent' : 'failed',
          twilio_message_sid: sid, metadata: { source: 'send-reschedule-link' },
        });
      } catch (e) { console.warn('[send-reschedule-link] sms err:', e); }
    }

    if (email && MAILGUN_API_KEY) {
      const subject = `Reschedule your ConveLabs visit`;
      const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#7f1d1d,#9f1239);color:#fff;padding:22px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="margin:0;font-size:20px;">Need to change your visit?</h1></div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111827;">
    <p>Hi ${first},</p>
    <p>Pick a new day and time for your visit in a couple of taps:</p>
    <p style="text-align:center;margin:22px 0;"><a href="${link}" style="background:#7f1d1d;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:11px;display:inline-block;">Reschedule my visit →</a></p>
    <p style="font-size:13px;color:#6b7280;">Moves within 24 hours of your appointment have a $25 fee — waived for members. Questions? Call (941) 527-9169.</p>
    <p style="margin-top:18px;">— Nico at ConveLabs</p>
  </div>
</div>`;
      try {
        const fd = new FormData();
        fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
        fd.append('to', email);
        fd.append('subject', subject);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd,
        });
        emailOk = mg.ok;
        let mgId: string | null = null; try { mgId = (await mg.json())?.id || null; } catch { /* */ }
        await admin.from('email_send_log').insert({
          appointment_id: appt.id, to_email: email, email_type: 'reschedule_link',
          subject, sent_at: new Date().toISOString(), status: emailOk ? 'sent' : 'failed',
          mailgun_id: mgId, campaign_tag: 'reschedule_link',
        });
      } catch (e) { console.warn('[send-reschedule-link] email err:', e); }
    }

    if (!smsOk && !emailOk) return j({ error: 'no_channel', detail: 'No phone or email on file, or sends failed.' }, 422);
    return j({ ok: true, sms: smsOk, email: emailOk });
  } catch (e: any) {
    console.error('[send-reschedule-link] error:', e?.message || e);
    return j({ error: e?.message || String(e) }, 500);
  }
});
