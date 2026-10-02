/**
 * UNLOCK-TOMORROW-SLOTS
 *
 * Daily cron (pg_cron jobid 44, 21:00 UTC = 5 PM ET). Premium-hours model
 * (2026-10-02): the only tier-held inventory is a WEEKEND slot more than 24 h
 * out. The release itself is time-based and evaluated live by
 * _shared/bookingWindows.ts (slot start − now ≤ 24 h) on the grid and at
 * checkout, so this job no longer gates anything. It keeps two duties:
 *   1. When tomorrow is Sat/Sun and open 6–11 AM slots remain, stamp
 *      slot_unlocks(tomorrow) (legacy readers: isDateUnlocked in the
 *      lab-request slot endpoints) with reason 'weekend_24h_release'.
 *   2. Notify everyone on slot_waitlist for that date (email + SMS) with a
 *      one-tap booking link — by 5 PM every slot of tomorrow is inside the
 *      24 h window, so the waitlist hears first while the release is fresh.
 * Weekdays have no held windows any more → skipped, nobody is messaged.
 *
 * Idempotent: re-running for the same date returns ok without re-stamping
 * or re-notifying (waitlist rows flip to 'notified').
 *
 * Body: { date?: 'YYYY-MM-DD', dry_run?: boolean }  (defaults to tomorrow ET)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { WEEKEND_WINDOWS, isWeekendDate } from '../_shared/bookingWindows.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function tomorrowET(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  now.setDate(now.getDate() + 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTime(t: string): { h: number; m: number } {
  // Postgres returns appointment_time as "HH:MM:SS"; the grid uses "H:MM AM".
  const h24 = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(t.trim());
  if (h24) return { h: parseInt(h24[1], 10), m: parseInt(h24[2], 10) };
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  if (!match) return { h: 0, m: 0 };
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return { h, m };
}

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Weekend grid starts, 15-min step, 6:00 … 10:45 AM. */
function weekendGrid(): string[] {
  const grid: string[] = [];
  for (let t = hhmmToMin(WEEKEND_WINDOWS.open); t < hhmmToMin(WEEKEND_WINDOWS.close); t += 15) {
    grid.push(formatTime(Math.floor(t / 60), t % 60));
  }
  return grid;
}

async function notifyEmail(to: string, name: string, dateIso: string, bookUrl: string) {
  if (!MAILGUN_API_KEY || !to) return false;
  const nice = new Date(dateIso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;">
    <div style="background:linear-gradient(135deg,#059669,#047857);color:#fff;padding:22px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="margin:0;font-size:20px;">A slot opened up for you — ${nice}</h1>
    </div>
    <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111827;">
      <p>Hi ${name || 'there'},</p>
      <p>You waitlisted for <strong>${nice}</strong> — weekend slots open to everyone 24 hours before they start, and there's still one open. Book it before someone else does.</p>
      <div style="text-align:center;margin:20px 0;">
        <a href="${bookUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Book your slot →</a>
      </div>
      <p style="font-size:13px;color:#6b7280;">Members book weekends free; non-members add a $10 premium-hours fee.</p>
      <p style="margin-top:16px;">— Nicodemme &ldquo;Nico&rdquo; Jean-Baptiste<br/><span style="color:#6b7280;font-size:13px;">ConveLabs</span></p>
    </div>
  </div>`;
  const fd = new FormData();
  fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
  fd.append('h:Reply-To', 'info@convelabs.com');
  fd.append('to', to);
  fd.append('subject', `Weekend slot open for ${nice} — book it now`);
  fd.append('html', html);
  fd.append('o:tag', 'waitlist_unlock_notification');
  try {
    const res = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: fd,
    });
    return res.ok;
  } catch (e) {
    console.warn('[unlock] mailgun failed:', e);
    return false;
  }
}

async function notifySms(toPhone: string, dateIso: string, bookUrl: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM || !toPhone) return false;
  const nice = new Date(dateIso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const norm = (() => {
    const d = toPhone.replace(/\D/g, '');
    if (d.length === 10) return `+1${d}`;
    if (d.length === 11 && d.startsWith('1')) return `+${d}`;
    if (toPhone.startsWith('+')) return toPhone;
    return `+${d}`;
  })();
  const body = `ConveLabs: A weekend slot for ${nice} is open to everyone now. Book it before it goes: ${bookUrl}`;
  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const fd = new URLSearchParams({ To: norm, From: TWILIO_FROM, Body: body });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fd.toString(),
    });
    return res.ok;
  } catch (e) {
    console.warn('[unlock] twilio failed:', e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let dateIso: string;
    let dryRun = false;
    try {
      const body = await req.json();
      dateIso = body?.date || tomorrowET();
      dryRun = body?.dry_run === true;
    } catch {
      dateIso = tomorrowET();
    }

    // 1. Idempotency — already unlocked?
    const { data: existing } = await admin
      .from('slot_unlocks' as any)
      .select('unlock_date')
      .eq('unlock_date', dateIso)
      .maybeSingle();

    // Weekdays carry no held windows under the premium-hours model: nothing
    // to release, nobody to message.
    if (!isWeekendDate(dateIso)) {
      return new Response(JSON.stringify({
        ok: true, date: dateIso, skipped: true, reason: 'weekday_no_held_windows',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Tomorrow's bookings → which 6–11 AM weekend starts are still open.
    const { data: appts } = await admin
      .from('appointments')
      .select('appointment_time, status, duration_minutes, service_type')
      .gte('appointment_date', `${dateIso}T00:00:00`)
      .lte('appointment_date', `${dateIso}T23:59:59`)
      .neq('status', 'cancelled');

    const bookedMinutes = new Set<number>();
    for (const a of (appts || []) as any[]) {
      if (!a.appointment_time) continue;
      const { h, m } = parseTime(String(a.appointment_time));
      const start = h * 60 + m;
      const dur = (a.duration_minutes && a.duration_minutes > 0) ? a.duration_minutes : 60;
      const buf = a.service_type === 'in-office' ? 0 : 30;
      for (let t = start; t < start + dur + buf; t += 15) bookedMinutes.add(t);
    }

    const tierLockedOpen = weekendGrid().filter(t => {
      const { h, m } = parseTime(t);
      return !bookedMinutes.has(h * 60 + m);
    });

    if (tierLockedOpen.length === 0) {
      return new Response(JSON.stringify({
        ok: true, date: dateIso, skipped: true, reason: 'no_open_weekend_slots',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true, dry_run: true, date: dateIso, would_unlock: tierLockedOpen,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Stamp slot_unlocks (idempotent via PK on unlock_date)
    if (!existing) {
      await admin.from('slot_unlocks' as any).insert({
        unlock_date: dateIso,
        reason: 'weekend_24h_release',
        unlocked_count: tierLockedOpen.length,
      });
    }

    // 4. Notify waitlist for this date
    const { data: waitlist } = await admin
      .from('slot_waitlist' as any)
      .select('id, email, phone, full_name, access_token, lab_request_id')
      .eq('desired_date', dateIso)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true });

    let notified = 0;
    for (const w of (waitlist || []) as any[]) {
      const bookUrl = w.access_token
        ? `${PUBLIC_SITE_URL}/lab-request/${w.access_token}?d=${dateIso}`
        : `${PUBLIC_SITE_URL}/book-now?d=${dateIso}`;
      const okEmail = await notifyEmail(w.email, w.full_name || '', dateIso, bookUrl);
      const okSms = w.phone ? await notifySms(w.phone, dateIso, bookUrl) : false;
      const via = okEmail && okSms ? 'both' : okEmail ? 'email' : okSms ? 'sms' : null;
      if (via) {
        await admin.from('slot_waitlist' as any)
          .update({ status: 'notified', notified_at: new Date().toISOString(), notified_via: via })
          .eq('id', w.id);
        notified++;
      }
    }

    // 5. Update unlock row with notify count
    await admin.from('slot_unlocks' as any)
      .update({ waitlist_notified_count: notified })
      .eq('unlock_date', dateIso);

    return new Response(JSON.stringify({
      ok: true,
      date: dateIso,
      unlocked_slots: tierLockedOpen.length,
      waitlist_notified: notified,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[unlock-tomorrow-slots]', e);
    return new Response(JSON.stringify({ error: 'unhandled', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
