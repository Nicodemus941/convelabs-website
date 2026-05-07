/**
 * Self-tests for the appointment-date formatter.
 * Run: deno test supabase/functions/_shared/format-appt-date.test.ts
 *
 * These cases lock in the Hawthorn-class bug: Friday May 8 visit stored
 * as `2026-05-08 00:00:00+00` must NEVER render as "Thursday, May 7"
 * regardless of host TZ or DST status.
 */

import { assertEquals } from 'https://deno.land/std@0.190.0/testing/asserts.ts';
import {
  formatApptDateLong,
  formatApptDateShort,
  formatApptDateNumeric,
  formatApptTime,
  formatApptDateTime,
  todayInETPlusDays,
} from './format-appt-date.ts';

// ─── The Hawthorn case ────────────────────────────────────────────────
// Friday May 8, 2026 stored as UTC midnight. In ET that's Thu May 7 8 PM.
// Patient saw "tomorrow Thursday" on Wed May 6 for what's actually Friday.

Deno.test('Friday May 8 stored as UTC midnight renders as FRIDAY', () => {
  const stored = '2026-05-08 00:00:00+00';
  assertEquals(formatApptDateLong(stored), 'Friday, May 8, 2026');
  assertEquals(formatApptDateShort(stored), 'Fri, May 8');
});

Deno.test('Same date as ISO string', () => {
  assertEquals(formatApptDateLong('2026-05-08T00:00:00.000Z'), 'Friday, May 8, 2026');
});

Deno.test('Same date as Date object', () => {
  const d = new Date('2026-05-08T00:00:00.000Z');
  assertEquals(formatApptDateLong(d), 'Friday, May 8, 2026');
});

Deno.test('Date-only string (no time portion)', () => {
  assertEquals(formatApptDateLong('2026-05-08'), 'Friday, May 8, 2026');
});

// ─── Time formatting ──────────────────────────────────────────────────

Deno.test('11:00:00 → "11:00 AM"', () => {
  assertEquals(formatApptTime('11:00:00'), '11:00 AM');
});

Deno.test('13:30:00 → "1:30 PM"', () => {
  assertEquals(formatApptTime('13:30:00'), '1:30 PM');
});

Deno.test('00:00:00 → "12:00 AM"', () => {
  assertEquals(formatApptTime('00:00:00'), '12:00 AM');
});

Deno.test('12:00:00 → "12:00 PM"', () => {
  assertEquals(formatApptTime('12:00:00'), '12:00 PM');
});

// ─── Combined ─────────────────────────────────────────────────────────

Deno.test('combined Hawthorn case', () => {
  assertEquals(
    formatApptDateTime('2026-05-08 00:00:00+00', '11:00:00'),
    'Friday, May 8, 2026 at 11:00 AM',
  );
});

// ─── Edge cases ───────────────────────────────────────────────────────

Deno.test('null/undefined inputs return safe placeholders', () => {
  assertEquals(formatApptDateLong(null), 'your scheduled date');
  assertEquals(formatApptDateLong(undefined), 'your scheduled date');
  assertEquals(formatApptTime(null), 'your scheduled time');
  assertEquals(formatApptTime(undefined), 'your scheduled time');
});

Deno.test('Numeric format', () => {
  assertEquals(formatApptDateNumeric('2026-05-08 00:00:00+00'), '5/8/2026');
});

// ─── ET cron-target math ──────────────────────────────────────────────

Deno.test('todayInETPlusDays returns yyyy-MM-dd', () => {
  const today = todayInETPlusDays(0);
  // Format check, not value (depends on real clock)
  assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(today), true);
});

Deno.test('todayInETPlusDays(+1) is one day after todayInETPlusDays(0)', () => {
  const today = todayInETPlusDays(0);
  const tomorrow = todayInETPlusDays(1);
  const todayMs = new Date(today + 'T12:00:00Z').getTime();
  const tomorrowMs = new Date(tomorrow + 'T12:00:00Z').getTime();
  assertEquals(tomorrowMs - todayMs, 24 * 60 * 60 * 1000);
});
