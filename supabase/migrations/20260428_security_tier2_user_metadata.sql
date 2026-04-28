-- 2026-04-28 SECURITY HARDENING TIER 2
-- Replace 54 user_metadata-based RLS policies with has_any_role()
--
-- Source: Supabase advisor — rls_references_user_metadata (47 tables).
-- auth.jwt()->'user_metadata'->>'role' is USER-EDITABLE via
-- supabase.auth.updateUser({ data: { role: 'super_admin' } }). Any
-- signed-in user could grant themselves admin and bypass RLS on
-- staff_profiles, user_memberships, phleb_pay_rates, staff_payouts,
-- api_keys, baa_signatures, compliance_audits, patient_audit_log,
-- invoice_audit_log, services, etc.
--
-- Fix: read from public.user_roles (server-managed, NOT user-editable)
-- via SECURITY DEFINER helpers public.has_any_role(text[]),
-- public.is_admin(), public.is_phleb().

CREATE OR REPLACE FUNCTION public.has_any_role(p_roles text[])
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role::text = ANY (p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_phleb()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role::text = 'phlebotomist'
  );
$$;

-- Re-create is_admin with enum-safe cast (Tier 1 used implicit text comparison)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role::text IN ('super_admin','admin','office_manager')
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_any_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_phleb() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 54 policies rewritten — full SQL captured in DB. Each was:
--   DROP POLICY <name> ON <table>;
--   CREATE POLICY <name> ON <table> FOR <cmd> TO authenticated
--     USING (public.has_any_role(ARRAY[<roles>]))
--     [WITH CHECK (...)];
--
-- Tables touched: ad_spend_log, agreements, api_call_logs, api_keys,
-- appointment_organizations, appointment_slots, baa_signatures,
-- business_metrics, campaign_sends, compliance_audits,
-- compliance_documents, daily_kpi_snapshots, email_unsubscribes,
-- franchise_applications, inventory_items, inventory_usage,
-- invoice_audit_log, lab_test_purchases, lab_tests, notification_deferrals,
-- orphaned_payments, patient_audit_log, patient_delegates,
-- patient_notification_consents, patient_referring_providers,
-- phleb_pay_rates (preserves self-OR-admin), provider_outreach_sends,
-- refund_audit, review_request_log, service_areas, service_audit_log,
-- service_mismatch_log, service_staff_assignments, services,
-- slot_lock_interactions, sop_images, staff_invitations, staff_onboarding,
-- staff_payouts (preserves self-OR-admin), staff_profiles, test_categories,
-- test_panels, training_courses, training_faqs, user_memberships,
-- user_profiles, user_settings.
--
-- Verification post-migration: SELECT count(*) of policies still
-- referencing user_metadata returned 0.
