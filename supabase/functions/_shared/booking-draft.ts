/**
 * booking-draft — shared helpers for the abandoned-booking recovery loop.
 *
 *   booking-draft-upsert        writes a draft (public, called from /book-now)
 *   process-abandoned-bookings  sends the 3-touch sequence (cron)
 *   booking-draft-resolve       turns /book/resume/:token back into form state
 *   abandoned-booking-admin     mints a resume link for the admin list
 *   stripe-webhook /
 *   verify-appointment-checkout mark the draft recovered once the visit exists
 *
 * Resume token design: the row stores only sha256(token). The token itself is
 * HMAC-SHA256(secret, draft.id), base64url, so the cron can mint the link at
 * send time without the DB ever holding a usable token. A leaked DB dump
 * therefore does not yield resume links; a leaked secret does, so keep
 * BOOKING_RESUME_SECRET out of the client. When the env var is unset we fall
 * back to a hash of the service-role key so the loop works on day one — set a
 * dedicated secret before enabling the kill switch (see the report).
 */

const te = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function secretBytes(): Promise<Uint8Array> {
  const explicit = Deno.env.get('BOOKING_RESUME_SECRET');
  const raw = explicit || `resume:${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'dev'}`;
  const digest = await crypto.subtle.digest('SHA-256', te.encode(raw));
  return new Uint8Array(digest);
}

/** Deterministic token for a draft id. Never stored. */
export async function mintResumeToken(draftId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', await secretBytes(), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, te.encode(`booking-draft:${draftId}`));
  return b64url(sig);
}

/** What the row stores. */
export async function hashResumeToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', te.encode(token));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function siteUrl(): string {
  return (Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com').replace(/\/+$/, '');
}

export async function resumeLinkFor(draftId: string): Promise<string> {
  return `${siteUrl()}/book/resume/${await mintResumeToken(draftId)}`;
}

/** E.164 for US numbers; null when it is not a plausible 10-digit number. */
export function normalizePhone(p: string | null | undefined): string | null {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

export function normalizeEmail(e: string | null | undefined): string | null {
  const s = String(e || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/**
 * Called after an appointment row exists. Marks every open draft for the same
 * person (session, else email, else phone) as recovered and stops the
 * sequence. Never throws — recovery bookkeeping must not break a paid booking.
 */
export async function markBookingDraftRecovered(
  supabase: any,
  args: { appointmentId: string; sessionId?: string | null; email?: string | null; phone?: string | null; origin: string },
): Promise<number> {
  try {
    const email = normalizeEmail(args.email);
    const phone = normalizePhone(args.phone);
    const sessionId = String(args.sessionId || '').trim() || null;
    if (!email && !phone && !sessionId) return 0;

    const ors: string[] = [];
    if (sessionId) ors.push(`session_id.eq.${sessionId}`);
    if (email) ors.push(`email.eq.${email}`);
    if (phone) ors.push(`phone.eq.${phone}`);

    const { data: rows } = await supabase
      .from('abandoned_bookings')
      .select('id')
      .or(ors.join(','))
      .is('recovered_at', null)
      .gte('created_at', new Date(Date.now() - 14 * 86400_000).toISOString())
      .limit(20);
    const ids = (rows || []).map((r: any) => r.id);
    if (ids.length === 0) return 0;

    const now = new Date().toISOString();
    await supabase
      .from('abandoned_bookings')
      .update({
        recovered: true,
        recovered_at: now,
        recovered_appointment_id: args.appointmentId,
        stopped_at: now,
        stop_reason: 'booked',
        next_touch_at: null,
      })
      .in('id', ids);
    console.log(`[booking-draft] ${args.origin}: marked ${ids.length} draft(s) recovered by appointment ${args.appointmentId}`);
    return ids.length;
  } catch (e) {
    console.warn('[booking-draft] markBookingDraftRecovered failed (non-blocking):', e);
    return 0;
  }
}
