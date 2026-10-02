/**
 * SMS-COPY — the one place patient-facing SMS strings are assembled.
 *
 * Why this exists (2026-10-02 messaging audit): 20+ edge functions each
 * build their own text with their own brand line, phone number, sign-off
 * and (mostly missing) opt-out language. Inbox-visible results today:
 *   "ConveLabs: …" / "Hi X — ConveLabs." / "Hi X! …" / no brand at all,
 *   "(941) 527-9169" vs no number, "Reply HELP" vs nothing,
 *   and the fasting reminder literally says "STOP 8:00 PM" — a carrier
 *   keyword — with no opt-out line anywhere.
 *
 * Rules enforced here:
 *   • Every text names the business once. Transactional texts open with
 *     the patient's FIRST name ("Hi Jane — ConveLabs here."); the brand
 *     prefix style ("ConveLabs: …") is reserved for terse status pings.
 *   • Marketing-class texts (review asks, referral nudges, promos) MUST
 *     carry an opt-out line (TCPA). Transactional texts carry "Reply HELP"
 *     only, so the message stays short.
 *   • One support number: (941) 527-9169. Never the 407 sending number.
 *   • Never use the words STOP / UNSUBSCRIBE / CANCEL / QUIT as prose —
 *     Twilio treats an inbound "STOP" as opt-out, so instructing a patient
 *     to "STOP eating at 8 PM" invites a reply that unsubscribes them.
 *   • Keep under 320 chars (2 segments) where the link allows.
 *
 * This module is Deno-side. The admin inbox's quick replies live in
 * `src/lib/smsQuickReplies.ts` and mirror the same sign-off so staff
 * replies read like the automated ones.
 */

export const BRAND = 'ConveLabs';
export const SUPPORT_PHONE = '(941) 527-9169';
export const SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

/** Tail for transactional texts. */
export const HELP_TAIL = `Reply HELP for help.`;
/** Tail for marketing-class texts — required by TCPA. */
export const OPT_OUT_TAIL = `Reply STOP to opt out.`;

export type SmsClass = 'transactional' | 'marketing';

/** First name only, never the full name on the wire. */
export function firstNameOf(name: string | null | undefined, fallback = 'there'): string {
  const f = String(name || '').trim().split(/\s+/)[0];
  return f || fallback;
}

/**
 * Append the right tail once. Idempotent: if the body already carries a
 * HELP/STOP line we don't double it.
 */
export function withTail(body: string, cls: SmsClass): string {
  const b = body.trim();
  const has = /reply\s+(help|stop)/i.test(b);
  if (has) return b;
  return `${b} ${cls === 'marketing' ? OPT_OUT_TAIL : HELP_TAIL}`;
}

/** Hard guard against prose that would read as a carrier keyword. */
export function assertNoCarrierKeywordProse(body: string): void {
  // Allowed only in the opt-out tail itself.
  const stripped = body.replace(/reply\s+stop\s+to\s+opt\s+out\.?/i, '');
  if (/\bSTOP\b/.test(stripped)) {
    console.warn('[sms-copy] body uses "STOP" as prose — rephrase (carrier keyword):', stripped.substring(0, 80));
  }
}

// ────────────────────────────────────────────────────────────────────────
// Templates. Pure functions → string. Add here, not inline in functions.
// ────────────────────────────────────────────────────────────────────────

export const SMS = {
  /** 36–60h out: confirm / reschedule / cancel link. (send-confirmation-requests) */
  confirmationRequest(p: { firstName: string; when: string; url: string }): string {
    return withTail(
      `Hi ${p.firstName} — ${BRAND} here. Quick confirm: still good for ${p.when}? Tap to confirm, reschedule, or cancel: ${p.url}`,
      'transactional',
    );
  },

  /** Post-visit: specimens left with the courier. */
  specimenConfirm(p: { firstName: string }): string {
    return withTail(
      `Hi ${p.firstName} — ${BRAND} here. Your specimens are on their way to the lab. We'll text your lab tracking ID once they're delivered. Thank you for choosing us!`,
      'transactional',
    );
  },

  /** Post-visit: Google review ask (marketing class → opt-out tail). */
  googleReview(p: { firstName: string; url: string }): string {
    return withTail(
      `Hi ${p.firstName} — ${BRAND} here. If your visit went well, would you share a quick Google review? It takes 30 seconds and helps other patients find us: ${p.url}`,
      'marketing',
    );
  },

  /** Post-visit: referral nudge (marketing class → opt-out tail). */
  referralPrompt(p: { firstName: string; code: string }): string {
    return withTail(
      `Hi ${p.firstName} — ${BRAND} here. Know someone who'd love a mobile blood draw? You both get $25 off with code ${p.code}: ${SITE}/book-now?ref=${encodeURIComponent(p.code)}`,
      'marketing',
    );
  },

  /** Manual invoice reminder (admin button). */
  invoiceReminder(p: { firstName: string; amount: string; payUrl?: string | null }): string {
    return withTail(
      p.payUrl
        ? `Hi ${p.firstName} — ${BRAND} here. Friendly reminder: your ${p.amount} invoice is still open. Pay securely on our site (tip optional): ${p.payUrl}`
        : `Hi ${p.firstName} — ${BRAND} here. Friendly reminder: your ${p.amount} invoice is still open. Reply here or call ${SUPPORT_PHONE} and we'll send a fresh pay link.`,
      'transactional',
    );
  },
};
