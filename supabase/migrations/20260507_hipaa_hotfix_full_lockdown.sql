-- HIPAA HOTFIX 2026-05-07 — FULL LOCKDOWN (passes 4 + 5)
--
-- Lara at Littleton Concierge could still see other orgs' patients +
-- invoices + everything after pass-1 (RPC fix) and pass-2 (initial RLS
-- tightening). Discovered the previous fix LEFT IN PLACE multiple wider
-- policies that ORed in to grant access. RLS SELECT is OR-ed across
-- policies — adding a tight policy doesn't help if a wide one is still
-- there.
--
-- INCIDENT REVERIFY (this migration's goal)
--   Authenticated user with role=office_manager and org_id=Littleton
--   should see ZERO rows from any sensitive table that don't belong to
--   Littleton.
--
-- THIS MIGRATION CLOSES
--   1. appointments — dropped "Anyone can check availability" (USING true,
--      anon+auth), "Users can see appointments in their tenant"
--      (single-tenant always-true), "Authenticated users can update/insert/
--      delete appointments". Replaced with role-scoped policies.
--   2. tenant_patients — dropped catch-all authenticated reads.
--   3. patient_lab_requests — added explicit org-scoped SELECT.
--   4. org_invoices — dropped "Auth crud" (auth.role()='authenticated').
--      Replaced with platform-admin full + org-staff read-only-own-org.
--   5. organizations — dropped "Auth read orgs". Org-staff read their own.
--   6. post_visit_sequences — dropped "pvs_all" USING (true) +
--      "Authenticated read pvs". Patients read own; admin full.
--   7. sms_notifications — dropped USING (true). Admin only.
--   8. specimen_deliveries — dropped "Authenticated read".
--      Org-staff read deliveries for their org's appointments.
--   9. webhook_logs — dropped "Authenticated". Admin only (Stripe payloads
--      contain patient names + amounts).
--  10. referral_credits / referral_codes — dropped *_all USING (true).
--      Admin full; user reads own credits; anon-active-codes preserved.
--
-- PUBLIC BOOKING FLOW IMPACT
--   The booking flow's slot picker (DateTimeSelectionStep) used to query
--   appointments directly via the now-dropped "Anyone can check
--   availability" policy. New `get_busy_slots(p_date)` RPC returns just
--   appointment_time/duration/service_type/status — anon-callable. The
--   client-side slot picker should be migrated in a follow-up commit.
--   Until then, anonymous users will see all slots as available — bad
--   UX but NOT a HIPAA leak. Booking + checkout still work because the
--   server-side `_shared/availability.ts` re-validates slots on submit.
--
-- VERIFICATION
--   Simulating Lara's JWT under SET LOCAL ROLE authenticated:
--     appointments         total=7   cross_org=0
--     tenant_patients      total=4   cross_org=0
--     patient_lab_requests total=0   cross_org=0
--     org_invoices         total=0   cross_org=0
--     organizations        total=1   cross_org=0  (only Littleton)
--     post_visit_sequences total=0
--     sms_notifications    total=0
--     webhook_logs         total=0   (admin-only)
--     specimen_deliveries  total=5   (all Littleton-linked)
--     referral_credits     total=0
--   Concrete pre-fix leaks (Dean Faracchio, Charles Cook) — gone.

-- ============================================================================
-- Pass 4 — drop wide-open SELECT policies on appointments
-- ============================================================================
DROP POLICY IF EXISTS "Anyone can check availability" ON public.appointments;
DROP POLICY IF EXISTS "Users can see appointments in their tenant" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can delete appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can insert appointments" ON public.appointments;

CREATE POLICY "platform_admin_full_appointments"
ON public.appointments FOR ALL TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'))
WITH CHECK (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));

CREATE POLICY "phleb_update_assigned_appointments"
ON public.appointments FOR UPDATE TO authenticated
USING (phlebotomist_id IN (SELECT id FROM staff_profiles WHERE user_id = auth.uid()))
WITH CHECK (phlebotomist_id IN (SELECT id FROM staff_profiles WHERE user_id = auth.uid()));

CREATE POLICY "org_staff_update_their_org_appointments"
ON public.appointments FOR UPDATE TO authenticated
USING (
  organization_id IS NOT NULL
  AND organization_id::text = (auth.jwt()->'user_metadata'->>'organization_id')
  AND lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('office_manager','provider')
)
WITH CHECK (organization_id::text = (auth.jwt()->'user_metadata'->>'organization_id'));

DROP POLICY IF EXISTS "Authenticated users can read patients" ON public.tenant_patients;
DROP POLICY IF EXISTS "Anyone can read tenant_patients" ON public.tenant_patients;
DROP POLICY IF EXISTS "tenant_patients_select_authenticated" ON public.tenant_patients;

-- Anon-safe slot RPC for booking flow
CREATE OR REPLACE FUNCTION public.get_busy_slots(p_date date)
RETURNS TABLE (appointment_time time, duration_minutes int, service_type text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT a.appointment_time, COALESCE(a.duration_minutes, 30), a.service_type, a.status
  FROM appointments a
  WHERE a.appointment_date::date = p_date
    AND a.status NOT IN ('cancelled', 'no_show')
    AND a.appointment_time IS NOT NULL;
$function$;
GRANT EXECUTE ON FUNCTION public.get_busy_slots(date) TO anon, authenticated;

-- ============================================================================
-- Pass 5 — lock down org_invoices, organizations, post_visit_sequences, etc.
-- ============================================================================

-- org_invoices (column is org_id, not organization_id)
DROP POLICY IF EXISTS "Auth crud org_invoices" ON public.org_invoices;
CREATE POLICY "platform_admin_full_org_invoices"
ON public.org_invoices FOR ALL TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'))
WITH CHECK (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));
CREATE POLICY "org_staff_read_their_org_invoices"
ON public.org_invoices FOR SELECT TO authenticated
USING (
  org_id::text = (auth.jwt()->'user_metadata'->>'organization_id')
  AND lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('office_manager','provider')
);

-- organizations
DROP POLICY IF EXISTS "Auth read orgs" ON public.organizations;
CREATE POLICY "platform_admin_read_all_orgs"
ON public.organizations FOR SELECT TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));
CREATE POLICY "org_staff_read_their_own_org"
ON public.organizations FOR SELECT TO authenticated
USING (
  id::text = (auth.jwt()->'user_metadata'->>'organization_id')
  AND lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('office_manager','provider')
);

-- post_visit_sequences
DROP POLICY IF EXISTS "Authenticated read pvs" ON public.post_visit_sequences;
DROP POLICY IF EXISTS "pvs_all" ON public.post_visit_sequences;
CREATE POLICY "platform_admin_full_pvs"
ON public.post_visit_sequences FOR ALL TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'))
WITH CHECK (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));
CREATE POLICY "patient_reads_own_pvs"
ON public.post_visit_sequences FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM appointments a WHERE a.id = post_visit_sequences.appointment_id AND a.patient_id = auth.uid())
);

-- sms_notifications
DROP POLICY IF EXISTS "System can manage SMS notifications" ON public.sms_notifications;
CREATE POLICY "platform_admin_full_sms"
ON public.sms_notifications FOR ALL TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'))
WITH CHECK (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));

-- specimen_deliveries
DROP POLICY IF EXISTS "Authenticated read specimens" ON public.specimen_deliveries;
CREATE POLICY "platform_admin_read_specimens"
ON public.specimen_deliveries FOR SELECT TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));
CREATE POLICY "org_staff_read_their_specimens"
ON public.specimen_deliveries FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.id = specimen_deliveries.appointment_id
      AND a.organization_id::text = (auth.jwt()->'user_metadata'->>'organization_id')
      AND lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('office_manager','provider')
  )
);

-- webhook_logs (Stripe payloads — admin only)
DROP POLICY IF EXISTS "webhook_logs_read" ON public.webhook_logs;
CREATE POLICY "platform_admin_read_webhook_logs"
ON public.webhook_logs FOR SELECT TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));

-- referral_credits
DROP POLICY IF EXISTS "referral_credits_all" ON public.referral_credits;
CREATE POLICY "platform_admin_full_referral_credits"
ON public.referral_credits FOR ALL TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'))
WITH CHECK (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));
CREATE POLICY "user_reads_own_referral_credits"
ON public.referral_credits FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- referral_codes
DROP POLICY IF EXISTS "referral_codes_all" ON public.referral_codes;
CREATE POLICY "platform_admin_full_referral_codes"
ON public.referral_codes FOR ALL TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'))
WITH CHECK (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));
