// send-fasting-reminders
// Nightly cron (daily at 8 PM ET = midnight UTC during DST). Finds tomorrow-
// morning appointments where fasting_required = true and sends a reminder
// SMS + email telling the patient exactly when to stop eating and drinking
// (8 hours before appointment time).
//
// QUIET-HOURS RULE: this cron runs at 8 PM ET. 9 PM ET is the TCPA quiet-
// hours floor for non-emergency SMS. We send BEFORE 9 PM so the patient
// gets ~1 hour of runway before their fasting cutoff (for an 8 AM draw,
// cutoff is midnight; reminder at 8 PM = 4 hours of warning).
//
// Skips:
//   - appointments already completed / cancelled
//   - appointments already reminded (fasting_reminder_sent_at set)
//   - afternoon appointments (>= 12 PM — no same-night fast issue)
//   - appointments with no phone or email on file

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const FASTING_HOURS = 8; // per business rule

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

function parseTime(t: string): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  if (!match) return { h: 0, m: 0 };
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const p = match[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return { h, m };
}

// Returns a human-friendly cutoff time string. "by midnight tonight",
// "by 10:00 PM tonight", "by 2:00 AM tomorrow".
function formatCutoff(apptTimeStr: string): string {
  const { h, m } = parseTime(apptTimeStr);
  const apptMin = h * 60 + m;
  const cutoffMin = apptMin - FASTING_HOURS * 60; // negative = previous day

  let cutH: number, cutM: number, suffix: 'tonight' | 'tomorrow';
  if (cutoffMin >= 0) {
    // Cutoff is same day as appointment (e.g., early-morning draws where
    // 8 hrs back lands before midnight). But since we only run for morning
    // appointments, most cases land in the "tomorrow" branch below.
    cutH = Math.floor(cutoffMin / 60);
    cutM = cutoffMin % 60;
    suffix = 'tomorrow';
  } else {
    const wrapMin = cutoffMin + 24 * 60;
    cutH = Math.floor(wrapMin / 60);
    cutM = wrapMin % 60;
    suffix = 'tonight';
  }

  if (cutH === 0 && cutM === 0) return `by midnight ${suffix}`;

  const period = cutH >= 12 ? 'PM' : 'AM';
  const displayH = cutH > 12 ? cutH - 12 : cutH === 0 ? 12 : cutH;
  const mStr = cutM === 0 ? '' : `:${String(cutM).padStart(2, '0')}`;
  return `by ${displayH}${mStr} ${period} ${suffix}`;
}

// ET date helpers
function tomorrowET(): { iso: string; label: string } {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  et.setDate(et.getDate() + 1);
  const iso = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
  const label = et.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return { iso, label };
}

Deno.serve(async (_req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const tomorrow = tomorrowET();
    const rangeStart = `${tomorrow.iso}T00:00:00`;
    const rangeEnd = `${tomorrow.iso}T23:59:59`;

    // Pull all fasting-required appointments for tomorrow that still need a reminder
    const { data: appts, error: q } = await admin
      .from('appointments')
      .select('id, patient_name, patient_email, patient_phone, appointment_time, address, lab_order_panels')
      .eq('fasting_required', true)
      .is('fasting_reminder_sent_at', null)
      .not('status', 'in', '(cancelled,completed)')
      .gte('appointment_date', rangeStart)
      .lte('appointment_date', rangeEnd);
    if (q) throw q;

    let sent = 0, skippedAfternoon = 0, skippedNoContact = 0;
    const report: any[] = [];

    for (const a of appts || []) {
      // Only reminders for morning appointments — afternoon draws don't have a
      // night-before fasting issue.
      const { h } = parseTime(String(a.appointment_time || ''));
      if (h >= 12) { skippedAfternoon++; continue; }
      if (!a.patient_phone && !a.patient_email) { skippedNoContact++; continue; }

      const cutoff = formatCutoff(String(a.appointment_time));
      const firstName = String(a.patient_name || 'there').split(' ')[0];
      const addrShort = a.address ? String(a.address).substring(0, 40) : '';

      // ── SMS ────────────────────────────────────────────────────────────
      if (a.patient_phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        try {
          const smsBody = `ConveLabs fasting reminder: ${firstName}, your blood draw is tomorrow at ${a.appointment_time}. Stop eating & drinking (water OK) ${cutoff}. We'll see you at ${addrShort}. Questions? Reply HELP.`;
          const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
          const fd = new URLSearchParams({ To: normalizePhone(a.patient_phone), From: TWILIO_FROM, Body: smsBody });
          const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd.toString(),
          });
          if (!r.ok) console.warn('fasting SMS failed', a.id, await r.text());
        } catch (e) { console.warn('fasting SMS error', a.id, e); }
      }

      // ── EMAIL ──────────────────────────────────────────────────────────
      if (a.patient_email && MAILGUN_API_KEY) {
        try {
          const panelChips = (Array.isArray(a.lab_order_panels) ? a.lab_order_panels.slice(0, 6) : []).map((p: any) =>
            `<span style="display:inline-block;background:#fef2f2;color:#B91C1C;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;margin:2px 3px 0 0;">${typeof p === 'string' ? p : p.name || ''}</span>`
          ).join(' ');
          const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
    <h2 style="margin:0;font-size:18px;">Fasting reminder — draw tomorrow at ${a.appointment_time}</h2>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;">
    <p>Hi ${firstName},</p>
    <p>Quick reminder: your ConveLabs blood draw is <strong>tomorrow (${tomorrow.label}) at ${a.appointment_time}</strong>.</p>
    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0;font-size:15px;color:#78350f;"><strong>🍽️ Stop eating &amp; drinking ${cutoff}</strong></p>
      <p style="margin:6px 0 0;font-size:13px;color:#92400e;">Water is fine the whole time. No coffee, no juice, no mints, no gum.</p>
    </div>
    ${panelChips ? `<p style="font-size:13px;color:#6b7280;margin:14px 0 4px;">What your provider ordered:</p><div>${panelChips}</div>` : ''}
    <p style="font-size:13px;color:#6b7280;margin-top:14px;">We'll arrive at <strong>${addrShort || 'your address'}</strong> at ${a.appointment_time}.</p>
    <p style="font-size:13px;color:#6b7280;">Running late or need to reschedule? Call/text (941) 527-9169.</p>
  </div>
</div>`;
          const fd = new FormData();
          fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
          fd.append('to', a.patient_email);
          fd.append('subject', `Fasting reminder — draw tomorrow at ${a.appointment_time}`);
          fd.append('html', html);
          fd.append('o:tracking-clicks', 'no');
          await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, { method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd });
        } catch (e) { console.warn('fasting email error', a.id, e); }
      }

      await admin.from('appointments').update({ fasting_reminder_sent_at: new Date().toISOString() }).eq('id', a.id);
      sent++;
      report.push({ id: a.id, patient: a.patient_name, time: a.appointment_time, cutoff });
    }

    return new Response(JSON.stringify({
      success: true, sent, skipped_afternoon: skippedAfternoon, skipped_no_contact: skippedNoContact,
      tomorrow: tomorrow.iso, report,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('send-fasting-reminders error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
