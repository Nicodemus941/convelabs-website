/**
 * PROCESS-ABANDONED-BOOKINGS
 *
 * pg_cron, every 15 minutes (deploy with --no-verify-jwt; the cron calls it
 * with the anon key like send-fasting-reminders). Sends the recovery
 * sequence for drafts captured by booking-draft-upsert:
 *
 *   Touch 1  +30 min after last activity   SMS if consented, else email
 *   Touch 2  next morning 9:00 AM ET       email + SMS if consented,
 *                                          copy tailored to the likely worry
 *   Touch 3  +3 days                       soft check-in, email + SMS if consented
 *
 * Stops (and never resumes) when the patient books, replies STOP (Twilio
 * 21610), the draft is older than 7 days, they already hold an upcoming
 * appointment, or after 3 touches.
 *
 * Guards, in order:
 *   system_settings.abandoned_recovery_enabled   must be true (ships false)
 *   NOTIFICATIONS_SUSPENDED                      env — skip everything
 *   quiet hours 9pm–8am ET                       shouldSendNow('marketing')
 *   MAX_PER_RUN                                  hard cap per invocation
 *
 * Body { force: true, draftId } sends the next touch for one draft even if
 * next_touch_at is in the future (still respects every guard above).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { shouldSendNow } from '../_shared/quiet-hours.ts';
import { sendSMS } from '../_shared/twilio.ts';
import { logOrgEmail } from '../_shared/email-log.ts';
import { brandedEmailWrapper } from '../_shared/branded-email.ts';
import { OPT_OUT_TAIL, SUPPORT_PHONE } from '../_shared/sms-copy.ts';
import { normalizePhone, resumeLinkFor } from '../_shared/booking-draft.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const FROM = 'Nicodemme Jean-Baptiste <info@convelabs.com>';

const MAX_TOUCHES = 3;
const MAX_PER_RUN = 25;
const TOUCH3_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
const MORNING_HOUR_ET = 9;

type Draft = {
  id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
  visit_type: string | null; service_type: string | null; selected_date: string | null; selected_time: string | null;
  fasting: boolean | null; visit_reason: string | null; lab_order_status: string | null; step_key: string | null; sms_consent: boolean;
  touches_sent: number; touch_log: any[]; created_at: string; expires_at: string; last_activity_at: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ── ET helpers (DST-aware, same pattern as _shared/quiet-hours.ts) ────────
function isUSEasternDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  const marchStart = (() => { const d = new Date(Date.UTC(year, 2, 1)); const firstSun = 1 + ((7 - d.getUTCDay()) % 7); return Date.UTC(year, 2, firstSun + 7, 7); })();
  const novEnd = (() => { const d = new Date(Date.UTC(year, 10, 1)); const firstSun = 1 + ((7 - d.getUTCDay()) % 7); return Date.UTC(year, 10, firstSun, 6); })();
  const t = date.getTime();
  return t >= marchStart && t < novEnd;
}
const etOffset = (d: Date) => (isUSEasternDST(d) ? -4 : -5);
function todayET(now = new Date()): string {
  return new Date(now.getTime() + etOffset(now) * 3600_000).toISOString().slice(0, 10);
}
/** The next calendar day's 9:00 AM ET as an instant. */
function nextMorningET(now = new Date()): Date {
  const shifted = new Date(now.getTime() + etOffset(now) * 3600_000);
  const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth(), d = shifted.getUTCDate() + 1;
  const probe = new Date(Date.UTC(y, m, d, 12));
  return new Date(Date.UTC(y, m, d, MORNING_HOUR_ET - etOffset(probe)));
}

// ── Copy ──────────────────────────────────────────────────────────────────
const VISIT_LABEL: Record<string, string> = {
  mobile: 'home blood draw', senior: 'home blood draw', 'fasting-blood-draw': 'fasting blood draw',
  'in-office': 'office visit', therapeutic: 'therapeutic phlebotomy visit',
  'specialty-kit': 'specialty kit collection', 'specialty-kit-genova': 'specialty kit collection',
};
const visitLabel = (d: Draft) => VISIT_LABEL[d.visit_type || d.service_type || ''] || (String(d.visit_type || '').startsWith('partner-') ? 'lab draw' : 'home blood draw');

function whenLabel(d: Draft): string | null {
  if (!d.selected_date || !/^\d{4}-\d{2}-\d{2}$/.test(d.selected_date)) return null;
  const day = new Date(`${d.selected_date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const t = String(d.selected_time || '').trim();
  const hasTime = /\d/.test(t);
  return hasTime ? `${day} at ${t}` : day;
}
const daysLeft = (d: Draft) => Math.max(1, Math.ceil((new Date(d.expires_at).getTime() - Date.now()) / 86400_000));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Owner-approved trust facts (2026-10-02). Used verbatim; don't invent more.
const TRUST = {
  tenMin: 'Blood draws take 10 minutes or less.',
  labs: 'We deliver to Quest Diagnostics, Labcorp and AdventHealth.',
  notified: "You and your doctor are notified when samples are collected and delivered.",
  success: '99.9% success rate · 100% no-samples-lost guarantee.',
};
const TRUST_LINE_HTML = `<p style="font-size:13px;color:#6B5E54;margin-top:18px;">${TRUST.tenMin} ${TRUST.labs} ${TRUST.notified} ${TRUST.success}</p>`;

/** The one thing most likely holding them back, from what the flow knows. */
function worry(d: Draft): { key: string; sms: string; html: string } {
  const vt = d.visit_type || d.service_type || '';
  const when = whenLabel(d);
  const dayWord = d.selected_date && d.selected_date === new Date(Date.now() + 86400_000 + etOffset(new Date()) * 3600_000).toISOString().slice(0, 10) ? 'tomorrow' : (when ? `on ${when.split(' at ')[0]}` : 'this week');

  // "What brings you here?" from the landing page wins when we have it.
  switch (d.visit_reason) {
    case 'waiting_room':
      return { key: 'reason_waiting_room', sms: `Still want to skip the lab waiting room ${dayWord}? We come to you — ${TRUST.tenMin}`,
        html: `<p><strong>Still want to skip the lab waiting room ${esc(dayWord)}?</strong> We come to you, and ${TRUST.tenMin.charAt(0).toLowerCase()}${TRUST.tenMin.slice(1)} ${TRUST.labs}</p>` };
    case 'fasting':
      return { key: 'reason_fasting', sms: 'Fasting draw? We have early-morning slots so you can eat right after we leave.',
        html: `<p><strong>Fasting?</strong> We keep early-morning slots open so you can eat the moment we leave. ${TRUST.tenMin}</p>` };
    case 'loved_one':
      return { key: 'reason_loved_one', sms: 'Booking for someone you care for? We come to their door, and you can add them in one tap when you finish.',
        html: `<p><strong>Booking for someone you care for?</strong> We come to their door, their draw takes 10 minutes or less, and ${TRUST.notified.charAt(0).toLowerCase()}${TRUST.notified.slice(1)}</p>` };
    case 'needles':
      return { key: 'reason_needles', sms: `Nervous about needles? Our phlebotomists are one-try specialists — ${TRUST.success}`,
        html: `<p><strong>Nervous about needles?</strong> Our phlebotomists are one-try specialists — ${TRUST.success} You're on your own couch, and it's over in minutes.</p>` };
    case 'kids':
      return { key: 'reason_kids', sms: "Draw for a child? At home, with you right there — no waiting room. We're gentle and quick.",
        html: `<p><strong>Draw for a child?</strong> At home, with you right there, no waiting room. Our phlebotomists are gentle and quick — ${TRUST.tenMin.charAt(0).toLowerCase()}${TRUST.tenMin.slice(1)}</p>` };
    case 'busy':
      return { key: 'reason_busy', sms: `No time for the lab? Pick a slot that fits your day — ${TRUST.tenMin}`,
        html: `<p><strong>No time for the lab?</strong> Pick a slot that fits your day — early morning, lunch, or after work. ${TRUST.tenMin} ${TRUST.notified}</p>` };
    default: break;
  }

  if (vt === 'in-office') {
    return { key: 'in_office', sms: 'Your office visit takes about a minute to finish booking, and you pick the time.',
      html: '<p>Your office visit only needs a time — the rest is already filled in.</p>' };
  }
  if (d.lab_order_status === 'skipped' || d.lab_order_status === 'pending') {
    return { key: 'no_lab_order', sms: "No lab order in hand? No problem — we can get it from your doctor's office.",
      html: `<p><strong>Don't have your lab order yet?</strong> That's fine — we request it from your doctor's office for you. Reply with the practice name, or text us at ${SUPPORT_PHONE}, and we'll take it from there.</p>` };
  }
  if (d.fasting || vt === 'fasting-blood-draw') {
    return { key: 'fasting', sms: 'Fasting draw? We have early-morning slots so you can eat right after we leave.',
      html: '<p><strong>Fasting?</strong> We keep early-morning slots open so you can eat the moment we leave — no sitting hungry in a waiting room.</p>' };
  }
  if (d.lab_order_status === 'uploaded') {
    return { key: 'order_uploaded', sms: 'Your lab order is already uploaded — the rest takes about a minute.',
      html: '<p>Your lab order is already uploaded, so finishing takes about a minute: confirm the address, pay, done.</p>' };
  }
  if (d.step_key === 'checkout') {
    return { key: 'checkout', sms: 'Everything is filled in — one tap to confirm your time.',
      html: '<p>Everything is filled in. One tap confirms your time; you pay only when the visit is booked.</p>' };
  }
  return { key: 'general', sms: `Questions about price, insurance, or what to expect? Text us at ${SUPPORT_PHONE} — a real person answers.`,
    html: `<p>Questions about price, insurance, or what to expect? Reply to this email or text ${SUPPORT_PHONE} — a real person answers.</p>` };
}

function buildTouch(n: number, d: Draft, link: string) {
  const first = (d.first_name || '').trim() || 'there';
  const when = whenLabel(d);
  const label = visitLabel(d);
  const w = worry(d);
  const left = daysLeft(d);

  if (n === 1) {
    const slot = when ? `Your ${when} slot is held for a little while` : 'Your spot is held for a little while';
    return {
      sms: `Hi ${first} — ConveLabs here. Still need your lab draw? ${slot} — finish here: ${link} ${OPT_OUT_TAIL}`,
      subject: when ? `Your ${when} draw is held for a little while` : 'Finish booking your home blood draw',
      html: brandedEmailWrapper({
        headline: 'Still need your lab draw?',
        accent: 'We saved your spot.',
        greeting: `Hi ${esc(first)},`,
        bodyHtml: `<p>You were a couple of taps from booking your ${esc(label)}${when ? ` for <strong>${esc(when)}</strong>` : ''}. We're holding that time for a little while — pick up right where you left off.</p>${d.lab_order_status === 'skipped' || d.lab_order_status === 'pending' ? `<p style="font-size:14px;color:#6B5E54;">No lab order yet? That's fine — we can get it from your doctor.</p>` : ''}`,
        ctaLabel: 'Finish my booking',
        ctaHref: link,
        trustCloser: TRUST.tenMin,
      }),
      worry: w.key,
    };
  }
  if (n === 2) {
    return {
      sms: `Hi ${first} — ConveLabs. ${w.sms} Finish here: ${link} Or text us back with any question. ${OPT_OUT_TAIL}`,
      subject: when ? `Your ${when} draw — want us to handle the details?` : 'Want us to handle the details of your blood draw?',
      html: brandedEmailWrapper({
        headline: 'Want us to handle the details?',
        greeting: `Hi ${esc(first)},`,
        bodyHtml: `${w.html}<p>Your booking link still works${when ? ` and your <strong>${esc(when)}</strong> time is first in line if it's still open` : ''}. If the day changed, pick any other time on the same page.</p><p style="font-size:14px;color:#6B5E54;">Prefer to text? Message us at ${SUPPORT_PHONE} and we'll finish it with you.</p>${TRUST_LINE_HTML}`,
        ctaLabel: 'Finish my booking',
        ctaHref: link,
        trustCloser: TRUST.success,
      }),
      worry: w.key,
    };
  }
  return {
    sms: `Hi ${first} — ConveLabs. Still want that ${label}? Your link works for ${left} more day${left === 1 ? '' : 's'}: ${link} Text us a day that works and we'll set it up. ${OPT_OUT_TAIL}`,
    subject: 'Still want a home blood draw?',
    html: brandedEmailWrapper({
      headline: 'Still want a home blood draw?',
      accent: 'No pressure.',
      greeting: `Hi ${esc(first)},`,
      bodyHtml: `<p>Just checking in. Your booking link works for <strong>${left} more day${left === 1 ? '' : 's'}</strong>. If the timing changed, reply with a day that works and we'll find you a slot — or text ${SUPPORT_PHONE}.</p><p style="font-size:14px;color:#6B5E54;">This is our last note about it. If now isn't the time, no worries at all.</p>`,
      ctaLabel: 'Finish my booking',
      ctaHref: link,
    }),
    worry: w.key,
  };
}

// ── Sends ─────────────────────────────────────────────────────────────────
async function sendTouchSms(admin: any, d: Draft, n: number, body: string): Promise<'sent' | 'failed' | 'opted_out'> {
  const to = normalizePhone(d.phone);
  if (!to) return 'failed';
  let status: 'sent' | 'failed' | 'opted_out' = 'failed';
  let sid: string | null = null;
  let err: string | null = null;
  try {
    const res = await sendSMS(to, body);
    sid = res?.sid || null;
    status = 'sent';
  } catch (e: any) {
    err = e?.message || String(e);
    status = String(e?.code) === '21610' ? 'opted_out' : 'failed';
  }
  try {
    await admin.from('sms_notifications').insert({
      appointment_id: null,
      notification_type: `abandoned_recovery_t${n}`,
      phone_number: to,
      message_content: body,
      sent_at: new Date().toISOString(),
      delivery_status: status === 'sent' ? 'sent' : 'failed',
      twilio_message_sid: sid,
      metadata: { draft_id: d.id, touch: n, source: 'process-abandoned-bookings', error: err },
    });
  } catch (e) { console.warn('[abandoned] sms log failed', e); }
  return status;
}

async function sendTouchEmail(admin: any, d: Draft, n: number, subject: string, html: string): Promise<'sent' | 'failed'> {
  if (!d.email || !MAILGUN_API_KEY) return 'failed';
  const fd = new FormData();
  fd.append('from', FROM);
  fd.append('to', d.email);
  fd.append('subject', subject);
  fd.append('html', html);
  fd.append('h:Reply-To', 'info@convelabs.com');
  fd.append('o:tag', `abandoned_recovery_t${n}`);
  let res: Response | undefined;
  try {
    res = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST', headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd,
    });
  } catch (e) { console.warn('[abandoned] mailgun fetch failed', e); }
  await logOrgEmail(admin, { toEmail: d.email, emailType: `abandoned_recovery_t${n}`, subject, mailgunResponse: res, status: res?.ok ? 'sent' : 'failed', errorMessage: res ? null : 'fetch failed' });
  return res?.ok ? 'sent' : 'failed';
}

/** Already booked (→ recovered) or holding an upcoming visit (→ stop)? */
async function existingAppointment(admin: any, d: Draft): Promise<{ id: string; created_at: string } | null> {
  const ors: string[] = [];
  if (d.email) ors.push(`patient_email.ilike.${d.email}`);
  const last10 = String(d.phone || '').replace(/\D/g, '').slice(-10);
  if (last10.length === 10) ors.push(`patient_phone.like.%${last10}`);
  if (ors.length === 0) return null;
  const { data } = await admin
    .from('appointments')
    .select('id, created_at')
    .or(ors.join(','))
    .gte('appointment_date', todayET())
    .in('status', ['scheduled', 'confirmed', 'en_route', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1);
  return (data && data[0]) || null;
}

Deno.serve(async (req) => {
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) return json({ success: true, suspended: true });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Kill switch — ships false.
  const { data: setting } = await admin.from('system_settings').select('value').eq('key', 'abandoned_recovery_enabled').maybeSingle();
  const enabled = (setting as any)?.value === true || (setting as any)?.value === 'true';
  if (!enabled) return json({ success: true, disabled: true, reason: 'system_settings.abandoned_recovery_enabled is not true' });

  const gate = shouldSendNow('marketing');
  if (!gate.allow) return json({ deferred: true, reason: gate.reason, nextAllowedAt: gate.nextAllowedAt });

  // { draftId } sends that draft's next touch now (manual test / admin nudge);
  // the cron sends {} and only picks up drafts whose next_touch_at has passed.
  let draftId: string | undefined;
  try { const b = await req.json(); draftId = b?.force && b?.draftId ? String(b.draftId) : undefined; } catch { /* cron sends {} */ }

  const nowIso = new Date().toISOString();

  // Lazy expiry so the admin list and the cron agree.
  await admin.from('abandoned_bookings')
    .update({ stopped_at: nowIso, stop_reason: 'expired', next_touch_at: null })
    .is('stopped_at', null).is('recovered_at', null).lt('expires_at', nowIso);

  let q = admin.from('abandoned_bookings')
    .select('id, first_name, last_name, email, phone, visit_type, service_type, selected_date, selected_time, fasting, visit_reason, lab_order_status, step_key, sms_consent, touches_sent, touch_log, created_at, expires_at, last_activity_at')
    .is('stopped_at', null).is('recovered_at', null)
    .lt('touches_sent', MAX_TOUCHES)
    .order('next_touch_at', { ascending: true })
    .limit(MAX_PER_RUN);
  q = draftId ? q.eq('id', draftId) : q.lte('next_touch_at', nowIso);
  const { data: drafts, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const report: any[] = [];
  for (const d of (drafts || []) as Draft[]) {
    const n = Number(d.touches_sent || 0) + 1;
    try {
      const appt = await existingAppointment(admin, d);
      if (appt) {
        const bookedAfter = new Date(appt.created_at).getTime() >= new Date(d.created_at).getTime();
        await admin.from('abandoned_bookings').update(bookedAfter
          ? { recovered: true, recovered_at: nowIso, recovered_appointment_id: appt.id, stopped_at: nowIso, stop_reason: 'booked', next_touch_at: null }
          : { stopped_at: nowIso, stop_reason: 'existing_appointment', next_touch_at: null }).eq('id', d.id);
        report.push({ id: d.id, status: bookedAfter ? 'recovered' : 'stopped_existing_appointment' });
        continue;
      }

      const link = await resumeLinkFor(d.id);
      const copy = buildTouch(n, d, link);
      const wantSms = !!d.sms_consent && !!normalizePhone(d.phone);
      const wantEmail = !!d.email && (n > 1 || !wantSms);

      let sms: string | null = null, email: string | null = null;
      if (wantSms) sms = await sendTouchSms(admin, d, n, copy.sms);
      if (wantEmail || (wantSms && sms !== 'sent' && d.email)) email = await sendTouchEmail(admin, d, n, copy.subject, copy.html);

      const delivered = sms === 'sent' || email === 'sent';
      const entry = { touch: n, at: nowIso, sms, email, worry: copy.worry };
      const update: Record<string, unknown> = {
        touch_log: [...(Array.isArray(d.touch_log) ? d.touch_log : []), entry],
        last_touch_at: nowIso,
        recovery_sent: true,
      };
      if (sms === 'opted_out') {
        Object.assign(update, { stopped_at: nowIso, stop_reason: 'sms_opt_out', next_touch_at: null, sms_consent: false });
      } else if (delivered) {
        update.touches_sent = n;
        if (n === 1) update.next_touch_at = nextMorningET().toISOString();
        else if (n === 2) update.next_touch_at = new Date(Date.now() + TOUCH3_DELAY_MS).toISOString();
        else Object.assign(update, { next_touch_at: null, stopped_at: nowIso, stop_reason: 'sequence_complete' });
      } else {
        // Nothing went out (no channel / provider error). Retry in an hour;
        // after three failed attempts give up so a bad address can't loop.
        const failures = (Array.isArray(d.touch_log) ? d.touch_log : []).filter((t: any) => t && t.sms !== 'sent' && t.email !== 'sent').length + 1;
        if (failures >= 3) Object.assign(update, { next_touch_at: null, stopped_at: nowIso, stop_reason: 'undeliverable' });
        else update.next_touch_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      }
      await admin.from('abandoned_bookings').update(update).eq('id', d.id);
      report.push({ id: d.id, touch: n, sms, email, worry: copy.worry });
    } catch (e: any) {
      console.error('[abandoned] draft failed', d.id, e?.message || e);
      report.push({ id: d.id, touch: n, error: e?.message || String(e) });
    }
  }

  return json({ success: true, processed: report.length, report });
});
