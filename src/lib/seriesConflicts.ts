/**
 * Series conflict detection — used by the admin recurring scheduler.
 *
 * Given a proposed list of (date, time) slots, returns a Conflict[] enumerating
 * which ones cannot proceed AND provides alternative slots for that same date
 * so the admin can pivot in-context (Hormozi: "show the fix with the problem").
 *
 * Conflict sources, in priority:
 *   1. Holiday — office closed
 *   2. time_blocks — office_closure entry in the database
 *   3. existing appointments — already booked at that (date, time)
 *   4. slot_holds — another checkout flow actively holding that slot
 */

import { supabase } from '@/integrations/supabase/client';
import { checkHoliday } from './holidays';

export interface ProposedSlot {
  dateIso: string;       // YYYY-MM-DD
  time: string;          // "9:00 AM"
  sequence: number;      // 1-indexed position in the series
}

export type ConflictReason = 'holiday' | 'office_closure' | 'appointment' | 'slot_hold';

export interface Conflict {
  dateIso: string;
  time: string;
  sequence: number;
  reason: ConflictReason;
  reasonLabel: string;
  altSlots: string[];    // Open times on the SAME date, sorted chronologically
}

// Standard business-hours slot list for recurring scheduler (matches admin UI)
const BUSINESS_SLOTS = [
  '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
];

function slotIndex(t: string): number {
  const idx = BUSINESS_SLOTS.indexOf(t);
  return idx === -1 ? -1 : idx;
}

export async function detectSeriesConflicts(slots: ProposedSlot[]): Promise<Conflict[]> {
  if (slots.length === 0) return [];

  const dates = Array.from(new Set(slots.map(s => s.dateIso))).sort();
  const earliest = dates[0];
  const latest = dates[dates.length - 1];

  // Fetch everything relevant for the date range in a single pass
  const [apptsRes, holdsRes, blocksRes] = await Promise.all([
    supabase.from('appointments')
      .select('appointment_date, appointment_time, patient_name, status')
      .gte('appointment_date', earliest)
      .lte('appointment_date', `${latest}T23:59:59`)
      .in('status', ['scheduled', 'confirmed', 'en_route', 'arrived', 'in_progress']),
    supabase.from('slot_holds' as any)
      .select('appointment_date, appointment_time')
      .gte('appointment_date', earliest)
      .lte('appointment_date', latest)
      .eq('released', false)
      .gt('expires_at', new Date().toISOString()),
    supabase.from('time_blocks' as any)
      .select('start_date, end_date, reason, block_type')
      .or(`and(start_date.lte.${latest},end_date.gte.${earliest})`)
      .eq('block_type', 'office_closure'),
  ]);

  // Build lookup maps
  const apptsByDate: Record<string, Set<string>> = {};
  for (const a of (apptsRes.data as any[]) || []) {
    const d = String(a.appointment_date).slice(0, 10);
    if (!apptsByDate[d]) apptsByDate[d] = new Set();
    if (a.appointment_time) apptsByDate[d].add(String(a.appointment_time));
  }
  const holdsByDate: Record<string, Set<string>> = {};
  for (const h of (holdsRes.data as any[]) || []) {
    const d = String(h.appointment_date).slice(0, 10);
    if (!holdsByDate[d]) holdsByDate[d] = new Set();
    if (h.appointment_time) holdsByDate[d].add(String(h.appointment_time));
  }
  const blockedDates = new Set<string>();
  const blockReasons: Record<string, string> = {};
  for (const b of (blocksRes.data as any[]) || []) {
    const start = new Date(String(b.start_date) + 'T12:00:00');
    const end = new Date(String(b.end_date) + 'T12:00:00');
    const cursor = new Date(start);
    while (cursor <= end) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      blockedDates.add(iso);
      if (b.reason) blockReasons[iso] = String(b.reason);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // For each proposed slot, check in priority order
  const conflicts: Conflict[] = [];
  for (const s of slots) {
    const holiday = checkHoliday(s.dateIso);
    const allTaken = new Set<string>([
      ...(apptsByDate[s.dateIso] || []),
      ...(holdsByDate[s.dateIso] || []),
    ]);
    const altSlots = BUSINESS_SLOTS.filter(t => !allTaken.has(t));

    if (holiday) {
      conflicts.push({
        dateIso: s.dateIso, time: s.time, sequence: s.sequence,
        reason: 'holiday',
        reasonLabel: `Office closed — ${holiday.name}`,
        altSlots: [],  // holiday means NO times work — admin must pick a different date
      });
      continue;
    }
    if (blockedDates.has(s.dateIso)) {
      conflicts.push({
        dateIso: s.dateIso, time: s.time, sequence: s.sequence,
        reason: 'office_closure',
        reasonLabel: blockReasons[s.dateIso] || 'Office closed',
        altSlots: [],
      });
      continue;
    }
    if ((apptsByDate[s.dateIso] || new Set()).has(s.time)) {
      conflicts.push({
        dateIso: s.dateIso, time: s.time, sequence: s.sequence,
        reason: 'appointment',
        reasonLabel: 'Another appointment at this time',
        altSlots,
      });
      continue;
    }
    if ((holdsByDate[s.dateIso] || new Set()).has(s.time)) {
      conflicts.push({
        dateIso: s.dateIso, time: s.time, sequence: s.sequence,
        reason: 'slot_hold',
        reasonLabel: 'Someone else is booking this slot now',
        altSlots,
      });
      continue;
    }
  }

  return conflicts;
}

export { BUSINESS_SLOTS };
