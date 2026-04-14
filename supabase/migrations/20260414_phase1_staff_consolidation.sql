-- Phase 1: Staff system consolidation
-- Keep staff_invitations (has real data) and staff_profiles (26 incoming FKs).
-- Extend staff_invitations with fields needed for role/location-scoped hiring.
-- Drop empty franchise_staff_invitations and franchise_staff.

BEGIN;

-- 1. Extend staff_invitations with the fields the franchise_ variant had + Hormozi fields
ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  -- Scope fields
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.franchise_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS territory_id uuid REFERENCES public.territories(id) ON DELETE SET NULL,
  -- Hormozi offer stack baked into the invite
  ADD COLUMN IF NOT EXISTS pay_rate_cents integer,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS invite_type text NOT NULL DEFAULT 'hire',
  ADD COLUMN IF NOT EXISTS onboarding_template_id uuid,
  -- Referral loop
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_bounty_cents integer,
  -- Signed offer from DocuSign or inline PDF
  ADD COLUMN IF NOT EXISTS signed_offer_url text,
  -- Token hygiene
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Backfill invite_type check and status defaults
ALTER TABLE public.staff_invitations
  ADD CONSTRAINT staff_invitations_invite_type_check
  CHECK (invite_type IN ('hire', 'promotion', 'transfer', 'rehire'));

-- 3. Index the scope + lookup columns
CREATE INDEX IF NOT EXISTS idx_staff_invitations_tenant ON public.staff_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_location ON public.staff_invitations(location_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_territory ON public.staff_invitations(territory_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON public.staff_invitations(email);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_token ON public.staff_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_status ON public.staff_invitations(status);

-- 4. Drop the empty duplicate tables (both have 0 rows, unreferenced by live UI)
DROP TABLE IF EXISTS public.franchise_staff_invitations CASCADE;
DROP TABLE IF EXISTS public.franchise_staff CASCADE;

COMMIT;
