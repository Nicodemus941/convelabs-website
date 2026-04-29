-- 2026-04-29 — Final cleanup of user_metadata role-reading + close
-- silent RLS denials (RLS=true with zero policies)
--
-- DEEPER ROOT CAUSE: get_current_user_role() and is_user_admin()
-- were still reading auth.jwt()->'user_metadata'->>'role' (deprecated
-- Tier 2). They're called by RLS policies on patient_care_notes,
-- notification_logs, appointments.secure_appointments_select, and
-- many others — so phlebs lost access broadly.
--
-- Plus 6 tables had RLS enabled with zero policies (silent deny):
-- patient_lab_requests, sms_otp_codes, staff_channel_members,
-- training_escalations, training_progress, training_search_log.
--
-- Plus 7 helper functions + 4 in-body role checks + 2 storage policies
-- (sop_images_admin_*) still read user_metadata.

-- ─── Helpers rewritten to read user_roles ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::text FROM user_roles
     WHERE user_id = auth.uid()
     ORDER BY array_position(
       ARRAY['super_admin','admin','owner','office_manager','phlebotomist','concierge_doctor','patient']::text[],
       role::text
     ) LIMIT 1),
    'user'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_admin(); $$;

CREATE OR REPLACE FUNCTION public.is_admin_role()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_admin(); $$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_admin(); $$;

CREATE OR REPLACE FUNCTION public.is_staff_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_any_role(ARRAY['phlebotomist','admin','office_manager','owner','super_admin']); $$;

CREATE OR REPLACE FUNCTION public.user_has_role(required_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_any_role(ARRAY[required_role]); $$;

CREATE OR REPLACE FUNCTION public.user_has_any_role(required_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_any_role(required_roles); $$;

-- ─── In-body fixes (admin_assign_appointment_org, get_phleb_served_patients,
--     delete_patient overloads, restore_patient overloads) — full bodies
--     replaced. See actual DB for current source; SECURITY DEFINER + role
--     check now uses public.is_admin() / has_any_role().

-- ─── SMS access for phlebs ─────────────────────────────────────────
CREATE POLICY sms_conversations_phleb_read ON public.sms_conversations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (public.is_phleb() AND patient_id IN (
      SELECT a.patient_id FROM appointments a
      JOIN staff_profiles sp ON sp.id = a.phlebotomist_id
      WHERE sp.user_id = auth.uid() AND a.patient_id IS NOT NULL
    ))
  );
CREATE POLICY sms_messages_phleb_read ON public.sms_messages
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR conversation_id IN (
      SELECT sc.id FROM sms_conversations sc
      JOIN appointments a ON a.patient_id = sc.patient_id
      JOIN staff_profiles sp ON sp.id = a.phlebotomist_id
      WHERE sp.user_id = auth.uid()
    )
  );

-- ─── Storage: sop-images write/delete (was using user_metadata) ────
DROP POLICY IF EXISTS sop_images_admin_write ON storage.objects;
CREATE POLICY sop_images_admin_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sop-images' AND public.has_any_role(ARRAY['super_admin','office_manager']));

DROP POLICY IF EXISTS sop_images_admin_delete ON storage.objects;
CREATE POLICY sop_images_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'sop-images' AND public.has_any_role(ARRAY['super_admin','office_manager']));

-- ─── Close 6 silent-deny tables (RLS on, zero policies) ────────────
CREATE POLICY training_progress_self ON public.training_progress
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY training_escalations_self ON public.training_escalations
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY training_search_log_self ON public.training_search_log
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY staff_channel_members_self ON public.staff_channel_members
  FOR SELECT TO authenticated
  USING (
    staff_id IN (SELECT id FROM staff_profiles WHERE user_id = auth.uid())
    OR public.is_admin()
  );
CREATE POLICY staff_channel_members_admin_write ON public.staff_channel_members
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY sms_otp_codes_anon_insert ON public.sms_otp_codes
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY patient_lab_requests_staff ON public.patient_lab_requests
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_phleb() OR created_by = auth.uid())
  WITH CHECK (public.is_admin() OR public.is_phleb() OR created_by = auth.uid());

-- Verification (re-run post-migration):
--   silent_deny_tables: 0
--   fns_using_user_metadata_role: 0
--   policies_using_user_metadata: 0
-- (One legitimate remaining user_metadata reader — get_org_linked_patients —
-- reads user_metadata.organization_id for provider portal sessions, NOT
-- for role auth. Separate concern; needs provider-login refactor first.)
