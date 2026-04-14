-- Phase 3: Staff onboarding + compliance gate
--
-- What this adds:
--   1. Private storage bucket "staff-onboarding" for license/ID/W-9/TB card uploads
--   2. compliance_status on staff_profiles (pending | cleared | blocked)
--   3. welcome_bonus_paid_at on staff_profiles (so trigger is idempotent)
--   4. Trigger: when all staff_onboarding.*_completed_at fields are set,
--      auto-mark profile compliance_status='cleared' and set completed_at.
--   5. RLS: staff can read/upload their own onboarding docs; admins can read all.

-- 1. Storage bucket (private)
insert into storage.buckets (id, name, public)
values ('staff-onboarding', 'staff-onboarding', false)
on conflict (id) do nothing;

-- 2. compliance_status + welcome_bonus columns
alter table staff_profiles
  add column if not exists compliance_status text not null default 'pending'
    check (compliance_status in ('pending','cleared','blocked')),
  add column if not exists compliance_cleared_at timestamptz,
  add column if not exists welcome_bonus_paid_at timestamptz;

create index if not exists idx_staff_profiles_compliance on staff_profiles(compliance_status);

-- 3. Auto-compute compliance when onboarding fully completes
create or replace function compute_staff_compliance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- "cleared" = every meaningful step timestamp filled in
  if new.account_setup_completed_at is not null
     and new.role_assignment_completed_at is not null
     and new.sop_training_completed_at is not null
     and new.digital_signature_completed_at is not null
     and new.background_check_completed_at is not null
     and new.final_approval_completed_at is not null
  then
    new.onboarding_status := 'completed';
    new.completed_at := coalesce(new.completed_at, now());

    update staff_profiles
       set compliance_status = 'cleared',
           compliance_cleared_at = coalesce(compliance_cleared_at, now())
     where id = new.staff_id
       and compliance_status <> 'cleared';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_compute_staff_compliance on staff_onboarding;
create trigger trg_compute_staff_compliance
before update on staff_onboarding
for each row execute function compute_staff_compliance();

-- 4. Storage RLS: staff uploads under <user_id>/... ; admins see all
-- Policy names are idempotent via drop/create.
drop policy if exists "staff_onboarding_read_own" on storage.objects;
create policy "staff_onboarding_read_own"
on storage.objects for select
using (
  bucket_id = 'staff-onboarding'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and (u.raw_user_meta_data->>'role') in ('super_admin','admin','owner')
    )
  )
);

drop policy if exists "staff_onboarding_upload_own" on storage.objects;
create policy "staff_onboarding_upload_own"
on storage.objects for insert
with check (
  bucket_id = 'staff-onboarding'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "staff_onboarding_update_own" on storage.objects;
create policy "staff_onboarding_update_own"
on storage.objects for update
using (
  bucket_id = 'staff-onboarding'
  and (storage.foldername(name))[1] = auth.uid()::text
);
