-- 2026-04-28
-- Schema gap fix: appointment_date (timestamptz) and appointment_time (time)
-- were drifting apart. Most rows had appointment_date set to a noon-ET default
-- with the actual time stored only in appointment_time. 74% of rows in the
-- last 60d had a mismatched hour between the two columns.
--
-- Calendar UI reads appointment_time directly so display was correct.
-- detect-double-bookings slices appointment_date to date-only and uses
-- appointment_time for time math — also correct.
-- BUT: any timestamp-based query (collision smokes, ICS exports, future
-- reporting, route optimization) reading appointment_date as a true timestamp
-- gets the wrong answer.
--
-- Surfaced as a false-positive collision in Layer A: Roy Parker (6am) and
-- Katherine Bucher Jacobson (7am) both had appointment_date='2026-04-29
-- 16:00:00+00' (noon ET default) so a tstzrange overlap query said they
-- collided when the actual times were an hour apart and didn't.
--
-- Fix: backfill appointment_date so its time component matches appointment_time.

UPDATE appointments
SET appointment_date = (appointment_date::date + appointment_time) AT TIME ZONE 'America/New_York'
WHERE appointment_time IS NOT NULL
  AND status NOT IN ('cancelled')
  AND EXTRACT(HOUR FROM appointment_date AT TIME ZONE 'America/New_York')::int
    != EXTRACT(HOUR FROM appointment_time)::int;
