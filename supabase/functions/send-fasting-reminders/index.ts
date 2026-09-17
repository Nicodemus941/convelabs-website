// send-fasting-reminders
// Runs on a frequent cron and self-gates to the 8 PM ET window so DST shifts
// and missed invocations do not move patient messaging off the promised time.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { shouldSendNow } from '../_shared/quiet-hours.ts';
import { parseTimeOrNull } from '../_shared/parse-time.ts';
import { verifyRecipientEmail, verifyRecipientPhone } from '../_shared/verify-recipient.ts';
import { userHasOptedIn } from '../_shared/email/index.ts';
import { logOrgEmail } from '../_shared/email-log.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const FASTING_HOURS = 8;
const SEND_WINDOW_START_ET = 20;
const SEND_WINDOW_END_ET = 21;

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

function parseTime(t: string): { h: number; m: number } {
  const r = parseTimeOrNull(t);
  return r || { h: -1, m: -1 };
}

function formatCutoff(apptTimeStr: string): string | null {
  const { h, m } = parseTime(apptTimeStr);
  if (h < 0 || m < 0) return null;
  const apptMin = h * 60 + m;
  const cutoffMin = apptMin - FASTING_HOURS * 60;

  let cutH: number, cutM: number, suffix: 'tonight' | 'tomorrow';
  if (cutoffMin >= 0) {
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

function tomorrowET(): { iso: string; label: string } {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  et.setDate(et.getDate() + 1);
  const iso = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
  const label = et.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return { iso, label };
}

function plusDaysDateOnly(dateOnlyIso: string, days: number): string {
  const d = new Date(`${dateOnlyIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isUSEasternDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  const marchStart = (() => {
    const d = new Date(Date.UTC(year, 2, 1));
    const firstSun = 1 + ((7 - d.getUTCDay()) % 7);
    return Date.UTC(year, 2, firstSun + 7, 7);
  })();
  const novEnd = (() => {
    const d = new Date(Date.UTC(year, 10, 1));
    const firstSun = 1 + ((7 - d.getUTCDay()) % 7);
    return Date.UTC(year, 10, firstSun, 6);
  })();
  const t = date.getTime();
  return t >= marchStart && t < novEnd;
}

function etOffsetHours(date: Date): number {
  return isUSEasternDST(date) ? -4 : -5;
}

function hourET(now: Date = new Date()): number {
  const shifted = new Date(now.getTime() + etOffsetHours(now) * 3600 * 1000);
  return shifted.getUTCHours();
}

type ChannelStatus = 'already_sent' | 'sent' | 'failed' | 'blocked' | 'unavailable';

interface ExistingReminderState {
  emailSent: boolean;
  smsSent: boolean;
}

Deno.serve(async (req) => {
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ success: true, suspended: true, message: 'Notifications suspended' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  const gate = shouldSendNow('reminder');
  if (!gate.allow) {
    console.log(`[quiet-hours] send-fasting-reminders deferred: ${gate.reason}; resume ${gate.nextAllowedAt}`);
    return new Response(JSON.stringify({ deferred: true, reason: gate.reason, nextAllowedAt: gate.nextAllowedAt }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  let force = false;
  let appointmentId: string | undefined;
  try {
    const body = await req.json();
    force = !!body?.force;
    appointmentId = body?.appointmentId;
  } catch {
    // No body for scheduled runs.
  }

  const h = hourET();
  if (!force && (h < SEND_WINDOW_START_ET || h >= SEND_WINDOW_END_ET)) {
    console.log(`[evening-window] send-fasting-reminders no-op: ET hour ${h} outside ${SEND_WINDOW_START_ET}-${SEND_WINDOW_END_ET}`);
    return new Response(JSON.stringify({ skipped: true, reason: 'outside-evening-send-window', etHour: h }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const tomorrow = tomorrowET();
    const rangeStart = tomorrow.iso;
    const rangeEndExclusive = plusDaysDateOnly(tomorrow.iso, 1);

    let query = admin
      .from('appointments')
      .select('id, patient_id, patient_name, patient_email, patient_phone, appointment_time, address, lab_order_panels, urine_required, status, fasting_reminder_sent_at, appointment_date')
      .eq('fasting_required', true)
      .not('status', 'in', '(cancelled,completed)');

    if (appointmentId) {
      query = query.eq('id', appointmentId);
    } else {
      query = query
        .is('fasting_reminder_sent_at', null)
        .gte('appointment_date', rangeStart)
        .lt('appointment_date', rangeEndExclusive);
    }

    const { data: appts, error: q } = await query;
    if (q) throw q;

    let sent = 0, skippedAfternoon = 0, skippedNoContact = 0, skippedAlreadySent = 0;
    const report: any[] = [];

    for (const a of appts || []) {
      const parsed = parseTime(String(a.appointment_time || ''));
      if (parsed.h < 0) {
        console.warn(`[fasting] unparseable appointment_time for ${a.id}: ${JSON.stringify(a.appointment_time)} — skipping`);
        report.push({ id: a.id, status: 'skipped', reason: 'unparseable-time' });
        continue;
      }
      if (parsed.h >= 12) {
        skippedAfternoon++;
        report.push({ id: a.id, status: 'skipped', reason: 'afternoon-appointment' });
        continue;
      }
      if (!a.patient_phone && !a.patient_email) {
        skippedNoContact++;
        report.push({ id: a.id, status: 'skipped', reason: 'no-contact-info' });
        continue;
      }

      const existing = await getExistingReminderState(admin, a.id);
      if (!appointmentId && a.fasting_reminder_sent_at && existing.emailSent && existing.smsSent) {
        skippedAlreadySent++;
        report.push({ id: a.id, status: 'skipped', reason: 'already-sent' });
        continue;
      }

      const cutoff = formatCutoff(String(a.appointment_time));
      if (!cutoff) {
        console.warn(`[fasting] formatCutoff returned null for ${a.id} — skipping`);
        report.push({ id: a.id, status: 'skipped', reason: 'invalid-cutoff' });
        continue;
      }

      const firstName = String(a.patient_name || 'there').split(' ')[0];
      const addrShort = a.address ? String(a.address).substring(0, 40) : '';
      const apptTimeFriendly = (() => {
        const { h, m } = parsed;
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        return `${h12}:${String(m).padStart(2, '0')} ${period}`;
      })();
      const urineNeeded = !!(a as any).urine_required;
      const urineSmsLine = urineNeeded
        ? ` Bring a urine sample: collect your FIRST urine of the morning in the cup we'll provide (or any clean container — we'll transfer it).`
        : '';
      const urineEmailBlock = urineNeeded
        ? `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:14px 16px;margin:14px 0;">
      <p style="margin:0;font-size:14px;color:#1e40af;"><strong>Urine sample needed</strong></p>
      <p style="margin:6px 0 0;font-size:13px;color:#1e3a8a;">Collect your <strong>first morning urine</strong> in a clean container — we'll transfer it to the lab cup on arrival. Drink water normally; do not save urine from earlier in the night.</p>
    </div>`
        : '';

      let emailStatus: ChannelStatus = existing.emailSent ? 'already_sent' : 'unavailable';
      let smsStatus: ChannelStatus = existing.smsSent ? 'already_sent' : 'unavailable';

      if (!existing.smsSent && a.patient_phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        const phoneCheck = await verifyRecipientPhone(a.id, a.patient_phone, a.patient_name || firstName);
        if (!phoneCheck.safe) {
          smsStatus = 'blocked';
        } else {
          const smsBody = `ConveLabs fasting reminder: ${firstName}, your draw is tomorrow at ${apptTimeFriendly}. STOP ${cutoff}: food, juice, coffee, tea, soda, gum, mints, cough drops. OK: water + any meds you take daily (with water).${urineSmsLine} Arriving at ${addrShort}. Reply HELP.`;
          const toNum = normalizePhone(a.patient_phone);
          let deliveryStatus = 'failed';
          let smsSid: string | null = null;
          try {
            const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
            const fd = new URLSearchParams({ To: toNum, From: TWILIO_FROM, Body: smsBody });
            const scb = `${Deno.env.get('SUPABASE_URL') || ''}/functions/v1/twilio-status-callback`;
            if (scb.startsWith('http')) fd.append('StatusCallback', scb);
            const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
              method: 'POST',
              headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: fd.toString(),
            });
            if (r.ok) {
              deliveryStatus = 'sent';
              smsStatus = 'sent';
              try { smsSid = (await r.json())?.sid ?? null; } catch { smsSid = null; }
            } else {
              smsStatus = 'failed';
              console.warn('fasting SMS failed', a.id, await r.text());
            }
          } catch (e) {
            smsStatus = 'failed';
            console.warn('fasting SMS error', a.id, e);
          }

          try {
            await admin.from('sms_notifications').insert({
              appointment_id: a.id,
              notification_type: 'fasting_reminder',
              phone_number: toNum,
              message_content: smsBody,
              sent_at: new Date().toISOString(),
              delivery_status: deliveryStatus,
              twilio_message_sid: smsSid,
              metadata: { urine_required: urineNeeded, source: 'send-fasting-reminders' },
            });
          } catch (logErr) {
            console.warn('fasting SMS log insert failed (non-blocking)', a.id, logErr);
          }
        }
      } else if (!existing.smsSent && a.patient_phone) {
        smsStatus = 'unavailable';
      }

      const emailOptedIn = await userHasOptedIn(a.patient_id, 'appointment_reminders');
      if (!existing.emailSent && a.patient_email && MAILGUN_API_KEY && emailOptedIn) {
        const emailCheck = await verifyRecipientEmail(a.id, a.patient_email, a.patient_name || firstName);
        if (!emailCheck.safe) {
          emailStatus = 'blocked';
        } else {
          try {
            const panelChips = (Array.isArray(a.lab_order_panels) ? a.lab_order_panels.slice(0, 6) : []).map((p: any) =>
              `<span style="display:inline-block;background:#fef2f2;color:#B91C1C;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;margin:2px 3px 0 0;">${typeof p === 'string' ? p : p.name || ''}</span>`
            ).join(' ');
            const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
    <h2 style="margin:0;font-size:18px;">Fasting reminder — draw tomorrow at ${apptTimeFriendly}</h2>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;">
    <p>Hi ${firstName},</p>
    <p>Quick reminder: your ConveLabs blood draw is <strong>tomorrow (${tomorrow.label}) at ${apptTimeFriendly}</strong>.</p>
    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0;font-size:15px;color:#78350f;"><strong>Stop ${cutoff}</strong></p>
      <p style="margin:8px 0 0;font-size:13px;color:#92400e;"><strong>Avoid:</strong> food, juice, coffee, tea, soda, energy drinks, gum, mints, cough drops, breath strips.</p>
      <p style="margin:4px 0 0;font-size:13px;color:#92400e;"><strong>OK:</strong> plain water (as much as you like) + any daily medications you normally take with water.</p>
      <p style="margin:8px 0 0;font-size:12px;color:#92400e;font-style:italic;">If you're on insulin or have a medical reason you can't fast safely, call us at (941) 527-9169 — we'll reschedule.</p>
    </div>
    ${urineEmailBlock}
    ${panelChips ? `<p style="font-size:13px;color:#6b7280;margin:14px 0 4px;">What your provider ordered:</p><div>${panelChips}</div>` : ''}
    <p style="font-size:13px;color:#6b7280;margin-top:14px;">We'll arrive at <strong>${addrShort || 'your address'}</strong> at ${apptTimeFriendly}.</p>
    <p style="font-size:13px;color:#6b7280;">Running late or need to reschedule? Call/text (941) 527-9169.</p>
  </div>
</div>`;
            const subject = `Fasting reminder — draw tomorrow at ${apptTimeFriendly}`;
            const fd = new FormData();
            fd.append('from', `Nicodemme Jean-Baptiste <info@convelabs.com>`);
            fd.append('to', a.patient_email);
            fd.append('subject', subject);
            fd.append('html', html);
            fd.append('o:tracking-clicks', 'no');
            const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
              method: 'POST',
              headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
              body: fd
            });
            await logOrgEmail(admin, {
              appointmentId: a.id,
              toEmail: a.patient_email,
              emailType: 'fasting_reminder',
              subject,
              mailgunResponse: mgRes,
              retryPayload: { appointmentId: a.id, force: true },
            });
            if (mgRes.ok) {
              emailStatus = 'sent';
            } else {
              emailStatus = 'failed';
              console.warn('fasting email failed', a.id, await mgRes.text());
            }
          } catch (e) {
            emailStatus = 'failed';
            console.warn('fasting email error', a.id, e);
          }
        }
      } else if (!existing.emailSent && !emailOptedIn) {
        emailStatus = 'blocked';
      } else if (!existing.emailSent && a.patient_email) {
        emailStatus = 'unavailable';
      }

      const anyDelivered = ['sent', 'already_sent'].includes(emailStatus) || ['sent', 'already_sent'].includes(smsStatus);
      if (anyDelivered) {
        await admin
          .from('appointments')
          .update({ fasting_reminder_sent_at: new Date().toISOString() })
          .eq('id', a.id);
        sent++;
      }

      report.push({
        id: a.id,
        patient: a.patient_name,
        time: a.appointment_time,
        cutoff,
        emailStatus,
        smsStatus,
        sent: anyDelivered,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      sent,
      skipped_afternoon: skippedAfternoon,
      skipped_no_contact: skippedNoContact,
      skipped_already_sent: skippedAlreadySent,
      tomorrow: tomorrow.iso,
      report,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('send-fasting-reminders error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

async function getExistingReminderState(admin: any, appointmentId: string): Promise<ExistingReminderState> {
  const [emailRows, smsRows] = await Promise.all([
    admin
      .from('email_send_log')
      .select('status')
      .eq('appointment_id', appointmentId)
      .eq('email_type', 'fasting_reminder')
      .limit(10),
    admin
      .from('sms_notifications')
      .select('delivery_status')
      .eq('appointment_id', appointmentId)
      .eq('notification_type', 'fasting_reminder')
      .limit(10),
  ]);

  const emailStatuses = new Set(['sent', 'opened', 'clicked']);
  const smsStatuses = new Set(['queued', 'accepted', 'sending', 'sent', 'delivered']);

  return {
    emailSent: !!emailRows.data?.some((row: any) => emailStatuses.has(String(row.status || '').toLowerCase())),
    smsSent: !!smsRows.data?.some((row: any) => smsStatuses.has(String(row.delivery_status || '').toLowerCase())),
  };
}
