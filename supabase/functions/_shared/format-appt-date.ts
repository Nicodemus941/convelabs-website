/**
 * Patient-facing appointment date/time formatters — the ONLY correct way to
 * render `appointments.appointment_date` + `appointments.appointment_time`
 * in customer-facing copy.
 *
 * THE BUG THIS PREVENTS
 * ─────────────────────
 * `appointment_date` is a `timestamptz` column. We store calendar dates as
 * UTC midnight (e.g. a Friday May 8 visit is `2026-05-08 00:00:00+00`).
 * The visit's actual CLOCK time lives in the separate `appointment_time`
 * column (e.g. `11:00:00`). They were split this way because rolling out
 * timezone-aware appointment_date storage everywhere is a bigger refactor.
 *
 * Naive renderers do `new Date(appointment_date).toLocaleDateString('en-US', { timeZone: 'America/New_York' })`
 * — but `2026-05-08 00:00:00 UTC` is `2026-05-07 20:00 ET` during DST, so
 * the patient-facing label flips one day earlier. Hawthorn Mertz got
 * "tomorrow Thursday" on Wednesday for a Friday appointment. (2026-05-06.)
 *
 * THE FIX
 * ───────
 * Treat `appointment_date` as a CALENDAR DATE STRING. Slice the first 10
 * chars (yyyy-MM-dd), parse as a noon-UTC anchor, and format with
 * `timeZone: 'UTC'`. Noon UTC will never roll into a different day in any
 * worldwide timezone — there's no DST transition that crosses noon.
 *
 * USAGE
 * ─────
 *   import { formatApptDateLong, formatApptTime, formatApptDateShort } from '../_shared/format-appt-date.ts';
 *   const dateLabel = formatApptDateLong(appt.appointment_date); // "Friday, May 8, 2026"
 *   const timeLabel = formatApptTime(appt.appointment_time);     // "11:00 AM"
 *   const shortLabel = formatApptDateShort(appt.appointment_date); // "Fri May 8"
 */

/**
 * Long format: "Friday, May 8, 2026"
 * For: confirmation emails, 24h reminders, cancellation notices.
 */
export function formatApptDateLong(appointmentDate: string | Date | null | undefined): string {
  const dateOnly = extractDateOnly(appointmentDate);
  if (!dateOnly) return 'your scheduled date';
  // Anchor at noon UTC so neither east nor west TZ formatting can roll the day
  return new Date(dateOnly + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Short format: "Fri, May 8" (no year, no comma after weekday)
 * For: SMS where character count matters.
 */
export function formatApptDateShort(appointmentDate: string | Date | null | undefined): string {
  const dateOnly = extractDateOnly(appointmentDate);
  if (!dateOnly) return 'your scheduled date';
  return new Date(dateOnly + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Numeric format: "5/8/2026"
 * For: receipts, invoices, places where compact wins.
 */
export function formatApptDateNumeric(appointmentDate: string | Date | null | undefined): string {
  const dateOnly = extractDateOnly(appointmentDate);
  if (!dateOnly) return '';
  return new Date(dateOnly + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Time format: "11:00 AM" from `appointment_time` column ("HH:MM:SS").
 * appointment_time is the patient-facing clock time in ET — render as-is.
 */
export function formatApptTime(appointmentTime: string | null | undefined): string {
  if (!appointmentTime) return 'your scheduled time';
  const m = String(appointmentTime).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(appointmentTime);
  let h = parseInt(m[1], 10);
  const min = m[2];
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${period}`;
}

/**
 * Combined: "Friday, May 8 at 11:00 AM"
 * For: confirmation lines, "your appointment is on…" copy.
 */
export function formatApptDateTime(
  appointmentDate: string | Date | null | undefined,
  appointmentTime: string | null | undefined,
): string {
  return `${formatApptDateLong(appointmentDate)} at ${formatApptTime(appointmentTime)}`;
}

/**
 * Returns `true` if the appointment is the calendar day after now-in-ET.
 * Use this to gate "tomorrow" copy ("Your appointment is tomorrow…").
 *
 * Bug-prevention: the day-comparison is in ET, NOT UTC. A 6 PM ET cron
 * fire on Tue evaluating a Thu visit must not say "tomorrow."
 */
export function isApptTomorrowET(appointmentDate: string | Date | null | undefined): boolean {
  const apptDate = extractDateOnly(appointmentDate);
  if (!apptDate) return false;
  const tomorrowET = todayInETPlusDays(1);
  return apptDate === tomorrowET;
}

/**
 * Returns `true` if the appointment is today in ET.
 */
export function isApptTodayET(appointmentDate: string | Date | null | undefined): boolean {
  const apptDate = extractDateOnly(appointmentDate);
  if (!apptDate) return false;
  return apptDate === todayInETPlusDays(0);
}

/**
 * yyyy-MM-dd of (today in ET) + N days. Use for cron target-date math.
 */
export function todayInETPlusDays(days: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  // Anchor noon ET, add days, re-derive Y/M/D in ET (DST-safe)
  const anchor = new Date(`${y}-${m}-${d}T12:00:00-04:00`);
  const target = new Date(anchor);
  target.setDate(target.getDate() + days);
  const tParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(target);
  return `${tParts.find(p => p.type === 'year')!.value}-${tParts.find(p => p.type === 'month')!.value}-${tParts.find(p => p.type === 'day')!.value}`;
}

/**
 * Pull the yyyy-MM-dd part out of any appointment_date input. Accepts:
 *   - "2026-05-08"                       (date string)
 *   - "2026-05-08 00:00:00+00"           (timestamptz from Postgres)
 *   - "2026-05-08T00:00:00.000Z"         (JS ISO)
 *   - Date object pointing at UTC midnight
 *
 * For Date objects we use UTC y/m/d explicitly — `getFullYear/Month/Date`
 * would apply the host TZ and roll the day. Patient appointment_date is
 * stored as UTC midnight on the visit day; the calendar day we want is
 * the UTC date.
 */
function extractDateOnly(input: string | Date | null | undefined): string | null {
  if (!input) return null;
  if (typeof input === 'string') {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
  if (input instanceof Date && !isNaN(input.getTime())) {
    const y = input.getUTCFullYear();
    const m = String(input.getUTCMonth() + 1).padStart(2, '0');
    const d = String(input.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}
