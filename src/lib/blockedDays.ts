/**
 * The calendar days a time block covers.
 *
 * Pulled out of AdminCalendar so it can be tested: it decides what staff see
 * as unavailable, and it has two traps in it.
 *
 * A block carries a date range and, optionally, a time window. A window on a
 * multi-day block means "these hours, on each of those days" — not one
 * unbroken stretch from the first morning to the last. Rendered as a single
 * event, a Mon–Fri 7:00–8:45 block drew a continuous band from Monday morning
 * to Friday morning, painting the whole working week as blocked.
 *
 * Dates are walked at NOON LOCAL, not midnight: `new Date('2026-09-28')`
 * parses as UTC midnight, which is the evening of the 27th for a US-East
 * user, so a naive walk reports the wrong day and can drop the last one.
 */
export function blockedDays(startDate: string, endDate?: string | null): string[] {
  if (!startDate) return [];
  const last = endDate || startDate;

  const cursor = new Date(`${startDate}T12:00:00`);
  const stop = new Date(`${last}T12:00:00`);
  if (Number.isNaN(cursor.getTime())) return [];

  // A row whose end_date precedes its start_date exists in production. Show
  // its first day rather than silently dropping the block off the calendar —
  // a block nobody can see is worse than one that is a day short.
  if (Number.isNaN(stop.getTime()) || stop < cursor) return [startDate];

  const days: string[] = [];
  // 370 is a year and a bit. A longer range is a data-entry error, and
  // thousands of events would take the calendar down with it.
  for (let i = 0; i < 370 && cursor <= stop; i++) {
    days.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
