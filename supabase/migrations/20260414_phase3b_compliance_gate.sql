-- Phase 3b: DB-level compliance gate on appointments.phlebotomist_id.
--
-- Prevents assigning (or self-claiming) a visit to a phlebotomist whose
-- staff_profiles.compliance_status is not 'cleared'. Admins/owners can
-- override via metadata role — the owner/founder's own profile is
-- already cleared by seeding below.

-- Seed: mark the current owner profile cleared so historical assignments work.
-- (If a known owner user_id exists, clear it. No-op otherwise.)
update staff_profiles
   set compliance_status = 'cleared',
       compliance_cleared_at = coalesce(compliance_cleared_at, now())
 where user_id = '91c76708-8c5b-4068-92c6-323805a3b164'
   and compliance_status <> 'cleared';

create or replace function enforce_phleb_compliance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cleared boolean;
  caller_role text;
begin
  if new.phlebotomist_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.phlebotomist_id is not distinct from old.phlebotomist_id then
    return new;
  end if;

  select compliance_status = 'cleared' into cleared
    from staff_profiles
   where user_id = new.phlebotomist_id
   limit 1;

  if coalesce(cleared, false) then
    return new;
  end if;

  -- Admins/owners may force-assign; surface a warning via raise notice instead
  select raw_user_meta_data->>'role' into caller_role from auth.users where id = auth.uid();
  if caller_role in ('super_admin','admin','owner') then
    raise notice 'Assigning visit to non-cleared phlebotomist % (admin override)', new.phlebotomist_id;
    return new;
  end if;

  raise exception 'Phlebotomist % is not cleared for visits (onboarding incomplete)', new.phlebotomist_id
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_enforce_phleb_compliance on appointments;
create trigger trg_enforce_phleb_compliance
before insert or update of phlebotomist_id on appointments
for each row execute function enforce_phleb_compliance();
