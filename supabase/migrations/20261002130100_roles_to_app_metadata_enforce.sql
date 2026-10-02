-- =============================================================================
-- DRAFT — NOT APPLIED. Do not run until the owner has reviewed it and is
-- following docs/plans/2026-10-02-roles-to-app-metadata.md (step 3).
-- Requires 20261002130000_roles_to_app_metadata.sql (helpers + backfill).
-- =============================================================================
--
-- Roles → app_metadata, PHASE 2 of 2: enforce.
--   * Every RLS policy that read auth.jwt()->'user_metadata' (role or
--     organization_id / org_id) now reads public.jwt_role() / public.jwt_org_id()
--     (service-role-only app_metadata). Policies keep their names, commands,
--     roles and role lists — only the SOURCE of the role/org changes.
--   * Legacy policies of the form EXISTS (SELECT 1 FROM auth.users WHERE
--     raw_user_meta_data->>'role' ...) are rewritten to public.has_any_role()
--     (the admin-managed public.user_roles table). NOTE: verified 2026-10-02
--     that these currently RAISE "permission denied for table users" for every
--     `authenticated` query (authenticated has no SELECT on auth.users), i.e.
--     those tables — and every authenticated SELECT on storage.objects — are
--     erroring today. After this migration they evaluate normally, granting the
--     listed INTERNAL staff roles from user_roles (partner-clinic office
--     managers are not in user_roles, so they do not gain access).
--   * SECURITY DEFINER functions that read user_metadata role/org are rewritten
--     in place with exact, asserted regex substitutions (bodies are otherwise
--     untouched; display-only reads like full_name are left alone).
--
-- Policies are wrapped as (select public.jwt_role()) so Postgres evaluates the
-- helper once per statement (initPlan), not once per row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. JWT-based policies (user_metadata → app_metadata helpers)
-- -----------------------------------------------------------------------------

-- appointment_lab_orders
alter policy org_linked_can_upload_lab_orders on public.appointment_lab_orders
  with check (
    uploaded_by = auth.uid()
    and (select public.jwt_role()) = any (array['office_manager','provider'])
    and (
      appointment_id in (select a.id from public.appointments a
                          where a.organization_id = ((select public.jwt_org_id()))::uuid)
      or appointment_id in (select ao.appointment_id from public.appointment_organizations ao
                             where ao.organization_id = ((select public.jwt_org_id()))::uuid)
    ));

alter policy org_linked_can_view_lab_orders on public.appointment_lab_orders
  using (
    (select public.jwt_role()) = any (array['office_manager','provider'])
    and (
      appointment_id in (select a.id from public.appointments a
                          where a.organization_id = ((select public.jwt_org_id()))::uuid)
      or appointment_id in (select ao.appointment_id from public.appointment_organizations ao
                             where ao.organization_id = ((select public.jwt_org_id()))::uuid)
    ));

-- appointments
alter policy org_staff_see_only_their_org_appointments on public.appointments
  using (
    organization_id is not null
    and organization_id::text = (select public.jwt_org_id())
    and (select public.jwt_role()) = any (array['office_manager','provider']));

alter policy org_staff_update_their_org_appointments on public.appointments
  using (
    organization_id is not null
    and organization_id::text = (select public.jwt_org_id())
    and (select public.jwt_role()) = any (array['office_manager','provider']))
  with check (organization_id::text = (select public.jwt_org_id()));

alter policy platform_admin_full_appointments on public.appointments
  using      ((select public.jwt_role()) = any (array['super_admin','admin','owner']))
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

alter policy platform_admin_read_all_appointments on public.appointments
  using ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

-- membership_offers_sent (the auth.jwt()->>'role' clause is the Postgres role
-- claim — anon/authenticated/service_role — kept as-is for parity; it never
-- matches these values. The duplicated user_metadata/app_metadata branches
-- collapse into one helper call.)
alter policy "admins insert membership_offers_sent" on public.membership_offers_sent
  with check (
    (auth.jwt() ->> 'role') = any (array['super_admin','admin','office_manager'])
    or (select public.jwt_role()) = any (array['super_admin','admin','office_manager']));

alter policy "admins read membership_offers_sent" on public.membership_offers_sent
  using (
    (auth.jwt() ->> 'role') = any (array['super_admin','admin','office_manager'])
    or (select public.jwt_role()) = any (array['super_admin','admin','office_manager']));

-- org_invoices
alter policy org_staff_read_their_org_invoices on public.org_invoices
  using (
    org_id::text = (select public.jwt_org_id())
    and (select public.jwt_role()) = any (array['office_manager','provider']));

alter policy platform_admin_full_org_invoices on public.org_invoices
  using      ((select public.jwt_role()) = any (array['super_admin','admin','owner']))
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

-- org_providers
alter policy phleb_reads_org_providers_for_assigned on public.org_providers
  using ((select public.jwt_role()) = 'phlebotomist');

-- organizations
alter policy org_staff_read_their_own_org on public.organizations
  using (
    id::text = (select public.jwt_org_id())
    and (select public.jwt_role()) = any (array['office_manager','provider']));

alter policy phleb_read_all_orgs on public.organizations
  using ((select public.jwt_role()) = 'phlebotomist');

alter policy platform_admin_delete_orgs on public.organizations
  using ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

alter policy platform_admin_insert_orgs on public.organizations
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

alter policy platform_admin_read_all_orgs on public.organizations
  using ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

alter policy platform_admin_update_orgs on public.organizations
  using      ((select public.jwt_role()) = any (array['super_admin','admin','owner']))
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

-- patient_addresses / patient_insurances (org-scoped; previously coalesced
-- user_metadata.organization_id, user_metadata.org_id, app_metadata.organization_id)
alter policy org_staff_their_patient_addresses on public.patient_addresses
  using (exists (select 1 from public.tenant_patients tp
                  where tp.id = patient_addresses.patient_id
                    and tp.organization_id::text = (select public.jwt_org_id())))
  with check (exists (select 1 from public.tenant_patients tp
                       where tp.id = patient_addresses.patient_id
                         and tp.organization_id::text = (select public.jwt_org_id())));

alter policy org_staff_their_patient_insurances on public.patient_insurances
  using (exists (select 1 from public.tenant_patients tp
                  where tp.id = patient_insurances.patient_id
                    and tp.organization_id::text = (select public.jwt_org_id())))
  with check (exists (select 1 from public.tenant_patients tp
                       where tp.id = patient_insurances.patient_id
                         and tp.organization_id::text = (select public.jwt_org_id())));

-- patient_lab_requests
alter policy org_staff_see_only_their_org_lab_requests on public.patient_lab_requests
  using (
    organization_id is not null
    and organization_id::text = (select public.jwt_org_id())
    and (select public.jwt_role()) = any (array['office_manager','provider']));

-- post_visit_sequences
alter policy platform_admin_full_pvs on public.post_visit_sequences
  using      ((select public.jwt_role()) = any (array['super_admin','admin','owner']))
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

-- provider_outreach_log
alter policy outreach_log_admin_all on public.provider_outreach_log
  using      ((select public.jwt_role()) = any (array['super_admin','admin','owner','office_manager']))
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner','office_manager']));

-- referral_codes / referral_credits
alter policy platform_admin_full_referral_codes on public.referral_codes
  using      ((select public.jwt_role()) = any (array['super_admin','admin','owner']))
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

alter policy platform_admin_full_referral_credits on public.referral_credits
  using      ((select public.jwt_role()) = any (array['super_admin','admin','owner']))
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

-- service_package_items / services_enhanced (user_metadata OR app_metadata OR
-- is_user_admin() → helper OR is_user_admin())
alter policy "Admins manage package items" on public.service_package_items
  using      ((select public.jwt_role()) = any (array['super_admin','admin','office_manager']) or public.is_user_admin())
  with check ((select public.jwt_role()) = any (array['super_admin','admin','office_manager']) or public.is_user_admin());

alter policy "Admins and managers can manage services" on public.services_enhanced
  using      ((select public.jwt_role()) = any (array['super_admin','admin','office_manager']) or public.is_user_admin())
  with check ((select public.jwt_role()) = any (array['super_admin','admin','office_manager']) or public.is_user_admin());

-- sms_notifications
alter policy platform_admin_full_sms on public.sms_notifications
  using      ((select public.jwt_role()) = any (array['super_admin','admin','owner']))
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

-- specimen_deliveries
alter policy admin_or_logger_updates_specimens on public.specimen_deliveries
  using      ((select public.jwt_role()) = any (array['super_admin','admin','owner']) or delivered_by_user_id = auth.uid())
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner']) or delivered_by_user_id = auth.uid());

alter policy org_staff_read_their_specimens on public.specimen_deliveries
  using (exists (select 1 from public.appointments a
                  where a.id = specimen_deliveries.appointment_id
                    and a.organization_id::text = (select public.jwt_org_id())
                    and (select public.jwt_role()) = any (array['office_manager','provider'])));

alter policy phleb_or_admin_inserts_specimens on public.specimen_deliveries
  with check ((select public.jwt_role()) = any (array['phlebotomist','super_admin','admin','owner']));

alter policy platform_admin_read_specimens on public.specimen_deliveries
  using ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

-- tenant_patients
alter policy org_staff_see_only_their_org_patients on public.tenant_patients
  using (
    organization_id is not null
    and organization_id::text = (select public.jwt_org_id())
    and (select public.jwt_role()) = any (array['office_manager','provider']));

alter policy platform_admin_read_all_patients on public.tenant_patients
  using ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

alter policy tp_delete_admin on public.tenant_patients
  using ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

alter policy tp_insert_staff_or_self on public.tenant_patients
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner','office_manager','provider'])
              or user_id = auth.uid());

alter policy tp_update_admin on public.tenant_patients
  using      ((select public.jwt_role()) = any (array['super_admin','admin','owner']))
  with check ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

alter policy tp_update_org on public.tenant_patients
  using (
    organization_id is not null
    and organization_id::text = (select public.jwt_org_id())
    and (select public.jwt_role()) = any (array['office_manager','provider']))
  with check (
    organization_id is not null
    and organization_id::text = (select public.jwt_org_id())
    and (select public.jwt_role()) = any (array['office_manager','provider']));

-- webhook_logs
alter policy platform_admin_read_webhook_logs on public.webhook_logs
  using ((select public.jwt_role()) = any (array['super_admin','admin','owner']));

-- storage.objects (insurance-cards bucket)
alter policy "platform admin deletes insurance cards" on storage.objects
  using (bucket_id = 'insurance-cards'
         and (select public.jwt_role()) = any (array['super_admin','admin','owner']));

alter policy "platform admin reads insurance cards" on storage.objects
  using (bucket_id = 'insurance-cards'
         and (select public.jwt_role()) = any (array['super_admin','admin','owner','phlebotomist','provider','office_manager']));

-- -----------------------------------------------------------------------------
-- B. Legacy auth.users-subquery policies → public.has_any_role(user_roles)
--    (currently erroring for every authenticated query — see header)
-- -----------------------------------------------------------------------------
alter policy "Admins can manage corporate employees" on public.corporate_employees
  using (public.has_any_role(array['super_admin','admin','office_manager','billing']));

alter policy "Admins can view all credit pools" on public.credit_pools
  using (public.has_any_role(array['super_admin','office_manager']));

alter policy "Admin can manage performance reviews" on public.performance_reviews
  using (public.has_any_role(array['owner','office_manager','super_admin']));

alter policy "Admins can view all locations" on public.phlebotomist_locations
  using (public.has_any_role(array['super_admin','office_manager']));

alter policy "Admin can manage quality incidents" on public.quality_incidents
  using (public.has_any_role(array['owner','office_manager','super_admin']));

alter policy "Admin can manage quality metrics" on public.quality_metrics
  using (public.has_any_role(array['owner','office_manager','super_admin']));

alter policy "Admin users can manage all route plans" on public.route_plans
  using (public.has_any_role(array['super_admin','owner','admin','office_manager']));

alter policy "Admin users can manage all route stops" on public.route_stops
  using (public.has_any_role(array['super_admin','owner','admin','office_manager']));

alter policy "Super admins can access all scheduled campaigns" on public.scheduled_campaigns
  using (public.has_any_role(array['super_admin','office_manager']));

alter policy "Admin can manage service areas" on public.service_areas
  using (public.has_any_role(array['super_admin','office_manager']));

alter policy "Admin users can view all service logs" on public.service_logs
  using (public.has_any_role(array['super_admin','office_manager']));

alter policy "Admin can manage staff certifications" on public.staff_certifications
  using (public.has_any_role(array['owner','office_manager','super_admin']));

alter policy "Admin can manage staff training" on public.staff_training
  using (public.has_any_role(array['owner','office_manager','super_admin']));

alter policy "Admin access to stripe_balance_transactions" on public.stripe_balance_transactions
  using (public.has_any_role(array['super_admin','office_manager']));

alter policy "Admin access to stripe_payments" on public.stripe_payments
  using (public.has_any_role(array['super_admin','office_manager']));

alter policy "Admin access to stripe_payouts" on public.stripe_payouts
  using (public.has_any_role(array['super_admin','office_manager']));

alter policy "Admins can manage sync metadata" on public.sync_metadata
  using (public.has_any_role(array['super_admin','office_manager','admin']));

alter policy "Admins can manage webhook events" on public.webhook_events
  using (public.has_any_role(array['super_admin','owner']));

alter policy staff_onboarding_read_own on storage.objects
  using (bucket_id = 'staff-onboarding'
         and ((storage.foldername(name))[1] = (auth.uid())::text
              or (select public.jwt_role()) = any (array['super_admin','admin','owner'])));

-- -----------------------------------------------------------------------------
-- C. SECURITY DEFINER functions: exact regex substitutions, each asserted.
-- -----------------------------------------------------------------------------
-- Each row: function, regex (must match at least once or the migration aborts),
-- replacement. Applied in order per function, then CREATE OR REPLACE'd from
-- pg_get_functiondef(), so signature, SECURITY DEFINER, search_path, grants and
-- the rest of the body are preserved byte-for-byte.
--
-- Intentionally NOT changed (display / non-authorization reads of
-- raw_user_meta_data): auto_create_tenant_patient_on_signup (skips chart
-- creation for invited non-patients), calculate_profitability,
-- get_available_phlebotomists_for_slot (x3), get_available_phlebotomists_with_travel,
-- get_org_email_log, get_staff_activity_summary, handle_new_user — names only.
-- get_patients_for_org_admin keeps get_current_user_role() (user_roles) for
-- its role check; only its org scope changes.
do $migration$
declare
  r record;
  v_def text;
  v_fn regprocedure;
begin
  create temp table _fn_rewrites (ord int, fn regprocedure, pat text, rep text) on commit drop;
  insert into _fn_rewrites values
    (1,  'public.check_patient_cross_org_collision(text,text,uuid)',
         $p$lower\(COALESCE\(auth\.jwt\(\)->'user_metadata'->>'role',''\)\)$p$,
         'public.jwt_role()'),
    (2,  'public.check_patient_cross_org_collision(text,text,uuid)',
         $p$COALESCE\(\s*NULLIF\(auth\.jwt\(\)->'user_metadata'->>'organization_id', ''\)::uuid,\s*NULLIF\(auth\.jwt\(\)->'user_metadata'->>'org_id', ''\)::uuid,\s*NULLIF\(auth\.jwt\(\)->'app_metadata'->>'organization_id', ''\)::uuid,\s*NULLIF\(auth\.jwt\(\)->'app_metadata'->>'org_id', ''\)::uuid\s*\)$p$,
         $r$NULLIF(public.jwt_org_id(), '')::uuid$r$),
    -- get_org_linked_patients: four claim lookups + a live user_metadata fallback
    -- collapse into the helper (which already falls back to the live row).
    (3,  'public.get_org_linked_patients()',
         $p$v_org_id := NULLIF\(auth\.jwt\(\)->'user_metadata'->>'organization_id', ''\)::uuid;.*?WHERE u\.id = auth\.uid\(\);\s*END IF;$p$,
         $r$v_org_id := NULLIF(public.jwt_org_id(), '')::uuid;  -- trusted app_metadata (JWT, else live auth.users row)$r$),
    (4,  'public.get_org_linked_patients_logged()',
         $p$lower\(COALESCE\(auth\.jwt\(\)->'user_metadata'->>'role',''\)\)$p$,
         'public.jwt_role()'),
    (5,  'public.get_org_linked_patients_logged()',
         $p$COALESCE\(\s*NULLIF\(auth\.jwt\(\)->'user_metadata'->>'organization_id', ''\)::uuid,\s*NULLIF\(auth\.jwt\(\)->'user_metadata'->>'org_id', ''\)::uuid,\s*NULLIF\(auth\.jwt\(\)->'app_metadata'->>'organization_id', ''\)::uuid,\s*NULLIF\(auth\.jwt\(\)->'app_metadata'->>'org_id', ''\)::uuid\s*\)$p$,
         $r$NULLIF(public.jwt_org_id(), '')::uuid$r$),
    (6,  'public.get_org_roi(uuid)',
         $p$lower\(COALESCE\(auth\.jwt\(\)->'user_metadata'->>'role',''\)\)$p$,
         'public.jwt_role()'),
    (7,  'public.get_org_roi(uuid)',
         $p$\(auth\.jwt\(\)->'user_metadata'->>'organization_id'\)::uuid$p$,
         $r$NULLIF(public.jwt_org_id(), '')::uuid$r$),
    (8,  'public.get_patients_for_org_admin(uuid)',
         $p$COALESCE\(\s*NULLIF\(auth\.jwt\(\)->'user_metadata'->>'organization_id', ''\)::uuid,\s*NULLIF\(auth\.jwt\(\)->'user_metadata'->>'org_id', ''\)::uuid,\s*NULLIF\(auth\.jwt\(\)->'app_metadata'->>'organization_id', ''\)::uuid,\s*NULLIF\(auth\.jwt\(\)->'app_metadata'->>'org_id', ''\)::uuid\s*\)$p$,
         $r$NULLIF(public.jwt_org_id(), '')::uuid$r$),
    (9,  'public.list_org_staff_admin(uuid)',
         $p$lower\(COALESCE\(auth\.jwt\(\)->'user_metadata'->>'role',''\)\)$p$,
         'public.jwt_role()'),
    (10, 'public.list_org_staff_admin(uuid)',
         $p$COALESCE\(\s*auth\.jwt\(\) -> 'user_metadata' ->> 'organization_id',\s*auth\.jwt\(\) -> 'user_metadata' ->> 'org_id',\s*auth\.jwt\(\) -> 'app_metadata' ->> 'organization_id'\s*\)$p$,
         'public.jwt_org_id()'),
    -- list_org_staff_admin: which users belong to the org / are org staff
    (11, 'public.list_org_staff_admin(uuid)',
         $p$u\.raw_user_meta_data->>'(organization_id|org_id)' = p_organization_id::text$p$,
         $r$u.raw_app_meta_data->>'\1' = p_organization_id::text$r$),
    (12, 'public.list_org_staff_admin(uuid)',
         $p$COALESCE\(u\.raw_user_meta_data->>'role',''\)$p$,
         $r$COALESCE(u.raw_app_meta_data->>'role','')$r$),
    (13, 'public.enforce_phleb_compliance()',
         $p$select raw_user_meta_data->>'role' into caller_role from auth\.users where id = auth\.uid\(\);$p$,
         $r$caller_role := public.jwt_role();$r$),
    (14, 'public.resync_appointment_card_totals(date,boolean)',
         $p$u\.raw_user_meta_data->>'role'$p$,
         $r$u.raw_app_meta_data->>'role'$r$),
    (15, 'public.announce_target_orgs()',
         $p$COALESCE\(u\.raw_user_meta_data->>'organization_id', u\.raw_user_meta_data->>'org_id',''\)$p$,
         $r$COALESCE(u.raw_app_meta_data->>'organization_id', u.raw_app_meta_data->>'org_id','')$r$),
    (16, 'public.appointments_autofill_defaults()',
         $p$au\.raw_user_meta_data->>'role' = 'phlebotomist'$p$,
         $r$au.raw_app_meta_data->>'role' = 'phlebotomist'$r$);

  for v_fn in select distinct fn from _fn_rewrites loop
    v_def := pg_get_functiondef(v_fn);
    for r in select * from _fn_rewrites where fn = v_fn order by ord loop
      if v_def !~ r.pat then
        raise exception 'roles_to_app_metadata: pattern % did not match in % — function changed since draft; re-review', r.ord, v_fn;
      end if;
      v_def := regexp_replace(v_def, r.pat, r.rep, 'g');
    end loop;
    if v_def ~ $p$(user_metadata|raw_user_meta_data)[^,]{0,6}'(role|organization_id|org_id)'$p$ then
      raise exception 'roles_to_app_metadata: % still reads role/org from user_metadata after rewrite', v_fn;
    end if;
    execute v_def;
  end loop;
end
$migration$;

-- ROLLBACK (phase 2): re-apply the previous definitions. The pre-change policy
-- and function text is reproducible from the live DB before applying
-- (runbook step 0 saves it: pg_policies + pg_get_functiondef), e.g.
--   select format('ALTER POLICY %I ON %I.%I%s%s;', policyname, schemaname, tablename,
--     coalesce(E'\n USING (' || qual || ')', ''), coalesce(E'\n WITH CHECK (' || with_check || ')', ''))
--   from pg_policies where ... ;
