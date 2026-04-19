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

  // DURATION-AWARE BLOCKING: each existing appointment blocks every grid slot
  // whose start falls within [appt_start, appt_start + duration + travel_buffer).
  // Travel buffer (mobile only) = 30 min so we don't book back-to-back draws
  // in different ZIP codes.
  const BUFFER_MIN_MOBILE = 30;
  const BUFFER_MIN_OFFICE = 0;
  const DEFAULT_DURATION_MIN = 30;
  const blockedMinuteRanges: Array<[number, number]> = [];
  for (const a of apptResp.data || []) {
    if (!a.appointment_time) continue;
    const { h, m } = parseTime(String(a.appointment_time));
    const start = h * 60 + m;
    const duration = (a.duration_minutes && a.duration_minutes > 0) ? a.duration_minutes : DEFAULT_DURATION_MIN;
    const buffer = a.service_type === 'in-office' ? BUFFER_MIN_OFFICE : BUFFER_MIN_MOBILE;
    blockedMinuteRanges.push([start, start + duration + buffer]);
  }
  const slotIsBooked = (t: string): boolean => {
    const { h, m } = parseTime(t);
    const slotMin = h * 60 + m;
    return blockedMinuteRanges.some(([s, e]) => slotMin >= s && slotMin < e);
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
