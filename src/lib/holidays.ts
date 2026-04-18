/**
 * US holiday calendar — the dates ConveLabs treats as closed.
 *
 * Per owner: office is closed on the following observed holidays +
 * the "eve" days for the major year-end ones:
 *   - New Year's Eve (Dec 31)          — closed
 *   - New Year's Day (Jan 1)           — federal
 *   - MLK Day (3rd Monday of Jan)      — federal
 *   - Juneteenth (Jun 19)              — federal
 *   - Independence Day (Jul 4)         — federal
 *   - Thanksgiving Eve (Wed before TG) — closed
 *   - Thanksgiving (4th Thursday Nov)  — federal
 *   - Christmas Eve (Dec 24)           — closed
 *   - Christmas Day (Dec 25)           — federal
 *
 * If the business ever expands or changes policy, update this single file.
 * Both the admin recurring scheduler AND the patient booking flow should
 * read from here so admin + patient see the same blocked days.
 */

export interface Holiday {
  dateIso: string;    // YYYY-MM-DD
  name: string;
  type: 'federal' | 'eve';
}

// ── Fixed-date helpers ──────────────────────────────────────────────

function iso(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Nth weekday of a month (used for MLK Day + Thanksgiving)
function nthWeekday(year: number, monthIndex: number, weekday: number, n: number): Date {
  // monthIndex 0-11, weekday 0=Sun..6=Sat, n=1..5
  const firstOfMonth = new Date(year, monthIndex, 1);
  const firstWeekday = firstOfMonth.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return new Date(year, monthIndex, day);
}

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Compute all observed holidays for a given year
export function holidaysForYear(year: number): Holiday[] {
  const mlkDate = nthWeekday(year, 0, 1, 3);          // 3rd Monday of January
  const thanksgivingDate = nthWeekday(year, 10, 4, 4); // 4th Thursday of November
  const thanksgivingEve = new Date(thanksgivingDate);
  thanksgivingEve.setDate(thanksgivingEve.getDate() - 1);

  return [
    { dateIso: iso(year, 0, 1),  name: "New Year's Day",   type: 'federal' },
    { dateIso: dateToIso(mlkDate), name: 'MLK Day',          type: 'federal' },
    { dateIso: iso(year, 5, 19), name: 'Juneteenth',         type: 'federal' },
    { dateIso: iso(year, 6, 4),  name: 'Independence Day',   type: 'federal' },
    { dateIso: dateToIso(thanksgivingEve), name: 'Thanksgiving Eve', type: 'eve' },
    { dateIso: dateToIso(thanksgivingDate), name: 'Thanksgiving', type: 'federal' },
    { dateIso: iso(year, 11, 24), name: 'Christmas Eve', type: 'eve' },
    { dateIso: iso(year, 11, 25), name: 'Christmas Day', type: 'federal' },
    { dateIso: iso(year, 11, 31), name: "New Year's Eve", type: 'eve' },
  ];
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Returns the matching holiday if dateIso falls on one, else null.
 * Cheap + deterministic — no external calendar API required.
 */
export function checkHoliday(dateIso: string): Holiday | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const year = parseInt(dateIso.slice(0, 4), 10);
  const holidays = holidaysForYear(year);
  return holidays.find(h => h.dateIso === dateIso) || null;
}

/**
 * Convenience: is this date a ConveLabs closure?
 */
export function isClosedHoliday(dateIso: string): boolean {
  return checkHoliday(dateIso) !== null;
}
