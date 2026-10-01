-- Promotional recording consent, asked at checkout.
--
-- A patient can let their phlebotomist record the setup and the draw for
-- ConveLabs marketing. Arm and hands only by default; face and a short
-- testimonial only if they opt into that separately. Never offered to minors.
--
-- Why the signature and PDF live in this table and not in Storage: the
-- storage.objects policies storage_{select,insert,update,delete}_open grant
-- the public role full access to every bucket except lab-orders and
-- sop-images. A new bucket would be open to anonymous users the moment it
-- existed. Rows here are reachable only through RLS (super_admin) and the
-- recording-consent edge function (super_admin or the assigned phleb).
--
-- Lifecycle:
--   1. submit-recording-consent inserts a row (accepted or declined) before
--      payment and returns its id.
--   2. create-appointment-checkout stamps stripe_session_id on it. (Not
--      Stripe metadata: that is already at its 50-key cap.)
--   3. stripe-webhook finds it by session id once the appointment exists,
--      links it, and copies the decision onto the appointment.
--   4. Rows never linked (abandoned checkouts) are purged after 7 days.

create table if not exists public.recording_consents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  decision text not null check (decision in ('accepted', 'declined')),
  -- null when declined
  scope text check (scope in ('arm_hands_only', 'face_and_testimonial')),

  -- The exact text the patient agreed to, as served by the edge function.
  release_version text,
  release_text text,
  release_sha256 text,

  signer_name text,
  -- "I am the patient being seen and I am 18 or older."
  attested_adult_patient boolean not null default false,
  patient_name text,
  patient_email text,
  patient_dob date,

  signature_png bytea,
  consent_pdf bytea,

  ip_address text,
  user_agent text,

  stripe_session_id text unique,
  appointment_id uuid references public.appointments(id) on delete set null,
  linked_at timestamptz,
  -- HIPAA: the patient gets a copy of what they signed. Emailed once, when
  -- the consent is linked to a paid appointment.
  copy_emailed_at timestamptz,

  revoked_at timestamptz,
  revoked_by uuid,
  revoke_source text check (revoke_source in ('patient', 'phlebotomist', 'admin')),
  revoke_reason text,

  constraint recording_consents_accepted_is_complete check (
    decision <> 'accepted' or (
      scope is not null
      and signer_name is not null
      and signature_png is not null
      and consent_pdf is not null
      and attested_adult_patient
      and release_version is not null
      and release_sha256 is not null
    )
  ),
  constraint recording_consents_declined_has_no_signature check (
    decision <> 'declined' or (scope is null and signature_png is null)
  ),
  -- Signatures are small; anything big is not a signature.
  constraint recording_consents_signature_size check (signature_png is null or octet_length(signature_png) <= 300000),
  constraint recording_consents_pdf_size check (consent_pdf is null or octet_length(consent_pdf) <= 1000000)
);

create index if not exists recording_consents_appointment_idx on public.recording_consents (appointment_id);
create index if not exists recording_consents_unlinked_idx on public.recording_consents (created_at) where appointment_id is null and linked_at is null;
create index if not exists recording_consents_ip_recent_idx on public.recording_consents (ip_address, created_at);

alter table public.recording_consents enable row level security;

-- Only the business admin reads these directly. Everything else (the phleb's
-- "view signed release", revoking) goes through the edge function, which
-- checks the assignment.
drop policy if exists recording_consents_super_admin_read on public.recording_consents;
create policy recording_consents_super_admin_read on public.recording_consents
  for select to authenticated
  using (public.get_current_user_role() = 'super_admin');

revoke all on public.recording_consents from anon;
revoke insert, update, delete on public.recording_consents from authenticated;

-- What the phleb card and admin views read: the answer, on the appointment.
--   accepted      -- signed release on file
--   declined      -- said no at checkout, or withdrew
--   not_asked     -- booked some other way (admin, older bookings)
--   not_eligible  -- patient is a minor; never offered
alter table public.appointments
  add column if not exists recording_preference text not null default 'not_asked',
  add column if not exists recording_scope text,
  add column if not exists recording_consent_id uuid references public.recording_consents(id) on delete set null;

alter table public.appointments drop constraint if exists appointments_recording_preference_check;
alter table public.appointments add constraint appointments_recording_preference_check
  check (recording_preference in ('accepted', 'declined', 'not_asked', 'not_eligible'));
alter table public.appointments drop constraint if exists appointments_recording_scope_check;
alter table public.appointments add constraint appointments_recording_scope_check
  check (recording_scope is null or recording_scope in ('arm_hands_only', 'face_and_testimonial'));

comment on column public.appointments.recording_preference is
  'Promotional recording answer from checkout: accepted | declined | not_asked | not_eligible (minor). See recording_consents.';

-- Abandoned checkouts: a consent that never became an appointment is not
-- kept. Daily, 07:17 UTC (3:17 AM ET).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-unlinked-recording-consents') then
    perform cron.unschedule('purge-unlinked-recording-consents');
  end if;
  perform cron.schedule(
    'purge-unlinked-recording-consents',
    '17 7 * * *',
    $job$delete from public.recording_consents where appointment_id is null and linked_at is null and created_at < now() - interval '7 days'$job$
  );
end $$;
