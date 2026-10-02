/**
 * Does a `time_blocks` row apply on a given date?
 *
 * `time_blocks` has carried `recurring` and `recurring_day` since the staff
 * time-off UI was built, and that UI writes them and renders a "🔁 Monday"
 * badge so the block looks saved. Nothing ever read them. Every consumer —
 * this availability engine, the checkout guard, the verify guard, the patient
 * date picker, both reschedule modals and the recurring-series builder —
 * filtered on `start_date <= date <= end_date` and nothing else.
 *
 * So a weekly block silently applied to its one stored date range and did
 * nothing on every subsequent week. That is why a lunch break could not be
 * expressed: the storage was there, the UI was there, and the read was not.
 *
 * MIRROR THIS FILE in src/lib/timeBlocks.ts. The client greys the slot out and
 * this side refuses the booking; if the two disagree the patient gets a slot
 * that is visibly free and then rejected at checkout.
 */

export interface TimeBlockRow {
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  recurring?: boolean | null;
  recurring_day?: string | null;
  block_type?: string | null;
  reason?: string | null;
  staff_id?: string | null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Weekday name for a YYYY-MM-DD string. Noon avoids the timezone edge that
 *  makes a midnight-parsed date land on the previous day west of UTC. */
export function weekdayNameFor(dateIso: string): string {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`);
  return WEEKDAYS[d.getDay()] || '';
}

/**
 * True when the block covers `dateIso` (YYYY-MM-DD).
 *
 * One-off blocks: the original inclusive date-range test, unchanged.
 *
 * Recurring blocks: the weekday must match, and the date must be on or after
 * `start_date` so a block does not reach back before it was created.
 * `end_date` bounds the run ONLY when it is later than `start_date` — the
 * authoring UI requires both dates, so a weekly lunch is naturally saved with
 * the same day in both, and treating that as a one-day window would make
 * every recurring block expire the day it was made.
 */
export function timeBlockAppliesOn(block: TimeBlockRow, dateIso: string): boolean {
  const d = String(dateIso).slice(0, 10);
  if (!d) return false;

  if (!block.recurring) {
    return block.start_date <= d && d <= block.end_date;
  }

  if (d < block.start_date) return false;
  if (block.end_date > block.start_date && d > block.end_date) return false;

  const want = String(block.recurring_day || '').trim().toLowerCase();
  if (!want) return false; // recurring with no day is malformed — never match
  return weekdayNameFor(d) === want;
}

/**
 * Supabase filter for "blocks that could apply on this date".
 *
 * A recurring block's stored range is usually in the past, so the old
 * `start_date <= d AND end_date >= d` query excluded it before any weekday
 * logic could run. Recurring rows are pulled in wholesale and narrowed by
 * `timeBlockAppliesOn`; the table is small enough that this is cheap.
 */
export function timeBlockDateFilter(dateIso: string): string {
  const d = String(dateIso).slice(0, 10);
  return `recurring.is.true,and(start_date.lte.${d},end_date.gte.${d})`;
}

/**
 * Minutes a visit of this service type occupies. Mirrors VISIT_DURATIONS in
 * availability.ts and src/services/pricing/pricingService.ts; unknown types
 * fall back to the standard 60-minute visit.
 */
const BLOCK_VISIT_MINUTES: Record<string, number> = {
  'mobile': 60,
  'in-office': 60,
  'senior': 60,
  'therapeutic': 75,
  'specialty-kit': 75,
  'specialty-kit-genova': 80,
};
export function visitMinutesForBlocks(serviceType?: string | null): number {
  return BLOCK_VISIT_MINUTES[String(serviceType || '').toLowerCase()] || 60;
}

/**
 * Does a visit starting at `startMin` (minutes after midnight) and lasting
 * `durationMin` collide with a time-windowed block [blockStart, blockEnd)?
 *
 * Until 2026-10-02 every check only asked whether the visit STARTED inside
 * the window, so a 6:00 AM 60-minute visit sailed past a 6:15-7:45 block it
 * runs straight into. Overlap, not start-in-window, is the rule.
 */
export function visitOverlapsWindow(
  startMin: number,
  durationMin: number,
  blockStartMin: number,
  blockEndMin: number,
): boolean {
  return startMin < blockEndMin && startMin + Math.max(durationMin, 1) > blockStartMin;
}
