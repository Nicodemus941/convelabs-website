-- Phase 3d: add patient-profile fields that reduce friction on every visit.
--
-- gate_code: phlebs locked out of gated communities = missed visit = refund under
-- on-time guarantee. Storing per-patient (not per-appointment) means once we
-- learn it, every future booking auto-fills.
--
-- preferred_day / preferred_time: booking flow can default to the patient's
-- preferred slot — fewer taps, more rebooks.
--
-- standing_order_doctor: for quarterly blood work on a standing order, this
-- is the ordering physician. Stops the "who's your doctor again?" call.
--
-- patient_notes: phleb-facing notes ("hard stick — use 23g butterfly", "dog
-- in yard", "buzz unit 4B"). Named patient_notes to avoid clashing with
-- appointments.notes.
--
-- referred_by: attribution for referral bounty + future word-of-mouth loops.

alter table tenant_patients
  add column if not exists gate_code text,
  add column if not exists preferred_day text,
  add column if not exists preferred_time text,
  add column if not exists standing_order_doctor text,
  add column if not exists patient_notes text,
  add column if not exists referred_by text;
