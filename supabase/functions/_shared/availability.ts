// Live-availability computation for slot grids. Single source of truth used
// by get-lab-request-slots, schedule-lab-request, preoffered-slots, and
// twilio-inbound-sms so the patient web page, the SMS reply options, and
// the final booking transaction all see the same reality.
//
// Rules enforced here:
//   1. draw_by_date: no slots after it (caller supplies)
//   2. today: no slots in the past (includes not-enough-lead-time: today
//      after 11am cuts today's slots entirely to avoid same-day no-shows)
//   3. org's time_window_rules (e.g. Restoration Place 6-9am only)
//   4. appointments conflicts (any non-cancelled appt at the same slot)
//   5. time_blocks (full-day closures like holidays / owner-blocked days)
//
// Deliberately NOT handled here:
//   - slot_holds — separate ephemeral reservation mechanism (not yet wired
//     into patient flow; when we add it, plug it in here)
//   - phleb capacity — single-phleb assumption for now

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

export interface TimeWindowRule {
  dayOfWeek: number[]; // 0 = Sun, 6 = Sat
  startHour: number;
  endHour: number;
  label?: string;
}

// Default business-hour grid: 6 AM to 6:30 PM in 30-min increments
// (last slot 6:30 PM, ends at 7 PM). Was 6 AM-11:30 AM previously which
// silently killed all afternoon bookings — visitor lands at 1 PM looking
// for a 4 PM same-day, sees zero options, bounces. The org's
// time_window_rules and lab destination cutoff further restrict per-date.
// Hormozi simplification 2026-04-25: business hours are now Mon–Sun 6 AM – 6 PM
// for everyone. Last bookable slot start = 5:30 PM, ending at 6 PM.
const DEFAULT_GRID_START = 6;  // 6:00 AM
const DEFAULT_GRID_END = 18;   // up to (but not including) 6:00 PM (last slot 5:30 PM)

// Minimum lead time for same-day bookings — phleb mobilization buffer.
// Was 120 min ("can't mobilize phleb in < 2h"); user confirmed 90 min is
// realistic so we open another 30 min of same-day inventory.
const SAME_DAY_LEAD_MIN = 90;

// Lab destination drop-off cutoffs. Source of truth for "latest appointment
// start time" given which lab will receive the specimen. Computed as:
//   lab close time − 30 min drop-off buffer − 60 min visit + travel = LATEST_START
// User-confirmed values (2026-04-25):
//   LabCorp        weekday 2:30 PM close → drop by 2:00 → last appt 12:30 PM
//                  weekend 12:00 PM close → drop by 11:30 → last appt 10:00 AM
//   LabCorp (ext)  weekday 4:00 PM close → drop by 3:30 → last appt 2:00 PM
//                  weekend 12:00 PM close → last appt 10:00 AM
//   Quest          weekday 3:30 PM close → drop by 3:00 → last appt 1:30 PM
//                  weekend 12:00 PM close → last appt 10:00 AM
//   AdventHealth   24/7 → no cap; patient grid extends to 8 PM Mon-Sun
// `null` cutoff means "no cap, use default grid end".
// (Orlando Health intentionally not supported — 2026-04-25)
type LabCutoff = { weekdayLastMin: number | null; weekendLastMin: number | null };
const LAB_CUTOFFS: Record<string, LabCutoff> = {
  'labcorp':           { weekdayLastMin: 12 * 60 + 30, weekendLastMin: 10 * 60 },
  'labcorp_extended':  { weekdayLastMin: 14 * 60,      weekendLastMin: 10 * 60 },
  'quest':             { weekdayLastMin: 13 * 60 + 30, weekendLastMin: 10 * 60 },
  'quest_diagnostics': { weekdayLastMin: 13 * 60 + 30, weekendLastMin: 10 * 60 },
  // AdventHealth accepts specimens 24/7 — patients can book Mon-Sun up to
  // 8 PM (last slot 7:30 PM). Day-of-week + tier gating are bypassed when
  // adventhealth is the destination (see ADVENT_HEALTH_KEYS handling below).
  'adventhealth':      { weekdayLastMin: null,         weekendLastMin: null },
  // Specialty kit shipments (UPS/FedEx) need same-day pickup
  'ups':               { weekdayLastMin: 14 * 60,      weekendLastMin: null },
  'fedex':             { weekdayLastMin: 14 * 60,      weekendLastMin: null },
};

// Destinations that operate 7 days a week with extended hours. When picked,
// the slot picker uses a 6 AM - 7:30 PM grid (end hour 20) and ignores the
// standard Sunday block + tier-gating windows. The specimen routes only to
// the named lab — never to LabCorp/Quest.
const ADVENT_HEALTH_KEYS = new Set(['adventhealth']);
const ADVENT_HEALTH_GRID_END = 18; // last slot 5:30 PM (closes at 6 PM)

function normalizeLabKey(s: string | null | undefined): string | null {
  if (!s) return null;
  return String(s).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Returns the latest minute-of-day slot can START to make the lab cutoff.
 * Returns null when no cap applies (AdventHealth 24/7 or no destination).
 */
function lastSlotMinForLab(labDest: string | null | undefined, dateIso: string): number | null {
  const key = normalizeLabKey(labDest);
  if (!key) return null;
  const cfg = LAB_CUTOFFS[key];
  if (!cfg) return null; // unknown lab → no cap (safer than blocking)
  const dow = new Date(dateIso + 'T12:00:00').getDay();
  const isWeekend = dow === 0 || dow === 6;
  return isWeekend ? cfg.weekendLastMin : cfg.weekdayLastMin;
}

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Normalize ANY time string to the canonical "H:MM AM/PM" format used by
 * the slot grid. Accepts:
 *   - "6:00 AM"        — already canonical (slot picker)
 *   - "06:00 AM"       — zero-padded hour
 *   - "11:30:00"       — 24-hour with seconds (HTML form value)
 *   - "11:30"          — 24-hour HH:MM (HTML5 time input default)
 *   - "11:30:00.123"   — 24-hour with fractional seconds (Postgres time)
 * Returns the canonical form, or null if the input can't be parsed.
 *
 * This is the fix for the bug surfaced by the 2026-04-30 E2E test: every
 * call to create-appointment-checkout that sent 24-hour time was rejected
 * with "slot_unavailable" because the slot grid stores 12-hour AM/PM.
 */
export function normalizeSlotTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const trimmed = String(t).trim();

  // Already canonical "H:MM AM/PM" (with optional zero-padded hour)
  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/.exec(trimmed);
  if (ampm) {
    const h = parseInt(ampm[1], 10);
    const m = ampm[2];
    return `${h}:${m} ${ampm[3].toUpperCase()}`;
  }

  // 24-hour HH:MM or HH:MM:SS (with optional fractional)
  const h24 = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(trimmed);
  if (h24) {
    const h = parseInt(h24[1], 10);
    const m = parseInt(h24[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return formatTime(h, m);
    }
  }

  return null;
}

function baseGrid(endHour: number = DEFAULT_GRID_END): string[] {
  // 15-min increments per owner request 2026-04-25 — patients can now book
  // :15 and :45 of the hour in addition to :00 and :30. The bidirectional
  // duration-aware blocking automatically respects every slot in the grid,
  // so a 30-min draw at 10:00 still blocks 10:15 / 10:30 (and 10:45 via
  // the 30-min buffer), no other code needed.
  const grid: string[] = [];
  for (let h = DEFAULT_GRID_START; h < endHour; h++) {
    grid.push(formatTime(h, 0));
    grid.push(formatTime(h, 15));
    grid.push(formatTime(h, 30));
    grid.push(formatTime(h, 45));
  }
  return grid;
}

export function isAdventHealthDestination(dest: string | null | undefined): boolean {
  const k = normalizeLabKey(dest);
  return !!k && ADVENT_HEALTH_KEYS.has(k);
}

// ET date helpers.
// Critical bug (2026-05-18 audit): the original nowET() round-tripped
// toLocaleString — broken on Deno edge. First fix attempt used
// Intl.DateTimeFormat with timeZone option, but Deno's bundled tzdata
// does NOT honor it (verified live: server reported "08:58" when real
// ET was 12:58). Final fix: compute the offset manually from US DST
// rules. Stable since 2007.
function isUSEasternDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  // 2nd Sunday in March at 2 AM EST → DST begins
  const marchStart = (() => {
    const d = new Date(Date.UTC(year, 2, 1));
    const dow = d.getUTCDay();
    const firstSun = 1 + ((7 - dow) % 7);
    return Date.UTC(year, 2, firstSun + 7, 7); // 2 AM EST = 7 AM UTC
  })();
  // 1st Sunday in November at 2 AM EDT → DST ends
  const novEnd = (() => {
    const d = new Date(Date.UTC(year, 10, 1));
    const dow = d.getUTCDay();
    const firstSun = 1 + ((7 - dow) % 7);
    return Date.UTC(year, 10, firstSun, 6); // 2 AM EDT = 6 AM UTC
  })();
  const t = date.getTime();
  return t >= marchStart && t < novEnd;
}
function etOffsetHours(date: Date): number {
  return isUSEasternDST(date) ? -4 : -5;
}
function nowET(): Date {
  // Returns a Date whose UTC components carry the ET wall-clock values.
  // Downstream code reads via getUTCHours/Minutes/Year/Month/Date so
  // behavior is identical regardless of the server's local TZ.
  const real = new Date();
  const offsetMs = etOffsetHours(real) * 3600 * 1000;
  return new Date(real.getTime() + offsetMs);
}

function isoDate(d: Date): string {
  // After nowET()'s shift, .getUTCFullYear/Month/Date carry the ET date.
  // Use UTC accessors so behavior matches across runtimes.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Parse "8:00 AM" into hour, minute
function parseTime(t: string): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  if (!match) return { h: 0, m: 0 };
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return { h, m };
}

// Filter the default grid by an org's time_window_rules for a given date.
export function slotsAllowedForDate(dateIso: string, timeWindowRules: any): string[] {
  const grid = baseGrid();
  const date = new Date(dateIso + 'T12:00:00');
  const dow = date.getDay();

  // No org rules → Mon–Sun 6 AM – 6 PM (per uniform business hours 2026-04-25)
  if (!Array.isArray(timeWindowRules) || timeWindowRules.length === 0) {
    return grid;
  }

  // Find the rule that includes this day-of-week
  const rule = (timeWindowRules as TimeWindowRule[]).find(r =>
    Array.isArray(r.dayOfWeek) && r.dayOfWeek.includes(dow)
  );
  if (!rule) return []; // not an allowed day

  // Filter grid by start/end hour
  return grid.filter(t => {
    const { h, m } = parseTime(t);
    const totalMin = h * 60 + m;
    return totalMin >= rule.startHour * 60 && totalMin < rule.endHour * 60;
  });
}

export interface AvailableSlot {
  time: string;
  available: boolean;
  reason?: 'past' | 'booked' | 'blocked' | 'outside_window';
  // Tier-gating (populated when caller passes tier info):
  //   requires_tier: minimum membership tier needed to book this slot
  //   unlock_price_cents: annual cost to upgrade
  //   visit_savings_cents: how much patient saves on THIS visit if they join
  requires_tier?: string;
  unlock_price_cents?: number;
  visit_savings_cents?: number;
}

/**
 * Returns the full slot grid for a date, with each slot marked available/unavailable.
 * Grey out unavailable slots on the UI (still visible so patients see what's been
 * taken, not just a shorter menu — Hormozi: visible unavailability signals demand).
 */
/**
 * @param newServiceType — service_type of the NEW appointment being booked.
 *   Used to scale the forward-block lookback (60 min for mobile/in-office,
 *   75 for therapeutic/specialty-kit, 80 for specialty-kit-genova). Pre-fix
 *   was hardcoded 60, so a 75-min therapeutic booking 10:30 -> 11:45 could
 *   slip through the grid against an existing 11:30 appt and only get caught
 *   by the server-side checkout 409. Default 'mobile' preserves prior
 *   behavior for callers that don't yet pass the field.
 */
const VISIT_DURATIONS: Record<string, number> = {
  'mobile': 60,
  'in-office': 60,
  'senior': 60,
  'therapeutic': 75,
  'specialty-kit': 75,
  'specialty-kit-genova': 80,
};

export async function getAvailableSlotsForDate(
  supabase: SupabaseClient,
  orgId: string,
  dateIso: string,
  timeWindowRules: any,
  labDestination?: string | null,
  newServiceType?: string | null,
): Promise<AvailableSlot[]> {
  // AdventHealth bypass: 7-day extended hours (6 AM - 7:30 PM, Sun included).
  // Org time_window_rules and standard Sunday block are ignored — the lab
  // accepts specimens 24/7 so patient-side hours can run wide.
  const isAdvent = isAdventHealthDestination(labDestination);
  const gridEnd = isAdvent ? ADVENT_HEALTH_GRID_END : DEFAULT_GRID_END;
  const localGrid = baseGrid(gridEnd);
  const allowed = isAdvent ? localGrid : slotsAllowedForDate(dateIso, timeWindowRules);
  if (allowed.length === 0) {
    // Day entirely out of window — return the grid all disabled with reason
    return localGrid.map(t => ({ time: t, available: false, reason: 'outside_window' }));
  }

  // Load conflicts: appointments on this date for this org OR anywhere in our system
  // (we don't want ANY phleb double-booked — org scoping is UX, not a constraint)
  const dayStart = `${dateIso}T00:00:00`;
  const dayEnd = `${dateIso}T23:59:59`;
  const [apptResp, blockResp] = await Promise.all([
    supabase
      .from('appointments')
      .select('appointment_time, status, duration_minutes, service_type, address, family_group_id')
      .gte('appointment_date', dayStart)
      .lte('appointment_date', dayEnd)
      .neq('status', 'cancelled'),
    supabase
      .from('time_blocks' as any)
      .select('start_date, end_date, start_time, end_time')
      .lte('start_date', dateIso)
      .gte('end_date', dateIso),
  ]);

  // BIDIRECTIONAL DURATION-AWARE BLOCKING.
  // Buffer math owner-confirmed 2026-04-27. Default is 0 — a regular $150
  // mobile draw runs its `duration_minutes` and that's it. Buffer only
  // applies to the conditions below (mirrored in src/lib/bookingBuffer.ts):
  //   • +30 specialty-kit / specialty-kit-genova / therapeutic / partner-aristotle-education
  //   • +30 extended-area city (additive on top of service buffer)
  //   • +15 same-address companion (family_group_id present)
  //
  // For each existing appointment at start S with duration D and computed
  // buffer B we block:
  //   BACKWARD: slots T where S <= T < S + D + B
  //   FORWARD:  slots T where S - NEW_FOOTPRINT < T < S
  //
  // NEW_FOOTPRINT assumes the candidate new appointment is 60 min (mobile
  // base) — that's how far back a new start could land while still finishing
  // at S. Specialty/therapeutic candidates are caught by the BACKWARD block.
  const HEAVY_SERVICE_TYPES: Record<string, true> = {
    'specialty-kit': true,
    'specialty-kit-genova': true,
    'therapeutic': true,
    'partner-aristotle-education': true,
  };
  const EXTENDED_AREA_CITIES = [
    'lake nona', 'celebration', 'kissimmee', 'sanford', 'eustis',
    'clermont', 'montverde', 'deltona', 'geneva', 'tavares',
    'mount dora', 'leesburg', 'groveland', 'mascotte', 'minneola',
    'daytona beach', 'deland', 'debary', 'orange city',
  ];
  // Zip fallback for free-text addresses that fail the city substring match.
  // Kept in sync with get_busy_slots() RPC + src/lib/bookingBuffer.ts.
  const EXTENDED_ZIPS = new Set([
    '32827','32832','34747',
    '34741','34742','34743','34744','34745','34746','34758','34759',
    '32771','32772','32773',
    '32726','32727','32736',
    '34711','34712','34713','34714','34715',
    '34756','32725','32738','32732','32778','32757',
    '34748','34788','34789','34736','34753',
    '32114','32115','32117','32118','32119','32120','32121','32122','32123','32124','32125','32126','32127','32128','32129',
    '32720','32721','32722','32723','32724','32713','32763',
  ]);
  function detectCityFromAddress(addr: string | null | undefined): string | null {
    if (!addr) return null;
    const parts = String(addr).split(',').map(s => s.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[1].toLowerCase() : null;
  }
  function isExtendedAreaCity(city: string | null | undefined): boolean {
    if (!city) return false;
    return EXTENDED_AREA_CITIES.includes(city.toLowerCase().trim());
  }
  // Robust extended-area detector mirroring get_busy_slots() RPC:
  // city-substring (with delimiter boundary so "Sanford Street" in Orlando
  // doesn't false-positive) + zip fallback for missing-city addresses.
  function addressLooksExtended(addr: string | null | undefined): boolean {
    if (!addr) return false;
    const lower = String(addr).toLowerCase();
    for (const city of EXTENDED_AREA_CITIES) {
      const re = new RegExp(`(^|[ ,])${city}($|,| fl[^a-z]| fl$|\\s+\\d)`);
      if (re.test(lower)) return true;
    }
    const zipRe = /(^|[^0-9])([0-9]{5})($|[^0-9])/g;
    let m: RegExpExecArray | null;
    while ((m = zipRe.exec(String(addr))) !== null) {
      if (EXTENDED_ZIPS.has(m[2])) return true;
    }
    return false;
  }
  function getBufferMinutes(a: any): number {
    let b = 0;
    if (a.service_type && HEAVY_SERVICE_TYPES[String(a.service_type).toLowerCase()]) b += 30;
    if (isExtendedAreaCity(detectCityFromAddress(a.address)) || addressLooksExtended(a.address)) b += 30;
    if (a.family_group_id) b += 15;
    return b;
  }

  const DEFAULT_DURATION_MIN = 60;
  // Scale the new-appt footprint to the actual service duration so the
  // forward-block lookback is honest. Therapeutic (75 min) / specialty-kit
  // (75) / specialty-kit-genova (80) now block more time in front of the
  // next existing appt. Default to 60 when newServiceType is missing so
  // legacy callers keep working unchanged.
  const NEW_APPT_FOOTPRINT_MIN = VISIT_DURATIONS[String(newServiceType || '').toLowerCase()] || 60;

  // Helper: parse either canonical "11:30 AM" OR Postgres TIME "11:30:00".
  // Server-side bug surfaced 2026-05-18: appointment_time from Postgres
  // returns as "HH:MM:SS" but parseTime() only matched the 12-hour AM/PM
  // form, returning {h:0,m:0} for every existing appt — meaning the server's
  // last-mile slotIsBooked() check NEVER blocked anything. Now we normalize
  // first so both formats work.
  const parseTimeFlexible = (raw: string): { h: number; m: number } => {
    const canonical = normalizeSlotTime(raw);
    if (canonical) return parseTime(canonical);
    return parseTime(raw); // fallback to original behavior
  };
  const slotIsBooked = (t: string): boolean => {
    const { h: th, m: tm } = parseTimeFlexible(t);
    const slotMin = th * 60 + tm;
    for (const a of apptResp.data || []) {
      if (!a.appointment_time) continue;
      const { h, m } = parseTimeFlexible(String(a.appointment_time));
      const apptStart = h * 60 + m;
      const duration = (a.duration_minutes && a.duration_minutes > 0) ? a.duration_minutes : DEFAULT_DURATION_MIN;
      const buffer = getBufferMinutes(a);
      const apptEnd = apptStart + duration + buffer;
      // Backward block (start-inclusive, end-exclusive)
      if (slotMin >= apptStart && slotMin < apptEnd) return true;
      // Forward block (both exclusive)
      if (slotMin > apptStart - NEW_APPT_FOOTPRINT_MIN && slotMin < apptStart) return true;
    }
    return false;
  };
  // Split blocks into day-wide vs time-windowed. A row with start_time +
  // end_time set blocks ONLY that window of the day (e.g. "block 6am
  // 5/4 just for me"). A row with no times blocks the entire day.
  const allBlocks = (blockResp.data || []) as any[];
  const fullyBlocked = allBlocks.some(b => !b.start_time || !b.end_time);
  const windowBlocks = allBlocks.filter(b => b.start_time && b.end_time);
  const slotInsideWindowBlock = (t: string): boolean => {
    if (windowBlocks.length === 0) return false;
    const { h, m } = parseTime(t);
    const tMin = h * 60 + m;
    return windowBlocks.some(b => {
      const { h: sh, m: sm } = parseTime(String(b.start_time));
      const { h: eh, m: em } = parseTime(String(b.end_time));
      const sMin = sh * 60 + sm;
      const eMin = eh * 60 + em;
      // start-inclusive, end-exclusive (matches our existing booking logic)
      return tMin >= sMin && tMin < eMin;
    });
  };

  // Same-day lead time — phleb needs SAME_DAY_LEAD_MIN (90 min) to mobilize.
  // Plus the same-day cutoff (3 PM ET default, relaxed when a phleb is on
  // duty). Pre-fix: server enforced ONLY the lead time, so malformed POSTs
  // could book after-hours slots even with no phleb scheduled to work them.
  // The client UI showed the 3 PM cutoff but never wrote it through.
  const now = nowET();
  const isToday = isoDate(now) === dateIso;
  // Read getUTCHours after nowET()'s wall-clock shift — these now match ET.
  const etHourNow = now.getUTCHours();
  const etMinNow = now.getUTCMinutes();
  const hasEnoughLead = (t: string) => {
    if (!isToday) return true;
    const { h, m } = parseTime(t);
    const slotMin = h * 60 + m;
    const nowMin = etHourNow * 60 + etMinNow;
    return slotMin >= nowMin + SAME_DAY_LEAD_MIN;
  };

  // Same-day cutoff: 3 PM default. When a phleb has flipped on-duty for
  // today via OnDutyToggle (writes phleb_duty_status.duty_through), the
  // cutoff extends to that timestamp so post-3PM slots stay open. Read
  // lazily — only fetch the duty status when isToday and we'd otherwise
  // need to block.
  let sameDayCutoffMin = 15 * 60; // 3 PM
  if (isToday && etHourNow * 60 + etMinNow >= sameDayCutoffMin) {
    try {
      const { data: dutyRow } = await (supabase as any).rpc('get_any_phleb_on_duty_now');
      const row = Array.isArray(dutyRow) ? dutyRow[0] : dutyRow;
      if (row?.on_duty && row?.duty_through) {
        const through = new Date(row.duty_through);
        // Convert duty_through (UTC) to ET wall-clock hour using same
        // Intl trick so cutoff math agrees with the patient UI.
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
        const parts = fmt.formatToParts(through);
        const dH = Number(parts.find(p => p.type === 'hour')?.value || 0);
        const dM = Number(parts.find(p => p.type === 'minute')?.value || 0);
        const dutyMin = (dH === 24 ? 0 : dH) * 60 + dM;
        sameDayCutoffMin = Math.max(sameDayCutoffMin, dutyMin);
      }
    } catch { /* non-blocking — fall back to 3 PM cutoff */ }
  }
  const passesSameDayCutoff = (t: string) => {
    if (!isToday) return true;
    const { h, m } = parseTime(t);
    const slotMin = h * 60 + m;
    // Block the slot only when current ET time is already past the
    // effective cutoff. Pre-cutoff, all slots that pass the lead-time
    // check remain bookable regardless of when they sit in the afternoon.
    const nowMin = etHourNow * 60 + etMinNow;
    if (nowMin < sameDayCutoffMin) return true;
    // Past the cutoff (e.g. 3 PM with no phleb on duty) — only future
    // slots within the relaxed window pass. With sameDayCutoffMin already
    // = 3 PM in the default case, this rejects every slot once 3 PM hits.
    return slotMin > nowMin && slotMin <= sameDayCutoffMin;
  };

  // Lab destination cutoff — slots after the lab's drop-off cutoff are
  // operationally unbookable for that destination. Returns null cap when
  // the destination is AdventHealth (24/7) or unknown.
  const labCutoffMin = lastSlotMinForLab(labDestination, dateIso);
  const fitsLabCutoff = (t: string) => {
    if (labCutoffMin === null) return true;
    const { h, m } = parseTime(t);
    return h * 60 + m <= labCutoffMin;
  };

  return localGrid.map(t => {
    if (fullyBlocked) return { time: t, available: false, reason: 'blocked' };
    if (slotInsideWindowBlock(t)) return { time: t, available: false, reason: 'blocked' };
    if (!allowed.includes(t)) return { time: t, available: false, reason: 'outside_window' };
    if (!hasEnoughLead(t)) return { time: t, available: false, reason: 'past' };
    if (!passesSameDayCutoff(t)) return { time: t, available: false, reason: 'same_day_cutoff' };
    if (!fitsLabCutoff(t)) return { time: t, available: false, reason: 'outside_window' };
    if (slotIsBooked(t)) return { time: t, available: false, reason: 'booked' };
    return { time: t, available: true };
  });
}

/**
 * Layer tier-gating info onto the base availability slots. If a slot is
 * technically open but outside the current tier's window, it flips to
 * unavailable with a 'tier_locked' reason + populates unlock offer fields.
 * Kept SEPARATE from getAvailableSlotsForDate so the provider-initiated
 * lab-request flow can opt out of tier gating (providers booking on behalf
 * of their patients bypass tier windows — the org's time_window_rules are
 * the only constraint).
 */
export function withTierGating(
  slots: AvailableSlot[],
  dateIso: string,
  currentTier: string,
  serviceType: 'mobile' | 'in-office' = 'mobile',
  tierGatingModule: {
    minTierForSlot: (d: string, t: string) => string;
    slotUnlockOffer: (cur: string, req: string, st: string) => { unlock_price_cents: number; visit_savings_cents: number; required_tier: string };
    TIER_ORDER: string[];
  },
): AvailableSlot[] {
  const { minTierForSlot: minTier, slotUnlockOffer, TIER_ORDER } = tierGatingModule;
  return slots.map(s => {
    if (!s.available) return s;
    const required = minTier(dateIso, s.time);
    const currentIdx = TIER_ORDER.indexOf(currentTier);
    const requiredIdx = TIER_ORDER.indexOf(required);
    if (requiredIdx <= currentIdx) return s; // slot accessible at current tier
    const offer = slotUnlockOffer(currentTier, required, serviceType);
    return {
      ...s,
      available: false,
      reason: 'tier_locked' as any,
      requires_tier: required,
      unlock_price_cents: offer.unlock_price_cents,
      visit_savings_cents: offer.visit_savings_cents,
    };
  });
}

/**
 * Returns the next N available slots starting tomorrow, stopping at drawByDate.
 * Used for SMS pre-offered slot computation so patients never see booked slots
 * in their SMS options.
 */
export async function nextAvailableSlots(
  supabase: SupabaseClient,
  orgId: string,
  drawByDateIso: string,
  timeWindowRules: any,
  count = 3,
): Promise<Array<{ date: string; time: string; label: string }>> {
  const results: Array<{ date: string; time: string; label: string }> = [];
  const drawBy = new Date(drawByDateIso + 'T23:59:59');
  const d = new Date(nowET());
  d.setDate(d.getDate() + 1); // start tomorrow
  d.setHours(0, 0, 0, 0);

  while (results.length < count && d.getTime() <= drawBy.getTime()) {
    const dateIso = isoDate(d);
    const slots = await getAvailableSlotsForDate(supabase, orgId, dateIso, timeWindowRules);
    // Pick the FIRST available slot for each day — typically an 8am morning slot
    const first = slots.find(s => s.available);
    if (first) {
      const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      results.push({
        date: dateIso,
        time: first.time,
        label: `${dateLabel} ${first.time.replace(':00 ', '').toLowerCase()}`,
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return results;
}

/**
 * Last-mile race-condition guard. Call immediately before inserting an
 * appointment to re-check availability at write time. If the slot got taken
 * in the seconds between page-load and submit, we catch it here.
 */
/**
 * Returns true when the daily 5 PM unlock sweep has stamped the given date —
 * meaning tier gating should be DROPPED (formerly VIP-only afternoon slots
 * become bookable by anyone). Callers should query this before calling
 * withTierGating and skip the gating step when true.
 */
export async function isDateUnlocked(supabase: SupabaseClient, dateIso: string): Promise<boolean> {
  const { data } = await supabase
    .from('slot_unlocks' as any)
    .select('unlock_date')
    .eq('unlock_date', dateIso)
    .maybeSingle();
  return !!data;
}

export async function isSlotStillAvailable(
  supabase: SupabaseClient,
  orgId: string,
  dateIso: string,
  time: string,
  timeWindowRules: any,
  newServiceType?: string | null,
): Promise<boolean> {
  // Normalize whatever the caller sent ("11:30:00" / "11:30" / "11:30 AM")
  // to the canonical "H:MM AM/PM" the slot grid uses. Without this, every
  // 24-hour-formatted time was silently rejected as "slot_unavailable".
  const canonical = normalizeSlotTime(time);
  if (!canonical) return false;
  const slots = await getAvailableSlotsForDate(supabase, orgId, dateIso, timeWindowRules, undefined, newServiceType);
  const match = slots.find(s => s.time === canonical);
  return !!match?.available;
}
