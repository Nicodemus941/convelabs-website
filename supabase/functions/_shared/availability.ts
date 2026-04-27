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

// ET date helpers
function nowET(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
export async function getAvailableSlotsForDate(
  supabase: SupabaseClient,
  orgId: string,
  dateIso: string,
  timeWindowRules: any,
  labDestination?: string | null,
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
      .select('start_date, end_date')
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
  function detectCityFromAddress(addr: string | null | undefined): string | null {
    if (!addr) return null;
    const parts = String(addr).split(',').map(s => s.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[1].toLowerCase() : null;
  }
  function isExtendedAreaCity(city: string | null | undefined): boolean {
    if (!city) return false;
    return EXTENDED_AREA_CITIES.includes(city.toLowerCase().trim());
  }
  function getBufferMinutes(a: any): number {
    let b = 0;
    if (a.service_type && HEAVY_SERVICE_TYPES[String(a.service_type).toLowerCase()]) b += 30;
    if (isExtendedAreaCity(detectCityFromAddress(a.address))) b += 30;
    if (a.family_group_id) b += 15;
    return b;
  }

  const DEFAULT_DURATION_MIN = 60;
  const NEW_APPT_FOOTPRINT_MIN = 60; // new 60-min slot, no buffer for the new appt itself

  const slotIsBooked = (t: string): boolean => {
    const { h: th, m: tm } = parseTime(t);
    const slotMin = th * 60 + tm;
    for (const a of apptResp.data || []) {
      if (!a.appointment_time) continue;
      const { h, m } = parseTime(String(a.appointment_time));
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
  const fullyBlocked = (blockResp.data || []).length > 0;

  // Same-day lead time — phleb needs SAME_DAY_LEAD_MIN (90 min) to mobilize.
  // Removed the prior hard 11 AM cutoff; this is the only same-day filter now.
  const now = nowET();
  const isToday = isoDate(now) === dateIso;
  const hasEnoughLead = (t: string) => {
    if (!isToday) return true;
    const { h, m } = parseTime(t);
    const slotMin = h * 60 + m;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return slotMin >= nowMin + SAME_DAY_LEAD_MIN;
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
    if (!allowed.includes(t)) return { time: t, available: false, reason: 'outside_window' };
    if (!hasEnoughLead(t)) return { time: t, available: false, reason: 'past' };
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
): Promise<boolean> {
  const slots = await getAvailableSlotsForDate(supabase, orgId, dateIso, timeWindowRules);
  const match = slots.find(s => s.time === time);
  return !!match?.available;
}
