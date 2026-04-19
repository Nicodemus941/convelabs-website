-- ─────────────────────────────────────────────────────────────────────
-- 2026-04-19 · Family-member booking + security hardening
--
-- 1. Tighten family_members RLS (was FOR ALL USING true — cross-patient leak)
-- 2. Add updated_at + trigger + patient_id index
-- 3. Add appointments.family_member_id for when a booker schedules a
--    visit for a saved family member (primary billing stays on booker)
-- 4. Unschedule the partner-announcement one-shot cron — campaign already
--    fired via manual invoke at 2026-04-19 14:39 UTC; leaving the cron
--    active risks a (harmless-but-noisy) second fire at 15:00 UTC.
-- ─────────────────────────────────────────────────────────────────────

-- (1) + (2) applied via MCP migration tighten_family_members_rls_and_add_updated_at
-- (3)      applied via MCP migration add_family_member_id_to_appointments
--
-- This file is the version-controlled twin so future replays / branch
-- setups get the same state. Running it on top of an environment that
-- already has the migrations applied is idempotent (guards below).

-- family_members RLS
DROP POLICY IF EXISTS family_members_all ON public.family_members;
DROP POLICY IF EXISTS family_members_select_own ON public.family_members;
DROP POLICY IF EXISTS family_members_insert_own ON public.family_members;
DROP POLICY IF EXISTS family_members_update_own ON public.family_members;
DROP POLICY IF EXISTS family_members_delete_own ON public.family_members;
DROP POLICY IF EXISTS family_members_admin_all ON public.family_members;
DROP POLICY IF EXISTS family_members_phleb_select ON public.family_members;

CREATE OR REPLACE FUNCTION public.user_owns_family_patient(p_patient_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_patients tp
    WHERE tp.id = p_patient_id
      AND (tp.user_id = auth.uid()
           OR lower(tp.email) = lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), '')))
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_tenant_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role::text IN ('super_admin', 'office_manager', 'admin'));
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_phleb()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role::text IN ('phlebotomist', 'phleb'));
$$;

CREATE POLICY family_members_select_own ON public.family_members FOR SELECT TO authenticated
  USING (public.user_owns_family_patient(patient_id));
CREATE POLICY family_members_insert_own ON public.family_members FOR INSERT TO authenticated
  WITH CHECK (public.user_owns_family_patient(patient_id));
CREATE POLICY family_members_update_own ON public.family_members FOR UPDATE TO authenticated
  USING (public.user_owns_family_patient(patient_id))
  WITH CHECK (public.user_owns_family_patient(patient_id));
CREATE POLICY family_members_delete_own ON public.family_members FOR DELETE TO authenticated
  USING (public.user_owns_family_patient(patient_id));
CREATE POLICY family_members_admin_all ON public.family_members FOR ALL TO authenticated
  USING (public.current_user_is_tenant_admin())
  WITH CHECK (public.current_user_is_tenant_admin());
CREATE POLICY family_members_phleb_select ON public.family_members FOR SELECT TO authenticated
  USING (public.current_user_is_phleb());

ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_family_members_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_family_members_updated_at ON public.family_members;
CREATE TRIGGER trg_family_members_updated_at BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_family_members_updated_at();

CREATE INDEX IF NOT EXISTS idx_family_members_patient_id ON public.family_members(patient_id);

-- appointments.family_member_id
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_family_member_id
  ON public.appointments(family_member_id) WHERE family_member_id IS NOT NULL;

-- Unschedule the partner one-shot cron (guarded — only if it still exists).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oneshot-partner-announcements-20260419-11am') THEN
    PERFORM cron.unschedule('oneshot-partner-announcements-20260419-11am');
  END IF;
END $$;
