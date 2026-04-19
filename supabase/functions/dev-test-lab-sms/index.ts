// dev-test-lab-sms
// One-off admin endpoint that creates a real patient_lab_requests row for
// the 'faith' test org and fires the full SMS + email notification flow.
// Protected by a hardcoded dev secret in the body — not intended for public
// use beyond testing the SMS pipeline end-to-end.
//
// Usage (curl):
//   curl -X POST https://<project>.supabase.co/functions/v1/dev-test-lab-sms \
//     -H "Authorization: Bearer <anon_key>" -H "Content-Type: application/json" \
//     -d '{"secret":"convelabs-sms-test-2026","phone":"407-775-9705","email":"doyainc@gmail.com"}'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { computePreofferedSlots, formatSlotsForSms } from '../_shared/preoffered-slots.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const DEV_SECRET = 'convelabs-sms-test-2026';

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isoDatePlusDays(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    if (body.secret !== DEV_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const phone = body.phone || '407-775-9705';
    const email = body.email || null;
    const drawByDate = body.draw_by_date || isoDatePlusDays(5);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Find faith org (or whatever was requested)
    const { data: org } = await admin
      .from('organizations')
      .select('id, name, contact_name')
      .eq('name', body.org_name || 'faith')
      .eq('is_active', true)
      .maybeSingle();
    if (!org) return new Response(JSON.stringify({ error: 'Test org not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });

    const accessToken = crypto.randomUUID() + '-' + crypto.randomUUID().split('-')[0];
    const slots = computePreofferedSlots(drawByDate, 3);

    // Insert the request
    const { data: inserted, error: insErr } = await admin
      .from('patient_lab_requests')
      .insert({
        organization_id: org.id,
        patient_name: body.patient_name || 'Test Patient',
        patient_email: email,
        patient_phone: phone,
        draw_by_date: drawByDate,
        access_token: accessToken,
        preoffered_slots: slots,
        preoffered_slots_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

    const patientUrl = `${PUBLIC_SITE_URL}/lab-request/${accessToken}`;
    const slotsLine = slots.length > 0 ? `Reply ${formatSlotsForSms(slots)}. ` : '';
    const smsBody = `ConveLabs TEST: ${org.contact_name || org.name} ordered your bloodwork by ${fmtDate(drawByDate)}. ${slotsLine}Or tap: ${patientUrl}`;

    const twilioStatus: any = { sent: false, from: TWILIO_FROM };
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      twilioStatus.error = 'Twilio env vars missing — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER';
    } else {
      try {
        const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
        const fd = new URLSearchParams({ To: normalizePhone(phone), From: TWILIO_FROM, Body: smsBody });
        const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: fd.toString(),
        });
        const t = await resp.text();
        twilioStatus.sent = resp.ok;
        twilioStatus.status = resp.status;
        twilioStatus.response = t.substring(0, 500);
      } catch (e: any) {
        twilioStatus.error = e.message || String(e);
      }
    }

    await admin.from('patient_lab_requests').update({ patient_notified_at: new Date().toISOString() }).eq('id', inserted.id);

    return new Response(JSON.stringify({
      success: true,
      request_id: inserted.id,
      access_token: accessToken,
      patient_url: patientUrl,
      sms: twilioStatus,
      preview_sms_body: smsBody,
      slots,
    }, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('dev-test-lab-sms error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
