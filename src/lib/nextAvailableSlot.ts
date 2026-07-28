import { supabase } from '@/integrations/supabase/client';

/**
 * findNextAvailable — scan forward for the first day that actually has an open
 * slot, instead of blindly offering "try tomorrow".
 *
 * WHY THIS EXISTS: the booking grid's empty state used to offer a bare
 * "Try <next day> →" button. When the next day was ALSO full the patient
 * landed on another empty grid, clicked again, and again — which reads to them
 * as "the site keeps sending me back to pick a day" and is where we lose the
 * booking. (Melanie/Maria Tejedor, 2026-07-28: with one phlebotomist and a
 * 6–9 AM non-member fasting window, two morning bookings can exhaust a day, so
 * this dead-end is easy to hit.)
 *
 * The blocking math below MIRRORS DateTimeSelectionStep's grid math exactly —
 * same 15-min stepping, same backward+forward block, same maxPerSlot rule. If
 * you change one, change the other, or the "next available" we advertise won't
 * match what the grid actually offers.
 */

export interface NextAvailable {
  date: Date;
  /** Display key, e.g. "6:00 AM" — matches the grid's slot keys. */
  time: string;
}

/** Slot key identical to the grid's toSlotKey(). */
function toSlotKey(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function timeKeyToMinutes(key: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(key.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const p = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Which slot keys are unavailable on `dateStr`, given the new visit's length. */
async function blockedKeysFor(
  dateStr: string,
  newApptFootprintMin: number,
  maxPerSlot: number,
): Promise<Set<string>> {
  const blocked = new Set<string>();

  const [{ data: busy }, { data: holds }] = await Promise.all([
    supabase.rpc('get_busy_slots' as any, { p_date: dateStr }),
    supabase
      .from('slot_holds' as any)
      .select('appointment_time')
      .eq('appointment_date', dateStr)
      .eq('released', false)
      .gt('expires_at', new Date().toISOString()),
  ]);

  for (const h of (holds || []) as any[]) {
    if (h?.appointment_time) blocked.add(String(h.appointment_time));
  }

  const counts = new Map<string, number>();
  for (const appt of (busy || []) as any[]) {
    if (!appt?.appointment_time) continue;
    const startMin = timeKeyToMinutes(String(appt.appointment_time))
      ?? (() => {
        const parts = String(appt.appointment_time).split(':').map(Number);
        return (parts[0] || 0) * 60 + (parts[1] || 0);
      })();

    const duration = appt.duration_minutes > 0 ? appt.duration_minutes : 60;
    const buffer = typeof appt.buffer_minutes === 'number' && appt.buffer_minutes >= 0
      ? appt.buffer_minutes
      : 0;
    const endMin = startMin + duration + buffer;

    // Backward block — the appointment's own footprint.
    for (let t = startMin; t < endMin; t += 15) {
      const k = toSlotKey(Math.floor(t / 60), t % 60);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    // Forward block — a new visit starting here would run into this one.
    for (let t = startMin - newApptFootprintMin + 15; t < startMin; t += 15) {
      if (t < 0 || Math.floor(t / 60) < 6) continue;
      const k = toSlotKey(Math.floor(t / 60), t % 60);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }

  counts.forEach((count, key) => {
    if (count >= maxPerSlot) blocked.add(key);
  });
  return blocked;
}

/**
 * Scan forward from `startDate` (exclusive) for the first day where at least
 * one of `candidateTimes` is open.
 *
 * `candidateTimes` are the grid's slot keys for the current service/tier. We
 * reuse the caller's list rather than recomputing window rules, so the answer
 * always reflects the service the patient actually picked.
 *
 * Returns null when nothing opens up inside `daysToScan` — the caller should
 * fall back to the waitlist rather than inventing a date.
 */
export async function findNextAvailable(
  startDate: Date,
  candidateTimes: string[],
  opts?: { daysToScan?: number; newApptFootprintMin?: number; maxPerSlot?: number; skipWeekends?: boolean },
): Promise<NextAvailable | null> {
  const daysToScan = opts?.daysToScan ?? 14;
  const footprint = opts?.newApptFootprintMin ?? 60;
  const maxPerSlot = opts?.maxPerSlot ?? 1;
  const skipWeekends = opts?.skipWeekends ?? false;

  if (!candidateTimes.length) return null;

  // Sort candidates chronologically so we surface the EARLIEST opening, not
  // whatever order the grid happened to render.
  const sorted = [...candidateTimes].sort(
    (a, b) => (timeKeyToMinutes(a) ?? 0) - (timeKeyToMinutes(b) ?? 0),
  );

  for (let i = 1; i <= daysToScan; i++) {
    const probe = new Date(startDate);
    probe.setDate(probe.getDate() + i);
    const dow = probe.getDay();
    if (skipWeekends && (dow === 0 || dow === 6)) continue;

    try {
      const blocked = await blockedKeysFor(ymd(probe), footprint, maxPerSlot);
      const open = sorted.find(t => !blocked.has(t));
      if (open) return { date: probe, time: open };
    } catch {
      // A failed probe shouldn't abort the scan — try the next day.
      continue;
    }
  }
  return null;
}
