-- appointments.patient_id held two different kinds of id, and two live systems
-- disagreed about which one belongs there.
--
-- Chart enrichment (address, phone, DOB) looks the patient up by
-- tenant_patients.id. Access control did not:
--
--   secure_appointments_select: (patient_id = auth.uid()) OR is_user_admin() OR ...
--
-- and the patient dashboard queried .eq('patient_id', user.id) to match it.
--
-- 438 of 511 appointments carry a chart id, 46 carry an auth user id. So the
-- convention the data overwhelmingly follows is the one that fails the RLS
-- check -- and a few hundred appointments were simply not being returned to
-- the patients who booked them. Nobody reported it, because a patient with an
-- empty list has nothing to point at.
--
-- The chart id is the right anchor: an appointment is about a chart, and plenty
-- of charts (guest bookings) have no login at all. So access resolves through
-- the chart's owner instead of comparing against it directly.
--
-- The old `patient_id = auth.uid()` arm is deliberately kept. It costs nothing,
-- and it means any row that still carries an auth id -- the six left below, or
-- anything a future code path writes -- stays visible to its patient rather
-- than silently disappearing.

-- The charts belonging to the signed-in user. SECURITY DEFINER because
-- tenant_patients has RLS of its own: evaluated as the caller, this subquery
-- would return nothing and quietly deny everyone. Mirrors is_user_admin().
create or replace function public.current_user_chart_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.tenant_patients where user_id = auth.uid()
$$;

revoke all on function public.current_user_chart_ids() from public, anon;
grant execute on function public.current_user_chart_ids() to authenticated;

drop policy if exists "secure_appointments_select" on public.appointments;

create policy "secure_appointments_select" on public.appointments
for select
using (
  patient_id = auth.uid()
  or patient_id in (select public.current_user_chart_ids())
  or is_user_admin()
  or phlebotomist_id in (
    select staff_profiles.id from public.staff_profiles
    where staff_profiles.user_id = auth.uid()
  )
);

-- Point the auth-id rows at the chart they were always about, so the
-- address/phone/DOB lookups stop missing.
--
-- Only where the login maps to exactly one chart. Two accounts have duplicate
-- charts, covering six of these appointments; picking one arbitrarily would
-- attach a visit to the wrong record, which is worse than leaving it. Those
-- stay on the auth id and stay visible through the first arm of the policy
-- above -- merge the duplicate charts and they can be pointed later.
--
-- This touches patient_id only. Of the triggers on this table, the one that
-- notifies (notify_phleb_push_on_appointment) fires on phlebotomist, status or
-- date changes and returns early otherwise, and every patient-facing trigger is
-- INSERT-only or keyed to status. Nothing is sent to anyone.
update public.appointments a
set patient_id = tp.id
from public.tenant_patients tp
where tp.user_id = a.patient_id
  and a.patient_id is not null
  and not exists (select 1 from public.tenant_patients x where x.id = a.patient_id)
  and (select count(*) from public.tenant_patients y where y.user_id = a.patient_id) = 1;
