-- =============================================================================
-- DRAFT — NOT APPLIED. Do not run until the owner has reviewed it and is
-- following docs/plans/2026-10-02-roles-to-app-metadata.md (step 1).
-- =============================================================================
--
-- Roles → app_metadata, PHASE 1 of 2: helpers + backfill + signup default.
--
-- WHY: RLS / SQL functions / edge functions authorize on
--   auth.jwt()->'user_metadata'->>'role' and ->>'organization_id'.
-- user_metadata (auth.users.raw_user_meta_data) is writable by the signed-in
-- user via supabase.auth.updateUser({ data: { role: 'super_admin' } }), so any
-- patient could self-promote or attach to any partner org.
-- app_metadata (raw_app_meta_data) is writable only with the service-role key
-- and is included in the JWT as `app_metadata`.
--
-- This phase changes NO authorization decision on its own:
--   * adds public.jwt_role() / public.jwt_org_id() (unused until phase 2),
--   * copies today's role/org into raw_app_meta_data (with verification of
--     privileged roles against public.user_roles), recording every decision in
--     public.role_migration_audit for review and rollback,
--   * adds a BEFORE INSERT trigger so every new auth user gets a safe default
--     app_metadata.role (self-declared privileged roles are NOT honoured).
--
-- Phase 2 (20261002130100_roles_to_app_metadata_enforce.sql) rewrites the
-- policies and functions to use the helpers.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helpers
-- -----------------------------------------------------------------------------
-- Trusted role. Prefers the JWT's app_metadata claim; when the token predates
-- the backfill (no app_metadata.role claim yet — tokens live up to ~1h) it reads
-- the live auth.users row instead, so nobody is locked out during transition.
-- Both sources are service-role-only. Returns '' (not NULL) when no role so
-- `= ANY(...)` comparisons behave like the old COALESCE(..., '').
create or replace function public.jwt_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    (select nullif(u.raw_app_meta_data ->> 'role', '')
       from auth.users u
      where u.id = auth.uid()),
    ''
  ));
$$;

comment on function public.jwt_role() is
  'Trusted caller role from app_metadata (JWT claim, else live auth.users row). Never reads user_metadata.';

-- Trusted partner-organization id (text, NULL when none). Taken from the SAME
-- source as jwt_role(): if the JWT already carries app_metadata.role, the org
-- comes from the JWT too; otherwise both come from the live row. Never mixes.
create or replace function public.jwt_org_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when nullif(auth.jwt() -> 'app_metadata' ->> 'role', '') is not null then
      nullif(coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id',
                      auth.jwt() -> 'app_metadata' ->> 'org_id'), '')
    else
      (select nullif(coalesce(u.raw_app_meta_data ->> 'organization_id',
                              u.raw_app_meta_data ->> 'org_id'), '')
         from auth.users u
        where u.id = auth.uid())
  end;
$$;

comment on function public.jwt_org_id() is
  'Trusted caller partner-org id from app_metadata (JWT claim, else live auth.users row). Never reads user_metadata.';

-- Policies on tables open to {public} are evaluated for anon too, so anon must
-- be able to execute the helpers (they return ''/NULL for anon).
revoke all on function public.jwt_role()   from public;
revoke all on function public.jwt_org_id() from public;
grant execute on function public.jwt_role()   to anon, authenticated, service_role;
grant execute on function public.jwt_org_id() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Audit table (service-role only: RLS on, no policies)
-- -----------------------------------------------------------------------------
create table if not exists public.role_migration_audit (
  user_id            uuid primary key,
  email              text,
  legacy_role        text,          -- raw_user_meta_data->>'role' at backfill time
  legacy_org         text,          -- raw_user_meta_data organization_id / org_id
  prior_app_metadata jsonb,         -- raw_app_meta_data before backfill (for rollback)
  assigned_role      text,
  assigned_org       text,
  decision           text not null, -- see CASE below
  migrated_at        timestamptz not null default now()
);
alter table public.role_migration_audit enable row level security;
revoke all on public.role_migration_audit from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Backfill raw_app_meta_data from raw_user_meta_data
-- -----------------------------------------------------------------------------
-- Rules (privileged claims are only honoured when corroborated, because the
-- legacy value is user-writable and may already have been tampered with):
--   super_admin / admin / owner / phlebotomist
--       → kept only if public.user_roles (admin-managed) has the same role;
--         otherwise 'patient' + decision 'downgraded_unverified_privileged'.
--   office_manager / provider WITH an org id that exists in organizations
--       → kept, org copied ('org_staff').
--   office_manager WITHOUT org but present in user_roles as office_manager
--       → kept ('internal_office_manager').
--   office_manager / provider otherwise → 'patient' ('downgraded_no_valid_org').
--   patient / concierge_doctor / user → copied ('copied_nonprivileged').
--   no role → 'patient' ('defaulted').
-- Users that already have an app_metadata.role are left untouched
-- ('kept_existing_app_role').
--
-- Live snapshot 2026-10-02 (read-only): patient 410, provider 52 (all with an
-- existing org), none 39, phlebotomist 7 (all in user_roles), super_admin 5
-- (all in user_roles), office_manager 2 (partner staff, both with org),
-- concierge_doctor 1, user 1. Expected downgrades: 0. See runbook for the
-- 3 providers whose email does not match their org's contact emails.
with src as (
  select
    u.id,
    u.email,
    nullif(lower(trim(u.raw_user_meta_data ->> 'role')), '')                       as legacy_role,
    nullif(coalesce(u.raw_user_meta_data ->> 'organization_id',
                    u.raw_user_meta_data ->> 'org_id'), '')                        as legacy_org,
    coalesce(u.raw_app_meta_data, '{}'::jsonb)                                     as prior_am
  from auth.users u
),
decided as (
  select
    s.*,
    exists (select 1 from public.user_roles r
             where r.user_id = s.id and r.role::text = s.legacy_role)              as role_in_user_roles,
    exists (select 1 from public.organizations o
             where o.id::text = coalesce(nullif(s.prior_am ->> 'organization_id', ''), s.legacy_org)) as org_exists
  from src s
),
final as (
  select
    d.*,
    case
      when nullif(d.prior_am ->> 'role', '') is not null                     then 'kept_existing_app_role'
      when d.legacy_role in ('super_admin','admin','owner','phlebotomist')
           and d.role_in_user_roles                                          then 'verified_privileged'
      when d.legacy_role in ('super_admin','admin','owner','phlebotomist')   then 'downgraded_unverified_privileged'
      when d.legacy_role in ('office_manager','provider') and d.org_exists   then 'org_staff'
      when d.legacy_role = 'office_manager' and d.role_in_user_roles         then 'internal_office_manager'
      when d.legacy_role in ('office_manager','provider')                    then 'downgraded_no_valid_org'
      when d.legacy_role in ('patient','concierge_doctor','user')            then 'copied_nonprivileged'
      else 'defaulted'
    end as decision
  from decided d
),
assigned as (
  select
    f.*,
    case f.decision
      when 'kept_existing_app_role'           then lower(f.prior_am ->> 'role')
      when 'verified_privileged'              then f.legacy_role
      when 'org_staff'                        then f.legacy_role
      when 'internal_office_manager'          then 'office_manager'
      when 'copied_nonprivileged'             then f.legacy_role
      else 'patient'
    end as assigned_role,
    case
      when f.decision = 'org_staff'
        then coalesce(nullif(f.prior_am ->> 'organization_id', ''), f.legacy_org)
      when f.decision = 'kept_existing_app_role'
        then nullif(coalesce(f.prior_am ->> 'organization_id', f.prior_am ->> 'org_id'), '')
      else null
    end as assigned_org
  from final f
),
audit as (
  insert into public.role_migration_audit
    (user_id, email, legacy_role, legacy_org, prior_app_metadata, assigned_role, assigned_org, decision)
  select id, email, legacy_role, legacy_org, prior_am, assigned_role, assigned_org, decision
  from assigned
  on conflict (user_id) do nothing          -- re-running never overwrites the first snapshot
  returning user_id
)
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('role', a.assigned_role)
                           || case when a.assigned_org is not null
                                   then jsonb_build_object('organization_id', a.assigned_org)
                                   else '{}'::jsonb end
  from assigned a
 where a.id = u.id
   and a.decision <> 'kept_existing_app_role';

-- -----------------------------------------------------------------------------
-- 4. Safe default role for every NEW auth user
-- -----------------------------------------------------------------------------
-- Self-service signUp() only writes user_metadata. Only non-privileged roles
-- may be self-declared; everything else (phlebotomist, office_manager,
-- provider, admin...) must be granted server-side via app_metadata by an
-- invite / admin edge function (auth.admin.createUser / updateUserById with
-- app_metadata), which this trigger never overrides.
create or replace function public.default_app_role_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed text := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
begin
  if nullif(new.raw_app_meta_data ->> 'role', '') is null then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role',
           case when v_claimed in ('patient', 'concierge_doctor') then v_claimed
                else 'patient' end);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_default_app_role_on_signup on auth.users;
create trigger trg_default_app_role_on_signup
  before insert on auth.users
  for each row execute function public.default_app_role_on_signup();

-- -----------------------------------------------------------------------------
-- 5. Lock down the legacy bootstrap function (hard-coded credentials).
-- -----------------------------------------------------------------------------
-- setup_initial_admin() is SECURITY DEFINER, executable by anon, and inserts a
-- super_admin with a password literal in its source. The account already
-- exists so it is a no-op today, but it must not stay callable.
revoke execute on function public.setup_initial_admin() from public, anon, authenticated;

-- ROLLBACK (phase 1):
--   update auth.users u set raw_app_meta_data = a.prior_app_metadata
--     from public.role_migration_audit a where a.user_id = u.id;
--   drop trigger if exists trg_default_app_role_on_signup on auth.users;
--   drop function if exists public.default_app_role_on_signup();
--   -- jwt_role()/jwt_org_id() are harmless to leave; drop only after phase 2 rollback.
