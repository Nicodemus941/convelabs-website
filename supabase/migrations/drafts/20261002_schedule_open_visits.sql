-- ============================================================================
-- DRAFT — NOT APPLIED
--
-- Lives under supabase/migrations/drafts/ on purpose: the Supabase CLI only
-- picks up <timestamp>_name.sql files directly in supabase/migrations, so this
-- cannot be applied by accident. Move it up (and re-timestamp) when approved.
--
-- Context: Schedule redesign (feat/redesign-schedule). The admin calendar and
-- "All appointments" screens now surface a "Past due" bucket — visits whose
-- date has passed but whose status is still scheduled / confirmed / en_route /
-- in_progress. On 2026-10-02 production had 33 such rows (some from June),
-- which skew today/upcoming counts, keep reminder crons eligible and leave
-- phleb payouts un-triggered. The UI works without any of this; these are the
-- backend pieces that would make it cheaper and stop the pile-up recurring.
-- ============================================================================

-- 1. Cheap lookup for "open visits by date" (the past-due lane, the phleb
--    today view, reminder crons). Partial so it stays tiny.
create index if not exists idx_appointments_open_by_date
  on public.appointments (appointment_date)
  where status in ('scheduled', 'confirmed', 'en_route', 'arrived', 'in_progress');

-- 2. Document the real status vocabulary. The UI used to assume a 5-value
--    enum; the table actually carries specimen_delivered + in_progress too,
--    and "no-show" is a boolean column (no_show), never a status string.
comment on column public.appointments.status is
  'scheduled | confirmed | en_route | arrived | in_progress | completed | specimen_delivered | cancelled. No-shows are flagged via no_show=true (status stays cancelled/completed).';

-- 3. Read-only helper the admin screens could switch to instead of pulling
--    every row and bucketing client-side. Eastern calendar day, one bucket per
--    row, identical rules to scheduleShared.deriveApptBucket.
create or replace view public.appointments_schedule_buckets_v
with (security_invoker = true) as
select
  a.id,
  a.status,
  (a.appointment_date at time zone 'UTC')::date                     as stored_day,   -- date prefix of the stored string
  substr(a.appointment_date::text, 1, 10)::date                       as calendar_day, -- what the UI shows
  case
    when a.no_show or a.status in ('cancelled', 'no-show', 'no_show') then 'cancelled'
    when a.status in ('completed', 'specimen_delivered')               then 'completed'
    when substr(a.appointment_date::text, 1, 10)::date
         <  (now() at time zone 'America/New_York')::date              then 'overdue'
    when substr(a.appointment_date::text, 1, 10)::date
         =  (now() at time zone 'America/New_York')::date              then 'today'
    else 'upcoming'
  end as bucket
from public.appointments a;

comment on view public.appointments_schedule_buckets_v is
  'One bucket per appointment (overdue/today/upcoming/completed/cancelled) using the same rules as the admin Schedule screens. security_invoker: callers see only rows their RLS allows.';

-- 4. OPTIONAL — nightly sweep that flags, but does NOT change, stale open
--    visits. Deliberately a notice-only function: closing a visit as completed
--    has payout + review-request side effects, so a human should do it from
--    the Past due lane. Wire to pg_cron only after the owner signs off.
create or replace function public.report_stale_open_visits(p_days int default 1)
returns table (id uuid, patient_name text, calendar_day date, status text, days_overdue int)
language sql stable security invoker as $$
  select a.id, a.patient_name,
         substr(a.appointment_date::text, 1, 10)::date,
         a.status,
         ((now() at time zone 'America/New_York')::date - substr(a.appointment_date::text, 1, 10)::date)::int
  from public.appointments a
  where a.status in ('scheduled', 'confirmed', 'en_route', 'arrived', 'in_progress')
    and substr(a.appointment_date::text, 1, 10)::date
        < (now() at time zone 'America/New_York')::date - (p_days - 1)
  order by 3;
$$;
