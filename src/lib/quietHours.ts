/**
 * Client-side mirror of `supabase/functions/_shared/quiet-hours.ts`.
 *
 * The rule: no patient SMS/email between 9:00 PM and 8:00 AM Eastern.
 * The edge sender (`send-sms-notification`) treats a staff reply as
 * `admin_alert` (always-send), so the admin inbox is the gate for manual
 * texts: it warns, and requires an explicit confirm, inside the window.
 *
 * Browsers honour `timeZone` in Intl (the Deno edge runtime does not, which
 * is why the server helper does manual DST math) — so this stays simple.
 */

export const QUIET_START_HOUR = 21; // 9 PM ET
export const QUIET_END_HOUR = 8;    // 8 AM ET
const ET = 'America/New_York';

export function hourInET(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: ET }).format(now);
  const n = parseInt(h, 10);
  // Some engines render midnight as "24" with hour12:false.
  return Number.isFinite(n) ? n % 24 : now.getHours();
}

export function isQuietHoursET(now: Date = new Date()): boolean {
  const h = hourInET(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** "8:00 AM ET" / "tomorrow 8:00 AM ET" label for the confirm dialog. */
export function nextAllowedLabelET(now: Date = new Date()): string {
  const h = hourInET(now);
  return h >= QUIET_START_HOUR ? 'tomorrow at 8:00 AM ET' : 'today at 8:00 AM ET';
}

export function nowInETLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET }).format(now) + ' ET';
}
