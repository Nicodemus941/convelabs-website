/**
 * When ConveLabs is open.
 *
 * There was no answer to this anywhere. The hours were written out separately
 * in the calendar's shading (Mon–Sat 06:00–18:00), the admin block picker
 * (6 AM–5 PM, hourly), and each reschedule modal's own TIME_SLOTS array
 * (from 9 AM, half-hourly) — four lists that disagreed, none of them editable
 * without a deploy. `service_availability` was built for this and left empty.
 *
 * One row in system_settings holds it now, and everything reads from here.
 *
 * DEFAULT_OFFICE_HOURS deliberately reproduces what the calendar already did,
 * so a deploy with nothing saved yet changes nothing on screen.
 */
export interface DayHours {
  /** 'HH:MM', 24-hour. */
  open: string;
  close: string;
  closed: boolean;
}

export interface OfficeHours {
  /** Seven entries, index 0 = Sunday, matching Date.getDay(). */
  days: DayHours[];
  /** Minutes between bookable times. */
  slotMinutes: number;
  /**
   * 'HH:MM'. A draw starting at or after this is after-hours and carries the
   * surcharge (+$50 today). This is money, not decoration: the reschedule
   * modals show these slots in amber under an "After Hours" heading, while the
   * recurring-series builder has no surcharge logic at all and must therefore
   * never offer one. It lives here so the boundary is one fact instead of a
   * cutoff re-typed into every picker.
   */
  afterHoursFrom: string;
}

export const OFFICE_HOURS_KEY = 'office_hours';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const OPEN_DAY: DayHours = { open: '06:00', close: '20:00', closed: false };

export const DEFAULT_OFFICE_HOURS: OfficeHours = {
  days: [
    { open: '06:00', close: '20:00', closed: true }, // Sunday — closed today
    { ...OPEN_DAY },
    { ...OPEN_DAY },
    { ...OPEN_DAY },
    { ...OPEN_DAY },
    { ...OPEN_DAY },
    { ...OPEN_DAY }, // Saturday
  ],
  // 15, not 30: the patient booking grid has run on 15-minute increments
  // since 2026-04-25 at the owner's request, and it is the screen with the
  // most at stake. The reschedule modals and the recurring builder widen to
  // match rather than narrowing patient choice to fit them.
  slotMinutes: 15,
  afterHoursFrom: '17:30',
};

/** A stored value may be partial, stale or hand-edited. Never trust its shape. */
export function normalizeOfficeHours(value: unknown): OfficeHours {
  const raw = (value ?? {}) as Partial<OfficeHours>;
  const days = Array.isArray(raw.days) ? raw.days : [];
  const step = Number(raw.slotMinutes);
  return {
    days: DEFAULT_OFFICE_HOURS.days.map((fallback, i) => {
      const d = days[i] as Partial<DayHours> | undefined;
      return {
        open: isTime(d?.open) ? (d!.open as string) : fallback.open,
        close: isTime(d?.close) ? (d!.close as string) : fallback.close,
        closed: typeof d?.closed === 'boolean' ? d.closed : fallback.closed,
      };
    }),
    slotMinutes: [15, 20, 30, 60].includes(step) ? step : DEFAULT_OFFICE_HOURS.slotMinutes,
    afterHoursFrom: isTime(raw.afterHoursFrom)
      ? (raw.afterHoursFrom as string)
      : DEFAULT_OFFICE_HOURS.afterHoursFrom,
  };
}

function isTime(v: unknown): boolean {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/**
 * The shape FullCalendar wants for its shaded business hours.
 *
 * Shades the REGULAR window only. A day runs to close (20:30 by default) so
 * the surcharged evening slots exist, but shading to there would tell staff
 * 8 PM is an ordinary working hour. The shaded band is the unsurcharged part.
 */
export function toBusinessHours(hours: OfficeHours) {
  const open = hours.days
    .map((d, i) => ({ d: { ...d, close: d.close < hours.afterHoursFrom ? d.close : hours.afterHoursFrom }, i }))
    .filter(({ d }) => !d.closed);
  if (open.length === 0) return [];
  // FullCalendar takes one entry per distinct window, so days sharing a
  // window are grouped rather than emitted seven times.
  const byWindow = new Map<string, number[]>();
  for (const { d, i } of open) {
    const key = `${d.open}-${d.close}`;
    byWindow.set(key, [...(byWindow.get(key) ?? []), i]);
  }
  return [...byWindow.entries()].map(([key, daysOfWeek]) => {
    const [startTime, endTime] = key.split('-');
    return { daysOfWeek, startTime, endTime };
  });
}

/** '06:00' → '6:00 AM', the format every picker in the app displays. */
export function to12Hour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * The bookable times for one weekday, as the pickers display them.
 * A closed day has none — which is the point: today every picker offers the
 * same list regardless of the day.
 */
export function slotsForDay(hours: OfficeHours, dayOfWeek: number): string[] {
  const day = hours.days[dayOfWeek];
  if (!day || day.closed) return [];
  const [oh, om] = day.open.split(':').map(Number);
  const [ch, cm] = day.close.split(':').map(Number);
  const startMin = oh * 60 + om;
  const endMin = ch * 60 + cm;
  if (!(endMin > startMin)) return [];

  const out: string[] = [];
  // The closing time is when the last visit ENDS, so it is not offered as a
  // start. 06:00–18:00 at 30 minutes gives 6:00 AM through 5:30 PM.
  for (let t = startMin; t < endMin; t += hours.slotMinutes) {
    out.push(to12Hour(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`));
  }
  return out;
}

/**
 * The vertical span the calendar grid must show.
 *
 * The grid was fixed at 06:00-21:00. Now that hours are editable, someone can
 * set a 05:00 open or a 22:00 close, and a fixed grid would simply hide it --
 * along with any appointment booked in it. This never hides an open hour, and
 * never shrinks below the span the calendar already showed.
 */
export function gridRange(hours: OfficeHours): { slotMinTime: string; slotMaxTime: string } {
  const open = hours.days.filter((d) => !d.closed);
  const earliest = open.reduce((min, d) => (d.open < min ? d.open : min), '06:00');
  const latest = open.reduce((max, d) => (d.close > max ? d.close : max), '21:00');
  return { slotMinTime: `${earliest}:00`, slotMaxTime: `${latest}:00` };
}

/** Whether a displayed time ('5:30 PM') falls in the surcharged window. */
export function isAfterHours(hours: OfficeHours, display: string): boolean {
  return minutesOf(display) >= minutesOf(to12Hour(hours.afterHoursFrom));
}

/**
 * Open times that carry no surcharge.
 *
 * Any picker that cannot add the after-hours fee must use this rather than
 * slotsForDay, or it will sell a surcharged slot at the regular price.
 */
export function regularSlots(hours: OfficeHours): string[] {
  return allSlots(hours).filter((t) => !isAfterHours(hours, t));
}

/**
 * Open times that carry the surcharge.
 *
 * The reschedule modals render these separately, in amber, under an
 * "After Hours (+$50)" heading -- so they need the surcharged set on its own,
 * not merged into the regular grid.
 */
export function afterHoursSlots(hours: OfficeHours): string[] {
  return allSlots(hours).filter((t) => isAfterHours(hours, t));
}

/** Every time the business is ever open, for pickers with no date chosen yet. */
export function allSlots(hours: OfficeHours): string[] {
  const seen = new Set<string>();
  for (let d = 0; d < 7; d++) for (const s of slotsForDay(hours, d)) seen.add(s);
  return [...seen].sort(
    (a, b) => minutesOf(a) - minutesOf(b)
  );
}

function minutesOf(display: string): number {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(display);
  if (!m) return 0;
  let h = Number(m[1]) % 12;
  if (m[3] === 'PM') h += 12;
  return h * 60 + Number(m[2]);
}
