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

// Default business-hour grid: 6am to 11:30am in 30-min increments. The
// org's time_window_rules will further restrict this per-date.
const DEFAULT_GRID_START = 6;  // 6:00 AM
const DEFAULT_GRID_END = 12;   // up to (but not including) 12:00 PM

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}

function baseGrid(): string[] {
  const grid: string[] = [];
  for (let h = DEFAULT_GRID_START; h < DEFAULT_GRID_END; h++) {
    grid.push(formatTime(h, 0));
    grid.push(formatTime(h, 30));
  }
  return grid;
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

  // If no rules, return full grid (but day-of-week sanity: no Sundays)
  if (!Array.isArray(timeWindowRules) || timeWindowRules.length === 0) {
    return dow === 0 ? [] : grid;
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
): Promise<AvailableSlot[]> {
  const allowed = slotsAllowedForDate(dateIso, timeWindowRules);
  if (allowed.length === 0) {
    // Day entirely out of window — return the grid all disabled with reason
    return baseGrid().map(t => ({ time: t, available: false, reason: 'outside_window' }));
  }

  // Load conflicts: appointments on this date for this org OR anywhere in our system
  // (we don't want ANY phleb double-booked — org scoping is UX, not a constraint)
  const dayStart = `${dateIso}T00:00:00`;
  const dayEnd = `${dateIso}T23:59:59`;
  const [apptResp, blockResp] = await Promise.all([
    supabase
      .from('appointments')
      .select('appointment_time, status, duration_minutes, service_type')
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
  // For each existing appointment at start S with duration D and travel
  // buffer B, we block:
  //   BACKWARD: slots T where S <= T < S + D + B   (slot starts during
  //             existing appointment or its travel window)
  //   FORWARD:  slots T where S - NEW_FOOTPRINT < T < S  (a new slot
  //             beginning here would bleed INTO the existing appointment)
  //
  // NEW_FOOTPRINT assumes the new appointment is 30 min + mobile buffer =
  // 60 min. So for an 8:00 AM existing appointment, the forward block is
  // (420, 480) — 7:00 is free (finishes by 8:00) but 7:30 is blocked
  // (a 7:30 draw would finish at 8:00 with zero travel time).
  const BUFFER_MIN_MOBILE = 30;
  const BUFFER_MIN_OFFICE = 0;
  const DEFAULT_DURATION_MIN = 30;
  const NEW_APPT_FOOTPRINT_MIN = DEFAULT_DURATION_MIN + BUFFER_MIN_MOBILE;

  const slotIsBooked = (t: string): boolean => {
    const { h: th, m: tm } = parseTime(t);
    const slotMin = th * 60 + tm;
    for (const a of apptResp.data || []) {
      if (!a.appointment_time) continue;
      const { h, m } = parseTime(String(a.appointment_time));
      const apptStart = h * 60 + m;
      const duration = (a.duration_minutes && a.duration_minutes > 0) ? a.duration_minutes : DEFAULT_DURATION_MIN;
      const buffer = a.service_type === 'in-office' ? BUFFER_MIN_OFFICE : BUFFER_MIN_MOBILE;
      const apptEnd = apptStart + duration + buffer;
      // Backward block (start-inclusive, end-exclusive)
      if (slotMin >= apptStart && slotMin < apptEnd) return true;
      // Forward block (both exclusive) — 7:00 OK, 7:30 blocked for an 8:00 existing appt
      if (slotMin > apptStart - NEW_APPT_FOOTPRINT_MIN && slotMin < apptStart) return true;
    }
    return false;
  };
  const fullyBlocked = (blockResp.data || []).length > 0;

  // Also exclude "too soon" — same-day bookings cut after 11am ET (can't mobilize phleb in < 2h)
  const now = nowET();
  const isToday = isoDate(now) === dateIso;
  const hasEnoughLead = (t: string) => {
    if (!isToday) return true;
    const { h, m } = parseTime(t);
    const slotMin = h * 60 + m;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return slotMin >= nowMin + 120; // need 2hr lead time
  };

  return baseGrid().map(t => {
    if (fullyBlocked) return { time: t, available: false, reason: 'blocked' };
    if (!allowed.includes(t)) return { time: t, available: false, reason: 'outside_window' };
    if (!hasEnoughLead(t)) return { time: t, available: false, reason: 'past' };
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
