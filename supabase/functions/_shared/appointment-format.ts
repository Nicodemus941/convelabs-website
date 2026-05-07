/**
 * Canonical formatter for appointment date + time strings in
 * patient-facing SMS / email bodies.
 *
 * BUG HISTORY (read this before changing anything):
 *
 * `appointments.appointment_date` stores the visit's calendar day as
 * UTC midnight (e.g. a Fri May 8 visit = `2026-05-08 00:00:00+00`).
 * The visit's actual CLOCK time lives in `appointment_time` ('HH:MM:SS'
 * as ET local).
 *
 * The earlier version of this helper did:
 *   new Date(value).toLocaleDateString('en-US', { timeZone: 'America/New_York' })
 *
 * UTC midnight on May 8 = May 7 8 PM ET during DST. So formatting in ET
 * rolled the WEEKDAY back one day. Hawthorn Mertz received "tomorrow
 * Thursday" on Wednesday for a Friday appointment. (2026-05-06.)
 *
 * Correct path: treat appointment_date as a DATE STRING, slice
 * yyyy-MM-dd, parse as noon-UTC anchor, format with timeZone:'UTC'.
 * Noon UTC cannot roll into a different day in any worldwide timezone
 * — there's no DST transition that crosses noon.
 *
 * This helper now delegates to `_shared/format-appt-date.ts` which is
 * the unified source of truth. Both helpers can coexist; new code
 * should prefer importing from format-appt-date directly.
 */

import {
  formatApptDateLong,
  formatApptDateShort,
  formatApptTime,
} from './format-appt-date.ts';

export interface FormattedAppt {
  /** "Friday, May 8, 2026" */
  date: string;
  /** "9:00 AM" — derived from appointment_time when present */
  time: string;
  /** "Friday, May 8 at 9:00 AM" — combined for one-line bodies */
  combined: string;
  /** "Fri, May 8" — short form */
  shortDate: string;
}

export function formatApptForPatient(
  appointmentDateValue: string | Date | null | undefined,
  appointmentTimeValue: string | null | undefined,
): FormattedAppt {
  const date = appointmentDateValue ? formatApptDateLong(appointmentDateValue) : '';
  const shortDate = appointmentDateValue ? formatApptDateShort(appointmentDateValue) : '';
  const time = appointmentTimeValue ? formatApptTime(appointmentTimeValue) : '';
  const combined = date && time ? `${shortDate} at ${time}` : (date || time || '');
  return { date, time, combined, shortDate };
}
