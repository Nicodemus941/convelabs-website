/**
 * NOTIFY-PROVIDER-DEADLINE-RISK
 *
 * Daily cron at 14:30 UTC (10:30 AM ET). For every patient_lab_requests row
 * where:
 *   - status = 'pending_schedule'
 *   - draw_by_date is today or tomorrow
 *   - provider_deadline_alert_sent_at IS NULL (de-dupe)
 *   - cancelled_at IS NULL
 *
 * Fire ONE alert (email + SMS) to the provider's primary contact:
 *   "Heads up: Robert Smith hasn't booked their bloodwork yet, deadline is
 *    tomorrow. They've received 3 reminders. You may want to phone them."
 *
 * The patient already gets escalating reminders via remind-lab-request-patients.
 * This is the *provider* loop — closes the loop so they're never blindsided.
 *
 * Why this matters:
 *   - Med-wt-loss / TRT / hormone clinics LOSE program revenue when a patient
 *     doesn't book labs before a phase transition or a Rx refill.
 *   - One phone call from THEIR office (not ours) is the highest-conversion
 *     last-mile rescue. We give them the data + the URL to make that call easy.
 *
 * verify_jwt=false (cron-triggered).
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
const FROM_EMAIL = `Nicodemme Jean-Baptiste <info@convelabs.com>`;

function normPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return p.startsWith('+') ? p : `+${d}`;
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const today = new Date().toISOString().substring(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().substring(0, 10);

    // Find pending_schedule requests deadline today or tomorrow, not yet alerted
    const { data: at_risk, error } = await admin
      .from('patient_lab_requests')
      .select('id, organization_id, patient_name, patient_email, patient_phone, draw_by_date, access_token, patient_reminder_count, patient_viewed_at, created_at')
      .eq('status', 'pending_schedule')
      .is('cancelled_at', null)
      .is('provider_deadline_alert_sent_at', null)
      .gte('draw_by_date', today)
      .lte('draw_by_date', tomorrow);

    if (error) throw error;

    let alertsSent = 0;
    const skipped: any[] = [];

    for (const r of at_risk || []) {
      const { data: org } = await admin
        .from('organizations')
        .select('name, contact_name, contact_email, contact_phone, billing_email')
        .eq('id', r.organization_id)
        .maybeSingle();

      const providerEmail = org?.contact_email || org?.billing_email;
      const providerPhone = org?.contact_phone;
      if (!providerEmail && !providerPhone) {
        skipped.push({ id: r.id, reason: 'no_provider_contact' });
        continue;
      }

      const patientUrl = `${PUBLIC_SITE_URL}/lab-request/${r.access_token}`;
      const portalUrl = `${PUBLIC_SITE_URL}/dashboard/provider`;
      const isToday = r.draw_by_date === today;
      const urgencyTag = isToday ? '🔴 DUE TODAY' : '🟡 Due tomorrow';
      const urgencyColor = isToday ? '#B91C1C' : '#D97706';
      const remindersSent = r.patient_reminder_count || 0;
      const viewedNote = r.patient_viewed_at
        ? `They opened the booking link but didn't complete.`
        : `They haven't opened the booking link yet.`;

      // ── Email to provider ───────────────────────────────────────
      if (providerEmail && MAILGUN_API_KEY) {
        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:580px;margin:0 auto;background:#fff;">
  <div style="background:${urgencyColor};color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
    <h2 style="margin:0;font-size:18px;font-weight:700;">${urgencyTag}: ${r.patient_name} hasn't booked</h2>
    <p style="margin:6px 0 0;font-size:13px;opacity:0.95;">Deadline: ${fmtDate(r.draw_by_date)}</p>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111827;">
    <p style="margin:0 0 14px;">Hi ${org?.contact_name || org?.name || 'there'},</p>
    <p style="margin:0 0 14px;">Heads up — <strong>${r.patient_name}</strong> still hasn't scheduled their bloodwork, and the deadline is ${isToday ? '<strong>today</strong>' : '<strong>tomorrow</strong>'}. ${viewedNote} We've sent ${remindersSent} reminder${remindersSent === 1 ? '' : 's'} so far.</p>

    <div style="background:#fef3c7;border-left:4px solid #d97706;padding:14px 16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#78350f;">📞 Highest-conversion next step:</p>
      <p style="margin:0;font-size:13px;color:#78350f;">A 30-second call from your office gets ~80% of stragglers to book. Patients respond to their provider's voice more than to our reminders.</p>
    </div>

    ${r.patient_phone ? `<p style="margin:14px 0 6px;font-size:13px;"><strong>Patient phone:</strong> <a href="tel:${r.patient_phone}" style="color:#B91C1C;">${r.patient_phone}</a></p>` : ''}
    ${r.patient_email ? `<p style="margin:0 0 14px;font-size:13px;"><strong>Patient email:</strong> ${r.patient_email}</p>` : ''}

    <p style="margin:16px 0 8px;font-size:13px;color:#374151;">Their booking link (paste into a text or email if helpful):</p>
    <p style="margin:0 0 16px;"><a href="${patientUrl}" style="color:#1f2937;font-family:monospace;font-size:12px;word-break:break-all;">${patientUrl}</a></p>

    <div style="text-align:center;margin:22px 0;">
      <a href="${portalUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Open provider portal →</a>
    </div>

    <p style="margin:16px 0 0;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:14px;">If the patient already drew labs elsewhere, log in and cancel the request. Questions? Reply to this email or call (941) 527-9169.</p>
  </div>
</div>`;
        try {
          const fd = new FormData();
          fd.append('from', FROM_EMAIL);
          fd.append('to', providerEmail);
          fd.append('subject', `${urgencyTag}: ${r.patient_name}'s draw deadline`);
          fd.append('html', html);
          fd.append('o:tracking-clicks', 'no');
          await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
            body: fd,
          });
        } catch (e) { console.warn('[deadline-risk] email failed:', e); }
      }

      // ── SMS to provider (short version) ─────────────────────────
      if (providerPhone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        try {
          const smsBody = `ConveLabs alert: ${r.patient_name} hasn't booked labs — deadline ${isToday ? 'TODAY' : 'tomorrow'}. ${remindersSent} reminders sent. A call from your office often closes it. Portal: ${portalUrl}`;
          const fd = new URLSearchParams({ To: normPhone(providerPhone), From: TWILIO_FROM, Body: smsBody });
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd.toString(),
          });
        } catch (e) { console.warn('[deadline-risk] SMS failed:', e); }
      }

      await admin.from('patient_lab_requests')
        .update({ provider_deadline_alert_sent_at: new Date().toISOString() })
        .eq('id', r.id);
      alertsSent++;
    }

    return new Response(JSON.stringify({
      ok: true,
      candidates: at_risk?.length || 0,
      alerts_sent: alertsSent,
      skipped,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[notify-provider-deadline-risk] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
