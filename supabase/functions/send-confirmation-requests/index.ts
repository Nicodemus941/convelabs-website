/**
 * SEND-CONFIRMATION-REQUESTS — hourly cron (offset :13 to spread load)
 *
 * Picks up appointments scheduled 36–60h from now that:
 *   - Are status 'scheduled' or 'confirmed'
 *   - Haven't been explicitly confirmed by the patient (patient_confirmed_at IS NULL)
 *   - Haven't received a confirmation request yet (confirmation_send_count = 0)
 *
 * Sends SMS + email with three actions: Confirm / Reschedule / Cancel.
 * All three route to /appt/:view_token/confirm where the patient taps.
 *
 * Quiet-hours gated.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { shouldSendNow } from '../_shared/quiet-hours.ts';

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
function fmtAppt(dateIso: string, time?: string | null): string {
  const d = new Date(String(dateIso).substring(0, 10) + 'T12:00:00');
  const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return time ? `${day} at ${time}` : day;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!shouldSendNow('post_visit')) {
      return new Response(JSON.stringify({ ok: true, deferred: true, reason: 'quiet_hours' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Window: 36–60h from now (catches both ~48h-before and stragglers
    // from the previous quiet-hours block)
    const lower = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
    const upper = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString();

    const { data: candidates } = await admin
      .from('appointments')
      .select('id, view_token, patient_name, patient_email, patient_phone, appointment_date, appointment_time, address, status, confirmation_send_count')
      .gte('appointment_date', lower)
      .lt('appointment_date', upper)
      .in('status', ['scheduled', 'confirmed'])
      .is('patient_confirmed_at', null)
      .eq('confirmation_send_count', 0)
      .limit(50);

    let sent = 0;
    for (const a of (candidates || []) as any[]) {
      const phone = a.patient_phone;
      const email = a.patient_email;
      if (!phone && !email) continue;
      if (!a.view_token) continue; // can't send without the token

      const url = `${PUBLIC_SITE_URL}/appt/${a.view_token}/confirm`;
      const firstName = String(a.patient_name || 'there').split(' ')[0];
      const apptShort = fmtAppt(String(a.appointment_date), a.appointment_time);

      let smsOk = false;
      let emailOk = false;

      if (phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        try {
          const body = `Hi ${firstName} — quick confirm: see you ${apptShort}? Tap to confirm, reschedule, or cancel: ${url}`;
          const fd = new URLSearchParams({ To: normPhone(phone), From: TWILIO_FROM, Body: body });
          const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: fd.toString(),
          });
          smsOk = r.ok;
        } catch (e) { console.warn('[confirm-cron] sms err:', e); }
      }

      if (email && MAILGUN_API_KEY) {
        try {
          const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;margin:0;padding:20px;background:#f4f4f5;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:22px 24px;text-align:center;">
    <h1 style="margin:0;font-size:20px;">Quick — confirm your visit</h1>
  </div>
  <div style="padding:24px;line-height:1.6;color:#111827;">
    <p>Hi ${firstName},</p>
    <p>Just a quick confirm — your ConveLabs visit is in ~48 hours:</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin:14px 0;">
      <p style="margin:0;"><strong>${apptShort}</strong></p>
      ${a.address ? `<p style="margin:6px 0 0;font-size:13px;color:#374151;">${a.address}</p>` : ''}
    </div>
    <div style="text-align:center;margin:22px 0;">
      <a href="${url}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">✓ Confirm or change →</a>
    </div>
    <p style="font-size:13px;color:#6b7280;">Three options: confirm, reschedule, or cancel — your call.</p>
    <p style="margin-top:18px;">— Nico, ConveLabs</p>
  </div>
</div></body></html>`;
          const fd = new FormData();
          fd.append('from', `Nicodemme Jean-Baptiste <info@convelabs.com>`);
          fd.append('to', email);
          fd.append('subject', `Confirm your ConveLabs visit on ${apptShort}`);
          fd.append('html', html);
          fd.append('o:tracking-clicks', 'no');
          const r = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
            body: fd,
          });
          emailOk = r.ok;
        } catch (e) { console.warn('[confirm-cron] email err:', e); }
      }

      if (smsOk || emailOk) {
        await admin.from('appointments').update({
          confirmation_send_count: 1,
          last_confirmation_sent_at: new Date().toISOString(),
          patient_confirmation_sent_at: new Date().toISOString(),
        }).eq('id', a.id);
        sent++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, candidates: (candidates || []).length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[send-confirmation-requests] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
