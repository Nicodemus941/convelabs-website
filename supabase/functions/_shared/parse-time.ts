/**
 * Canonical time-string parser for ConveLabs edge functions.
 *
 * Replaces a thicket of inline regexes that historically defaulted to {0,0}
 * on bad input — silently producing midnight-anchored math that cascaded
 * into wrong patient-facing messages (Westphal fasting bug 2026-05-04).
 *
 * Hormozi Layer-1 discipline: failure must be loud. `parseTime` THROWS on
 * unparseable input; `parseTimeOrNull` returns null and the caller decides
 * how to handle it. Never return {0,0} from a "couldn't parse" branch.
 *
 * Accepted formats:
 *   - 12-hour: "6:00 AM", "06:00 PM", "12:00am", "9:30 a.m."
 *   - 24-hour: "06:00", "06:00:00", "14:30", "23:45:00"   (Postgres TIME type)
 *   - ISO timestamp: "2026-05-05T06:00:00Z" → returns the time part
 *
 * Returned shape:
 *   { h: 0..23, m: 0..59 }
 */

export interface ParsedTime { h: number; m: number; }

const AM_PM_RE = /^(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)$/i;
const H24_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::\d{2})?/;

export function parseTimeOrNull(input: unknown): ParsedTime | null {
  if (input == null) return null;
  const t = String(input).trim();
  if (!t) return null;

  // 12-hour with AM/PM
  const m12 = AM_PM_RE.exec(t);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const m = parseInt(m12[2], 10);
    const period = m12[3].toLowerCase().replace(/\./g, '');
    if (Number.isNaN(h) || Number.isNaN(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    return { h, m };
  }

  // 24-hour HH:MM or HH:MM:SS (Postgres TIME serializes here)
  const m24 = H24_RE.exec(t);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const m = parseInt(m24[2], 10);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return { h, m };
  }

  // ISO timestamp — pull time portion
  const iso = ISO_RE.exec(t);
  if (iso) {
    const h = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return { h, m };
  }

  return null;
}

/**
 * Strict variant: throws if input cannot be parsed. Use this whenever the
 * downstream calculation produces customer-facing copy — silently defaulting
 * to midnight is the bug class we're permanently eliminating.
 */
export function parseTime(input: unknown): ParsedTime {
  const r = parseTimeOrNull(input);
  if (!r) {
    throw new Error(`Unparseable time string: ${JSON.stringify(input)}`);
  }
  return r;
}

/** Format minutes-of-day → "h:mm AM" for human-readable copy. */
export function fmt12(totalMin: number): string {
  let h = Math.floor(totalMin / 60) % 24;
  if (h < 0) h += 24;
  const m = ((totalMin % 60) + 60) % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const mStr = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${displayH}${mStr} ${period}`;
}

/** Format minutes-of-day → "HH:MM" 24-hour string. */
export function fmt24(totalMin: number): string {
  let h = Math.floor(totalMin / 60) % 24;
  if (h < 0) h += 24;
  const m = ((totalMin % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
