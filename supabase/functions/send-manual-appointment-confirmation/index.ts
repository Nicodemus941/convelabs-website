/**
 * SEND-MANUAL-APPOINTMENT-CONFIRMATION
 *
 * Admin-fired confirmation SMS for cases where the 48h-out cron isn't
 * suitable (e.g. last-minute manual reschedule). Body: { appointment_id }.
 * Loads phone, view_token, time/date and crafts a confirmation copy
 * with the live confirm/track links. Idempotent-ish: bumps
 * confirmation_send_count + last_confirmation_sent_at so the cron
 * won't re-send.
 *
 * verify_jwt=false — gate is the appointment_id existing.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';

function normPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return p.startsWith('+') ? p : `+${d}`;
}
function fmtAppt(d: string, t?: string | null): string {
  const dt = new Date(String(d).substring(0, 10) + 'T12:00:00');
  const day = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return t ? `${day} at ${formatTimeAmPm(t)}` : day;
}
function formatTimeAmPm(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const mins = m[2];
  const pm = h >= 12;
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${mins} ${pm ? 'PM' : 'AM'}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  try {
    const { appointment_id } = await req.json().catch(() => ({}));
    if (!appointment_id) {
      return new Response(JSON.stringify({ error: 'appointment_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: a } = await admin
      .from('appointments')
      .select('id, view_token, patient_name, patient_phone, appointment_date, appointment_time, address, status')
      .eq('id', appointment_id)
      .maybeSingle();
    if (!a) {
      return new Response(JSON.stringify({ error: 'appointment_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!a.patient_phone) {
      return new Response(JSON.stringify({ error: 'no_phone' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      return new Response(JSON.stringify({ error: 'twilio_not_configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const first = String(a.patient_name || 'there').split(' ')[0];
    const apptStr = fmtAppt(String(a.appointment_date), a.appointment_time);
    const confirmUrl = a.view_token ? `${PUBLIC_SITE_URL}/appt/${a.view_token}/confirm` : null;
    const body = `Hi ${first} — ConveLabs. You're booked for ${apptStr}. ${confirmUrl ? `Quick confirm or change: ${confirmUrl}` : 'Reply YES to confirm.'}`;

    const fd = new URLSearchParams({ To: normPhone(String(a.patient_phone)), From: TWILIO_FROM, Body: body });
    const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fd.toString(),
    });
    const ok = tw.ok;
    const twJson = await tw.json().catch(() => ({}));

    await admin.from('appointments').update({
      confirmation_send_count: 1,
      last_confirmation_sent_at: new Date().toISOString(),
      patient_confirmation_sent_at: new Date().toISOString(),
    }).eq('id', appointment_id);

    return new Response(JSON.stringify({ ok, sid: (twJson as any)?.sid || null, body }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[send-manual-appointment-confirmation] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
