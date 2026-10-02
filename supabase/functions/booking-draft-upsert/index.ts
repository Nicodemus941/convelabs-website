/**
 * BOOKING-DRAFT-UPSERT
 *
 * Public, no-auth (deploy with --no-verify-jwt). The booking flow calls this
 * from the Patient Info step onward, debounced, once the patient has typed a
 * valid email or phone. One row per browser session (session_id); later
 * calls update the same row so the draft always reflects the furthest step
 * reached and the latest field values.
 *
 * POST { session_id, first_name, last_name, email, phone, visit_type,
 *        service_type, selected_date, selected_time, fasting,
 *        lab_order_status, step_key, step_reached, resume_state, source,
 *        landing_page, utm, sms_consent, sms_consent_text }
 *
 * Returns { ok, id } — or { ok: true, closed: true } when the session's draft
 * has already been recovered/stopped, so the client rotates its session id.
 *
 * Why an edge function and not a direct insert: the anon key can no longer
 * write abandoned_bookings (migration DRAFT_20261002_abandoned_booking_recovery)
 * and the resume-token hash is derived from a server secret.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';
import { hashResumeToken, mintResumeToken, normalizeEmail, normalizePhone, otherOpenSmsDraftForPhone } from '../_shared/booking-draft.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const FIRST_TOUCH_DELAY_MS = 30 * 60 * 1000;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STATE_BYTES = 16 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const str = (v: unknown, max = 200): string | null => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const sessionId = str(body?.session_id, 80);
  if (!sessionId || sessionId.length < 16) return json({ error: 'session_id_required' }, 400);

  const email = normalizeEmail(body?.email);
  const phone = normalizePhone(body?.phone);
  if (!email && !phone) return json({ error: 'contact_required' }, 400);

  let resumeState: Record<string, unknown> | null = null;
  if (body?.resume_state && typeof body.resume_state === 'object') {
    const serialized = JSON.stringify(body.resume_state);
    if (serialized.length > MAX_STATE_BYTES) return json({ error: 'resume_state_too_large' }, 413);
    resumeState = body.resume_state;
  }

  let smsConsent = body?.sms_consent === true && !!phone;
  const now = new Date();
  const nowIso = now.toISOString();

  const fields: Record<string, unknown> = {
    first_name: str(body?.first_name, 80),
    last_name: str(body?.last_name, 80),
    email,
    phone,
    visit_type: str(body?.visit_type, 60),
    service_type: str(body?.service_type, 60),
    selected_date: str(body?.selected_date, 10),
    selected_time: str(body?.selected_time, 20),
    fasting: typeof body?.fasting === 'boolean' ? body.fasting : null,
    visit_reason: str(body?.visit_reason, 40),
    lab_order_status: ['uploaded', 'skipped', 'pending', 'unknown'].includes(body?.lab_order_status) ? body.lab_order_status : 'unknown',
    step_key: str(body?.step_key, 40),
    step_reached: Number.isFinite(Number(body?.step_reached)) ? Number(body.step_reached) : null,
    resume_state: resumeState,
    source: str(body?.source, 80),
    landing_page: str(body?.landing_page, 300),
    utm: body?.utm && typeof body.utm === 'object' ? body.utm : null,
    sms_consent: smsConsent,
    last_activity_at: nowIso,
  };

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: existing } = await admin
      .from('abandoned_bookings')
      .select('id, touches_sent, recovered, stopped_at, sms_consent, sms_consent_at')
      .eq('session_id', sessionId)
      .maybeSingle();

    // Per-phone cap: one open text-capable draft per number. A second tab /
    // device (or a bot) for the same phone is saved email-only; the
    // processor re-checks at send time as well.
    let smsCapped = false;
    if (smsConsent) {
      const other = await otherOpenSmsDraftForPhone(admin, phone, (existing as any)?.id || null);
      if (other) { smsConsent = false; smsCapped = true; fields.sms_consent = false; }
    }

    if (existing) {
      if ((existing as any).recovered || (existing as any).stopped_at) {
        // Booked (or opted out / expired). Don't resurrect; the client starts
        // a fresh session for the next booking.
        return json({ ok: true, closed: true });
      }
      const update: Record<string, unknown> = { ...fields };
      // Consent timestamp + text are set the first time the box is ticked and
      // kept; unticking flips the flag but keeps the audit trail.
      if (smsConsent && !(existing as any).sms_consent_at) {
        update.sms_consent_at = nowIso;
        update.sms_consent_text = str(body?.sms_consent_text, 400);
        update.consent_ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
        update.consent_user_agent = str(req.headers.get('user-agent'), 300);
      }
      // Activity pushes touch 1 back out to +30 min; once touch 1 has gone
      // out, the sequence keeps its own clock.
      if (Number((existing as any).touches_sent || 0) === 0) {
        update.next_touch_at = new Date(now.getTime() + FIRST_TOUCH_DELAY_MS).toISOString();
      }
      const { error } = await admin.from('abandoned_bookings').update(update).eq('id', (existing as any).id);
      if (error) throw error;
      return json({ ok: true, id: (existing as any).id, sms_capped: smsCapped || undefined });
    }

    const id = crypto.randomUUID();
    const tokenHash = await hashResumeToken(await mintResumeToken(id));
    const insert: Record<string, unknown> = {
      id,
      session_id: sessionId,
      ...fields,
      resume_token_hash: tokenHash,
      expires_at: new Date(now.getTime() + DRAFT_TTL_MS).toISOString(),
      next_touch_at: new Date(now.getTime() + FIRST_TOUCH_DELAY_MS).toISOString(),
      touches_sent: 0,
      recovered: false,
      recovery_sent: false,
      created_at: nowIso,
    };
    if (smsConsent) {
      insert.sms_consent_at = nowIso;
      insert.sms_consent_text = str(body?.sms_consent_text, 400);
      insert.consent_ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      insert.consent_user_agent = str(req.headers.get('user-agent'), 300);
    }
    const { error } = await admin.from('abandoned_bookings').insert(insert);
    if (error) {
      // Lost a race with a parallel call for the same session — fine.
      if (String(error.code) === '23505') return json({ ok: true, raced: true });
      throw error;
    }
    return json({ ok: true, id, sms_capped: smsCapped || undefined });
  } catch (e: any) {
    console.error('[booking-draft-upsert]', e?.message || e);
    return json({ error: 'upsert_failed', message: e?.message || String(e) }, 500);
  }
});
