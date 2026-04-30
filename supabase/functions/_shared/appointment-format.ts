/**
 * Canonical formatter for appointment date + time strings in
 * patient-facing SMS / email bodies.
 *
 * Why this exists:
 *   `appointments.appointment_date` is a UTC `timestamptz`. Naively calling
 *   `new Date(appointment.appointment_date).toLocaleTimeString('en-US')`
 *   from inside an edge function (Deno runtime in UTC) renders the UTC
 *   hour as if it were local — e.g. 13:00 UTC ("9 AM ET" during DST)
 *   becomes "1:00 PM" in the rendered SMS.
 *
 *   The visit's clock-time the patient cares about lives in the separate
 *   `appointment_time` column ('HH:MM:SS' as ET local). This helper
 *   ALWAYS prefers `appointment_time` for the time string and pins the
 *   timezone for the date so we never roll into the prior/next day on
 *   late-evening UTC stamps.
 *
 * Usage:
 *   import { formatApptForPatient } from '../_shared/appointment-format.ts';
 *   const { date, time } = formatApptForPatient(appt.appointment_date, appt.appointment_time);
 *   // → date: "Friday, May 1, 2026"
 *   // → time: "9:00 AM"
 */

const TZ = 'America/New_York';

export interface FormattedAppt {
  /** "Friday, May 1, 2026" — in ET */
  date: string;
  /** "9:00 AM" — derived from appointment_time when present */
  time: string;
  /** "Friday, May 1 at 9:00 AM" — combined for one-line bodies */
  combined: string;
  /** "Fri, May 1" — short form */
  shortDate: string;
}

function fmtTimeFromHHMMSS(s: string | null | undefined, fallbackUtcDate?: Date): string {
  if (s) {
    const m = String(s).match(/^(\d{1,2}):(\d{2})/);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = m[2];
      const period = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${min} ${period}`;
    }
  }
  // Fallback: use the date column's hour-of-day in ET. Less reliable —
  // depends on how the row was written — but better than dropping the time.
  if (fallbackUtcDate && !isNaN(fallbackUtcDate.getTime())) {
    return fallbackUtcDate.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
    });
  }
  return '';
}

export function formatApptForPatient(
  appointmentDateValue: string | Date | null | undefined,
  appointmentTimeValue: string | null | undefined,
): FormattedAppt {
  const d = appointmentDateValue ? new Date(appointmentDateValue as any) : null;
  const validDate = d && !isNaN(d.getTime()) ? d : null;

  const date = validDate
    ? validDate.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ,
      })
    : '';

  const shortDate = validDate
    ? validDate.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ,
      })
    : '';

  const time = fmtTimeFromHHMMSS(appointmentTimeValue, validDate || undefined);

  const combined = date && time ? `${shortDate} at ${time}` : (date || time || '');

  return { date, time, combined, shortDate };
}
