/**
 * BOOKING-DRAFT-RESOLVE
 *
 * Public, no-auth (deploy with --no-verify-jwt). Turns /book/resume/:token
 * back into booking-flow state. The token is the only credential: we hash it
 * and look the row up by hash (the token itself is never stored).
 *
 * GET /booking-draft-resolve?token=...
 *
 * Returns
 *   { ok: true, draft: {...}, slot: { requested, available, alternatives[] } }
 *   { ok: false, expired: true } | { ok: false, booked: true }
 *   { ok: false, error: 'token_not_found' }   (404)
 *
 * The slot check reuses the canonical availability logic so the resume page
 * can say "that time is gone — here are the next three" instead of letting
 * the patient rediscover it at checkout.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { hashResumeToken } from '../_shared/booking-draft.ts';
import { getAvailableSlotsForDate, normalizeSlotTime } from '../_shared/availability.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// ET calendar date (the DST-aware shift mirrors _shared/quiet-hours.ts).
function isUSEasternDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  const marchStart = (() => { const d = new Date(Date.UTC(year, 2, 1)); const firstSun = 1 + ((7 - d.getUTCDay()) % 7); return Date.UTC(year, 2, firstSun + 7, 7); })();
  const novEnd = (() => { const d = new Date(Date.UTC(year, 10, 1)); const firstSun = 1 + ((7 - d.getUTCDay()) % 7); return Date.UTC(year, 10, firstSun, 6); })();
  const t = date.getTime();
  return t >= marchStart && t < novEnd;
}
function todayET(): string {
  const now = new Date();
  const shifted = new Date(now.getTime() + (isUSEasternDST(now) ? -4 : -5) * 3600_000);
  return shifted.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get('token') || '').trim();
    if (!token || token.length < 16 || token.length > 128) return json({ ok: false, error: 'token_required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const hash = await hashResumeToken(token);

    const { data: row } = await admin
      .from('abandoned_bookings')
      .select('id, first_name, last_name, email, phone, visit_type, service_type, selected_date, selected_time, fasting, visit_reason, lab_order_status, step_key, step_reached, resume_state, sms_consent, expires_at, recovered, stopped_at, stop_reason, resume_open_count')
      .eq('resume_token_hash', hash)
      .maybeSingle();

    if (!row) return json({ ok: false, error: 'token_not_found' }, 404);

    const r = row as any;
    if (r.recovered || r.stop_reason === 'booked') return json({ ok: false, booked: true });
    if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) return json({ ok: false, expired: true });

    // Non-blocking open stamp.
    admin.from('abandoned_bookings').update({
      resume_opened_at: new Date().toISOString(),
      resume_open_count: Number(r.resume_open_count || 0) + 1,
    }).eq('id', r.id).then(() => {}, () => {});

    // ── Slot check ────────────────────────────────────────────────────
    const today = todayET();
    const reqDate: string | null = /^\d{4}-\d{2}-\d{2}$/.test(String(r.selected_date || '')) ? r.selected_date : null;
    const reqTime: string | null = normalizeSlotTime(r.selected_time || '');
    let available = false;
    const alternatives: Array<{ date: string; time: string; label: string }> = [];

    try {
      if (reqDate && reqTime && reqDate >= today) {
        const slots = await getAvailableSlotsForDate(admin, '', reqDate, null, undefined, r.visit_type || r.service_type || null);
        available = !!slots.find(s => s.time === reqTime && s.available);
      }
      if (!available) {
        // Up to three alternatives, scanning from the later of tomorrow and
        // the requested day, one or two per day, seven days out at most.
        let d = reqDate && reqDate > today ? reqDate : addDays(today, 1);
        for (let i = 0; i < 7 && alternatives.length < 3; i++) {
          const slots = await getAvailableSlotsForDate(admin, '', d, null, undefined, r.visit_type || r.service_type || null);
          const open = slots.filter(s => s.available);
          // Prefer the requested time-of-day if it exists on another day.
          const sameTime = reqTime ? open.find(s => s.time === reqTime) : undefined;
          const picks = sameTime ? [sameTime, ...open.filter(s => s !== sameTime).slice(0, 1)] : open.slice(0, 2);
          for (const s of picks) {
            if (alternatives.length >= 3) break;
            alternatives.push({ date: d, time: s.time, label: `${dayLabel(d)} · ${s.time}` });
          }
          d = addDays(d, 1);
        }
      }
    } catch (e) {
      console.warn('[booking-draft-resolve] slot check failed (non-blocking):', e);
    }

    return json({
      ok: true,
      draft: {
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone: r.phone,
        visit_type: r.visit_type,
        service_type: r.service_type,
        selected_date: r.selected_date,
        selected_time: r.selected_time,
        fasting: r.fasting,
        visit_reason: r.visit_reason,
        lab_order_status: r.lab_order_status,
        step_key: r.step_key,
        step_reached: r.step_reached,
        resume_state: r.resume_state,
        sms_consent: !!r.sms_consent,
        expires_at: r.expires_at,
      },
      slot: {
        requested: reqDate ? { date: reqDate, time: r.selected_time || null } : null,
        available,
        alternatives,
      },
    });
  } catch (e: any) {
    console.error('[booking-draft-resolve]', e?.message || e);
    return json({ ok: false, error: 'resolve_failed' }, 500);
  }
});
