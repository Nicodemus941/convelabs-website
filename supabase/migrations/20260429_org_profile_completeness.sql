-- Org profile completeness: capture full practice details so org-billed
-- monthly invoicing + branded patient portal can light up. Hormozi-grade:
-- progressive unlock (50% = booking links, 80% = patient roster, 100% = monthly invoicing).

-- 1. Extend organizations with the missing operational fields
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fax              text,
  ADD COLUMN IF NOT EXISTS manager_email    text,
  ADD COLUMN IF NOT EXISTS front_desk_email text,
  ADD COLUMN IF NOT EXISTS hours_of_operation jsonb,
  ADD COLUMN IF NOT EXISTS lab_accounts     jsonb;

-- 2. Provider directory per org (multi-provider practices: NaturaMed, ND Wellness, etc.)
CREATE TABLE IF NOT EXISTS public.org_providers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  npi             text,
  email           text,
  phone           text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_providers_org_npi
  ON public.org_providers(organization_id, npi)
  WHERE npi IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_providers_org
  ON public.org_providers(organization_id) WHERE active;

ALTER TABLE public.org_providers ENABLE ROW LEVEL SECURITY;

-- Admins can do anything; org users can read their own org's providers.
DROP POLICY IF EXISTS org_providers_admin_all ON public.org_providers;
CREATE POLICY org_providers_admin_all ON public.org_providers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS org_providers_self_org_read ON public.org_providers;
CREATE POLICY org_providers_self_org_read ON public.org_providers
  FOR SELECT USING (
    organization_id::text = (auth.jwt() -> 'app_metadata' ->> 'organization_id')
  );

-- 3. Completeness RPC — drives the progress bar and unlock tiers in PracticeProfilePanel
CREATE OR REPLACE FUNCTION public.get_org_profile_completeness(p_org_id uuid)
RETURNS TABLE (pct int, total_fields int, missing text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o public.organizations;
  has_provider boolean;
  has_provider_npi boolean;
  filled int := 0;
  miss text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::int, 12::int, ARRAY['organization_not_found']::text[];
    RETURN;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.org_providers WHERE organization_id = p_org_id AND active) INTO has_provider;
  SELECT EXISTS(SELECT 1 FROM public.org_providers WHERE organization_id = p_org_id AND active AND npi IS NOT NULL AND length(npi) > 0) INTO has_provider_npi;

  IF o.name IS NOT NULL AND length(o.name) > 0 THEN filled := filled + 1; ELSE miss := miss || 'organization_name'; END IF;
  IF o.contact_email IS NOT NULL AND length(o.contact_email) > 0 THEN filled := filled + 1; ELSE miss := miss || 'contact_email'; END IF;
  IF o.contact_phone IS NOT NULL AND length(o.contact_phone) > 0 THEN filled := filled + 1; ELSE miss := miss || 'contact_phone'; END IF;
  IF o.fax IS NOT NULL AND length(o.fax) > 0 THEN filled := filled + 1; ELSE miss := miss || 'fax'; END IF;
  IF o.manager_email IS NOT NULL AND length(o.manager_email) > 0 THEN filled := filled + 1; ELSE miss := miss || 'manager_email'; END IF;
  IF o.front_desk_email IS NOT NULL AND length(o.front_desk_email) > 0 THEN filled := filled + 1; ELSE miss := miss || 'front_desk_email'; END IF;
  IF o.address IS NOT NULL AND length(o.address) > 0 THEN filled := filled + 1; ELSE miss := miss || 'address'; END IF;
  IF o.hours_of_operation IS NOT NULL AND jsonb_typeof(o.hours_of_operation) = 'object' AND o.hours_of_operation <> '{}'::jsonb THEN filled := filled + 1; ELSE miss := miss || 'hours_of_operation'; END IF;
  IF o.lab_accounts IS NOT NULL AND jsonb_typeof(o.lab_accounts) = 'array' AND jsonb_array_length(o.lab_accounts) > 0 THEN filled := filled + 1; ELSE miss := miss || 'lab_accounts'; END IF;
  IF has_provider THEN filled := filled + 1; ELSE miss := miss || 'at_least_one_provider'; END IF;
  IF has_provider_npi THEN filled := filled + 1; ELSE miss := miss || 'provider_npi'; END IF;
  IF o.tax_id IS NOT NULL AND length(o.tax_id) > 0 THEN filled := filled + 1; ELSE miss := miss || 'tax_id'; END IF;

  RETURN QUERY SELECT LEAST(100, ROUND(100.0 * filled / 12.0))::int, 12, miss;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_profile_completeness(uuid) TO authenticated;
