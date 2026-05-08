-- BUG FIX 2026-05-07 — phleb dashboard "Assign organization" picker was
-- empty for every appointment. Root cause: the HIPAA lockdown migrations
-- earlier today granted public.organizations SELECT only to:
--   1. platform_admin_read_all_orgs (super_admin/admin/owner)
--   2. org_staff_read_their_own_org (office_manager/provider w/ org_id)
--
-- Phlebotomists fell through both. AssignOrgButton.loadOrgs() ran a
-- SELECT * FROM organizations that returned 0 rows. No error surfaced —
-- the UI just rendered an empty list, which is what the phleb reported.
--
-- Fix: third policy granting authenticated phlebotomists read access. Org
-- name / contact phone / contact email / hours are NOT PHI — they're the
-- entity. Patient-PHI within an org is still locked behind appointments +
-- tenant_patients RLS, which haven't changed.

CREATE POLICY phleb_read_all_orgs
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    lower(COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '')) = 'phlebotomist'
  );
