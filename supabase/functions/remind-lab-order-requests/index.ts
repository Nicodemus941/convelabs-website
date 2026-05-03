/**
 * REMIND-LAB-ORDER-REQUESTS — hourly cron.
 *
 * Picks up `appointment_lab_order_requests` rows that:
 *   - Are in status 'pending' or 'sent' (not yet uploaded, not cancelled)
 *   - Haven't expired
 *   - Have a 'last_send_at' that's overdue per the cadence below
 *   - Haven't hit the MAX_SEND_ATTEMPTS cap (3)
 *
 * Cadence: 24h after first send → reminder #2; 48h after that → reminder #3.
 * After #3, escalate to admin via owner SMS ("[Patient] hasn't uploaded —
 * call them") and stop sending.
 *
 * Quiet-hours gated: defers anything that would fire 9pm-8am ET; the next
 * cron run after 8 AM picks up the queue.
 *
 * Different copy per attempt:
 *   #2 (24h): "Just a nudge — your lab order is the only thing we're
 *             waiting on. 30-sec upload: <link>"
 *   #3 (48h): "Your appointment is in <X> days — without the lab order
 *             we'll have to reschedule. Upload here: <link>"
 *   Escalation: owner SMS at #3 cap.
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
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';

const MAX_ATTEMPTS = 3;
const REMINDER_CADENCE_HOURS = [24, 48]; // attempt 2 fires 24h after attempt 1; #3 fires 48h after #2

function normPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return p.startsWith('+') ? p : `+${d}`;
}

function fmtApptShort(dateIso: string, time?: string | null): string {
  try {
    const d = new Date(String(dateIso).substring(0, 10) + 'T12:00:00');
    const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return time ? `${day} at ${time}` : day;
  } catch { return String(dateIso); }
}

function daysUntil(dateIso: string): number {
  try {
    const d = new Date(String(dateIso).substring(0, 10) + 'T12:00:00');
    return Math.max(0, Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  } catch { return 0; }
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

    // Pick candidates: not uploaded, not expired, not at cap.
    const { data: candidates } = await admin
      .from('appointment_lab_order_requests')
      .select('id, appointment_id, access_token, expires_at, status, send_attempts, last_send_at, patient_email_at_send, patient_phone_at_send, requested_at')
      .in('status', ['pending', 'sent', 'opened'])
      .gt('expires_at', new Date().toISOString())
      .lt('send_attempts', MAX_ATTEMPTS)
      .order('requested_at', { ascending: true })
      .limit(50);

    let processed = 0;
    let reminded = 0;
    let escalated = 0;
    const now = Date.now();

    for (const c of (candidates || []) as any[]) {
      processed++;
      const lastSendAt = c.last_send_at ? new Date(c.last_send_at).getTime() : new Date(c.requested_at).getTime();
      const attempts = c.send_attempts || 0;
      const cadenceHours = REMINDER_CADENCE_HOURS[attempts - 1] || REMINDER_CADENCE_HOURS[REMINDER_CADENCE_HOURS.length - 1];
      const dueAt = lastSendAt + cadenceHours * 60 * 60 * 1000;
      if (now < dueAt) continue;

      // Load appointment for copy
      const { data: appt } = await admin
        .from('appointments')
        .select('id, patient_name, patient_email, patient_phone, appointment_date, appointment_time, lab_order_file_path, status')
        .eq('id', c.appointment_id)
        .maybeSingle();
      if (!appt) continue;

      // If somehow a lab order arrived between cron runs, mark uploaded + skip
      if (appt.lab_order_file_path) {
        await admin.from('appointment_lab_order_requests')
          .update({ status: 'uploaded', uploaded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', c.id);
        continue;
      }
      // If appointment is cancelled, cancel the request too
      if (appt.status === 'cancelled') {
        await admin.from('appointment_lab_order_requests')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', c.id);
        continue;
      }

      const patientUrl = `${PUBLIC_SITE_URL}/appt/${c.access_token}/upload-order`;
      const firstName = String(appt.patient_name || 'there').split(' ')[0];
      const apptShort = fmtApptShort(String(appt.appointment_date), appt.appointment_time);
      const days = daysUntil(String(appt.appointment_date));
      const isLast = attempts + 1 >= MAX_ATTEMPTS;
      const phone = appt.patient_phone || c.patient_phone_at_send;
      const email = appt.patient_email || c.patient_email_at_send;

      // Copy varies by attempt
      let smsBody: string;
      let emailSubject: string;
      let emailHtml: string;
      if (isLast) {
        smsBody = `Hi ${firstName} — ConveLabs. Your visit is ${apptShort} (${days} day${days === 1 ? '' : 's'}). Without your lab order we may have to reschedule. Last quick upload link: ${patientUrl}`;
        emailSubject = `Last reminder — your ConveLabs visit is in ${days} day${days === 1 ? '' : 's'}`;
        emailHtml = `<p>Hi ${firstName},</p><p>Your visit is on <strong>${apptShort}</strong> — that's <strong>${days} day${days === 1 ? '' : 's'}</strong> from now.</p><p>Without your lab order we'll have to reschedule, since we won't know which tubes to draw. Quick fix:</p><p><a href="${patientUrl}" style="background:#B91C1C;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">📄 Upload my lab order →</a></p><p>Or have your doctor's office fax it to <strong>(941) 251-8467</strong>.</p><p>— Nico, ConveLabs</p>`;
      } else {
        smsBody = `Hi ${firstName} — quick nudge: your lab order is the only thing we're waiting on for your ${apptShort} visit. 30-sec upload: ${patientUrl}`;
        emailSubject = `Just a nudge — upload your lab order before ${apptShort}`;
        emailHtml = `<p>Hi ${firstName},</p><p>Just a nudge: we're locked in for <strong>${apptShort}</strong> and your lab order is the only thing we're waiting on.</p><p><a href="${patientUrl}" style="background:#B91C1C;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">📄 Upload my lab order →</a></p><p>Photo or PDF — both work. Takes about 30 seconds.</p><p>— Nico, ConveLabs</p>`;
      }

      let smsSent = false;
      let emailSent = false;

      if (phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        try {
          const fd = new URLSearchParams({ To: normPhone(phone), From: TWILIO_FROM, Body: smsBody });
          const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd.toString(),
          });
          smsSent = tw.ok;
        } catch (e) { console.warn('[remind-cron] sms err:', e); }
      }
      if (email && MAILGUN_API_KEY) {
        try {
          const fd = new FormData();
          fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
          fd.append('to', email);
          fd.append('subject', emailSubject);
          fd.append('html', emailHtml);
          fd.append('o:tracking-clicks', 'no');
          const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
            body: fd,
          });
          emailSent = mg.ok;
        } catch (e) { console.warn('[remind-cron] email err:', e); }
      }

      await admin.from('appointment_lab_order_requests')
        .update({
          send_attempts: attempts + 1,
          last_send_at: new Date().toISOString(),
          last_send_status: (smsSent || emailSent) ? `sent:reminder${attempts + 1}` : 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', c.id);

      reminded++;

      // Escalate to owner on the LAST attempt (so they have a chance to call manually)
      if (isLast && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        try {
          const ownerBody = `${appt.patient_name || 'Patient'} hasn't uploaded their lab order — visit ${apptShort} (${days}d). Sent 3× via SMS+email. Maybe call them: ${phone || 'no phone'}`;
          const fd = new URLSearchParams({
            To: OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`,
            From: TWILIO_FROM,
            Body: ownerBody,
          });
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd.toString(),
          });
          escalated++;
        } catch (e) { console.warn('[remind-cron] owner escalate err:', e); }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, reminded, escalated }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[remind-lab-order-requests] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
