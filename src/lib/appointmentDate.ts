/**
 * APPOINTMENT DATE/TIME UTILITIES — Timezone-Safe Display
 *
 * Single source of truth for rendering appointment dates. The rule:
 *
 *   "Dates and times are strings. Never convert to a Date object until
 *    the last possible moment, and only for display formatting. The bug
 *    is not timezone math — the bug is doing timezone math at all."
 *
 * Prior bug pattern that these functions prevent:
 *
 *   ❌ new Date(appointment_date).toLocaleDateString()
 *      → reads UTC timestamp in local TZ
 *      → midnight UTC April 24 becomes "April 23" in ET
 *
 *   ✅ formatAppointmentDate(appointment_date)
 *      → extracts YYYY-MM-DD portion, anchors at noon-local
 *      → displayed day always matches stored day
 *
 * Use these helpers EVERYWHERE we render an appointment's date.
 * If a render path doesn't use one of these, it's a bug waiting to happen.
 */

export type DateInput = string | Date | null | undefined;

/**
 * Extract the YYYY-MM-DD portion of any date input, regardless of whether
 * it's a timestamp, ISO string, or Date object. If the input has a full
 * time component (like "2026-04-24T00:00:00Z"), the UTC date is used.
 *
 * For Date objects, uses LOCAL components (getFullYear/getMonth/getDate).
 */
export function toDateOnly(input: DateInput): string {
  if (!input) return '';
  if (typeof input === 'string') {
    // Already looks like YYYY-MM-DD... or timestamp starting with that
    if (/^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
    // Try to parse it
    const d = new Date(input);
    if (isNaN(d.getTime())) return '';
    return toDateOnlyFromDate(d);
  }
  return toDateOnlyFromDate(input);
}

function toDateOnlyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse a date-only string ("2026-04-24") into a Date object anchored at
 * noon local time. This avoids TZ boundary issues where UTC-midnight of a
 * date might display as the previous day in negative-offset locales.
 */
export function dateOnlyToLocalDate(dateOnly: string): Date {
  const s = dateOnly.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(NaN);
  // "2026-04-24T12:00:00" with no TZ suffix is parsed as local noon
  return new Date(`${s}T12:00:00`);
}

/**
 * Format an appointment date for display.
 * @example formatAppointmentDate("2026-04-24T00:00:00Z") → "Friday, April 24, 2026"
 */
export function formatAppointmentDate(
  input: DateInput,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
): string {
  const dateOnly = toDateOnly(input);
  if (!dateOnly) return '';
  const d = dateOnlyToLocalDate(dateOnly);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', options);
}

/**
 * Shorter format for cards, lists, etc.
 * @example formatAppointmentDateShort("2026-04-24") → "Fri, Apr 24"
 */
export function formatAppointmentDateShort(input: DateInput): string {
  return formatAppointmentDate(input, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Normalize an appointment time string to 12-hour clock format.
 * Accepts "10:30", "10:30:00", "10:30 AM", "22:30", etc.
 * @example formatAppointmentTime("10:30:00") → "10:30 AM"
 * @example formatAppointmentTime("10:30 AM") → "10:30 AM" (idempotent)
 */
export function formatAppointmentTime(time: string | null | undefined): string {
  if (!time) return '';
  const t = time.trim();
  // Already has AM/PM? Idempotent.
  if (/AM|PM/i.test(t)) {
    const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (m) return `${parseInt(m[1], 10)}:${m[2]} ${m[3].toUpperCase()}`;
    return t;
  }
  // HH:MM or HH:MM:SS 24-hr
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${min} ${period}`;
}

/**
 * Combined "Friday, April 24 at 10:30 AM" display format.
 */
export function formatAppointmentDateTime(date: DateInput, time: string | null | undefined): string {
  const dateStr = formatAppointmentDate(date);
  const timeStr = formatAppointmentTime(time);
  if (dateStr && timeStr) return `${dateStr} at ${timeStr}`;
  return dateStr || timeStr || '';
}
