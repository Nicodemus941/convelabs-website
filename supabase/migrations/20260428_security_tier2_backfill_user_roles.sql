-- 2026-04-28 SECURITY TIER 2 — backfill user_roles from user_metadata
--
-- Tier 2 migration replaced 54 RLS policies that read user_metadata
-- with helpers reading public.user_roles. But every existing staff
-- user had their role ONLY in user_metadata (never inserted into
-- user_roles). So immediately after the policy swap, every admin UI
-- would have shown empty tables.
--
-- This one-shot backfill copies the (super_admin, admin, office_manager,
-- owner, phlebotomist) role from raw_user_meta_data → user_roles for
-- every auth user that has it. Idempotent (ON CONFLICT DO NOTHING +
-- NOT EXISTS guard).
--
-- Going forward: role assignment happens through user_roles directly
-- (e.g. when accepting a staff invitation, when an admin promotes
-- another admin). user_metadata is no longer authoritative.

-- Insert any user_metadata role that's missing from user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, (u.raw_user_meta_data->>'role')::app_role
FROM auth.users u
WHERE (u.raw_user_meta_data->>'role') IN
  ('super_admin','admin','office_manager','owner','phlebotomist')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id
      AND ur.role::text = u.raw_user_meta_data->>'role'
  )
ON CONFLICT DO NOTHING;
