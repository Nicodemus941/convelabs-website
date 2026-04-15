-- Prevent duplicate bookings for the same patient at the same date+time.
--
-- Why partial index: we match on (patient_id, appointment_date, appointment_time)
-- but only when the row isn't cancelled. A cancelled slot shouldn't block a
-- legitimate new booking at the same time.
--
-- appointment_date is timestamptz. We can't index a direct ::date cast because
-- it's not IMMUTABLE (depends on session TZ). Anchor via America/New_York
-- which is the business TZ — `(appointment_date AT TIME ZONE 'America/New_York')::date`
-- is immutable because the TZ is a constant literal.

create unique index if not exists idx_appointments_no_dupe_per_patient
  on appointments (
    ((appointment_date at time zone 'America/New_York')::date),
    appointment_time,
    patient_id
  )
  where patient_id is not null
    and status not in ('cancelled','rescheduled');
