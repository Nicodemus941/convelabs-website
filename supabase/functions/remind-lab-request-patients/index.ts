// remind-lab-request-patients
// Daily cron (9 AM ET). For every patient_lab_requests row that is:
//   - status = 'pending_schedule'
//   - draw_by_date within the next 7 days
//   - last reminded > 24 hours ago (or never)
//   - patient_reminder_count < 3
// Send an escalating email + SMS reminder.
//
// After deadline passes without booking:
//   - status → 'expired'
//   - provider notified via email
//
// Scheduling: wire up via pg_cron to hit this fn daily.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { nextAvailableSlots } from '../_shared/availability.ts';
import { formatSlotsForSms } from '../_shared/preoffered-slots.ts';

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

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function daysBetween(iso: string): number {
  const d = new Date(iso); const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const now = new Date();
    const nowIso = now.toISOString();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const yday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // ── EXPIRE past-deadline requests first ──────────────────────────────
    const today = now.toISOString().substring(0, 10);
    const { data: expired } = await admin
      .from('patient_lab_requests')
      .select('id, organization_id, patient_name, created_by')
      .eq('status', 'pending_schedule')
      .lt('draw_by_date', today);

    for (const r of expired || []) {
      await admin.from('patient_lab_requests').update({
        status: 'expired', cancelled_at: nowIso,
      }).eq('id', r.id);

      // Notify provider that the request expired
      const { data: org } = await admin.from('organizations').select('name, contact_email, billing_email, contact_name').eq('id', r.organization_id).maybeSingle();
      const providerEmail = org?.contact_email || org?.billing_email;
      if (providerEmail && MAILGUN_API_KEY) {
        try {
          const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:#B91C1C;color:#fff;padding:18px;border-radius:10px 10px 0 0;text-align:center;"><h2 style="margin:0;font-size:18px;">${r.patient_name}'s lab request expired</h2></div>
  <div style="padding:22px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;line-height:1.6;">
    <p>Hi ${org?.contact_name || org?.name || 'there'},</p>
    <p><strong>${r.patient_name}</strong> didn't book before the draw deadline despite 3 reminders. We've marked the request as expired.</p>
    <p>If you'd like to send them a new request with a fresh deadline, log in to your portal and click "Request labs for a patient."</p>
    <div style="text-align:center;margin:16px 0;"><a href="${PUBLIC_SITE_URL}/dashboard/provider" style="display:inline-block;background:#B91C1C;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Open portal →</a></div>
  </div>
</div>`;
          const fd = new FormData();
          fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
          fd.append('to', providerEmail);
          fd.append('subject', `Lab request expired: ${r.patient_name}`);
          fd.append('html', html);
          fd.append('o:tracking-clicks', 'no');
          await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, { method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd });
        } catch (e) { console.warn('expire email failed:', e); }
      }
    }

    // ── SEND REMINDERS to still-pending requests ─────────────────────────
    const { data: due } = await admin
      .from('patient_lab_requests')
      .select('*')
      .eq('status', 'pending_schedule')
      .gte('draw_by_date', today)
      .lte('draw_by_date', in7Days.toISOString().substring(0, 10))
      .or(`patient_reminded_at.is.null,patient_reminded_at.lt.${yday}`)
      .lt('patient_reminder_count', 3);

    let sent = 0;
    for (const r of due || []) {
      const { data: org } = await admin.from('organizations').select('name, time_window_rules').eq('id', r.organization_id).maybeSingle();
      const daysLeft = daysBetween(r.draw_by_date);
      const reminderNum = (r.patient_reminder_count || 0) + 1;
      const slots = await nextAvailableSlots(admin, r.organization_id, r.draw_by_date, org?.time_window_rules, 3);
      const patientUrl = `${PUBLIC_SITE_URL}/lab-request/${r.access_token}`;
      const firstName = r.patient_name.split(' ')[0];
      const urgencyTag = daysLeft <= 2 ? '🔴 URGENT' : daysLeft <= 4 ? '🟡 Reminder' : 'Reminder';

      // Email
      if (r.patient_email && MAILGUN_API_KEY) {
        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:${daysLeft <= 2 ? '#B91C1C' : '#D97706'};color:#fff;padding:18px;border-radius:10px 10px 0 0;text-align:center;"><h2 style="margin:0;font-size:18px;">${urgencyTag} — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left</h2></div>
  <div style="padding:22px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;line-height:1.6;">
    <p>Hi ${firstName},</p>
    <p>This is reminder #${reminderNum} of 3 — <strong>${org?.name || 'your provider'}</strong> is still waiting on your bloodwork. Deadline: <strong>${fmtDate(r.draw_by_date)}</strong>.</p>
    <div style="text-align:center;margin:22px 0;"><a href="${patientUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:13px 34px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Book my draw (90 sec) →</a></div>
    <p style="font-size:12px;color:#6b7280;">Questions? info@convelabs.com · (941) 527-9169</p>
  </div>
</div>`;
        try {
          const fd = new FormData();
          fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
          fd.append('to', r.patient_email);
          fd.append('subject', `${urgencyTag}: only ${daysLeft}d to book your bloodwork`);
          fd.append('html', html);
          fd.append('o:tracking-clicks', 'no');
          await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, { method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd });
        } catch (e) { console.warn('reminder email failed:', e); }
      }

      // SMS
      if (r.patient_phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        try {
          const slotsLine = slots.length > 0 ? `Reply ${formatSlotsForSms(slots)}. ` : '';
          const smsBody = `ConveLabs: ${daysLeft} day${daysLeft === 1 ? '' : 's'} left to book your bloodwork for ${org?.name || 'your provider'}. ${slotsLine}Or tap: ${patientUrl}`;
          const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
          const fd = new URLSearchParams({ To: normalizePhone(r.patient_phone), From: TWILIO_FROM, Body: smsBody });
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd.toString(),
          });
        } catch (e) { console.warn('reminder SMS failed:', e); }
      }

      await admin.from('patient_lab_requests').update({
        patient_reminded_at: nowIso,
        patient_reminder_count: reminderNum,
        preoffered_slots: slots,
        preoffered_slots_at: nowIso,
      }).eq('id', r.id);
      sent++;
    }

    return new Response(JSON.stringify({ success: true, reminders_sent: sent, expired_count: expired?.length || 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('remind-lab-request-patients error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
