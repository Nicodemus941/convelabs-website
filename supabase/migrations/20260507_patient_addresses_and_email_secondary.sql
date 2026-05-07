-- patient_addresses — multi-address support (Hormozi-style: meet the
-- patient where they actually are; business owners need home + office).
-- Replaces single-row tenant_patients.address with a child table that
-- supports labelled addresses, a default, and per-appointment selection.

CREATE TABLE IF NOT EXISTS public.patient_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.tenant_patients(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label IN ('home','office','other')),
  nickname text,
  line1 text NOT NULL,
  line2 text,
  city text,
  state text,
  zipcode text,
  latitude numeric,
  longitude numeric,
  access_notes text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_patient_default_address
  ON public.patient_addresses (patient_id) WHERE is_default AND is_active;

CREATE INDEX IF NOT EXISTS idx_patient_addresses_patient
  ON public.patient_addresses (patient_id) WHERE is_active;

CREATE OR REPLACE FUNCTION public.touch_patient_addresses_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS patient_addresses_touch ON public.patient_addresses;
CREATE TRIGGER patient_addresses_touch
BEFORE UPDATE ON public.patient_addresses
FOR EACH ROW EXECUTE FUNCTION public.touch_patient_addresses_updated_at();

INSERT INTO public.patient_addresses
  (patient_id, label, line1, city, zipcode, is_default, is_active, created_at)
SELECT tp.id, 'home', NULLIF(tp.address, ''), NULLIF(tp.city, ''), NULLIF(tp.zipcode, ''), true, true, COALESCE(tp.created_at, now())
FROM public.tenant_patients tp
WHERE COALESCE(tp.address, '') <> ''
ON CONFLICT DO NOTHING;

ALTER TABLE public.tenant_patients
  ADD COLUMN IF NOT EXISTS email_secondary text;

CREATE INDEX IF NOT EXISTS idx_tenant_patients_email_secondary
  ON public.tenant_patients (lower(email_secondary)) WHERE email_secondary IS NOT NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_address_id uuid REFERENCES public.patient_addresses(id);

ALTER TABLE public.patient_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_admin_all_patient_addresses
  ON public.patient_addresses FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['super_admin','admin','owner']))
  WITH CHECK (public.has_any_role(ARRAY['super_admin','admin','owner']));

CREATE POLICY org_staff_their_patient_addresses
  ON public.patient_addresses FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_patients tp
      WHERE tp.id = patient_addresses.patient_id
        AND tp.organization_id::text = COALESCE(
          auth.jwt() -> 'user_metadata' ->> 'organization_id',
          auth.jwt() -> 'user_metadata' ->> 'org_id',
          auth.jwt() -> 'app_metadata' ->> 'organization_id'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_patients tp
      WHERE tp.id = patient_addresses.patient_id
        AND tp.organization_id::text = COALESCE(
          auth.jwt() -> 'user_metadata' ->> 'organization_id',
          auth.jwt() -> 'user_metadata' ->> 'org_id',
          auth.jwt() -> 'app_metadata' ->> 'organization_id'
        )
    )
  );

CREATE POLICY phleb_reads_assigned_patient_addresses
  ON public.patient_addresses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.patient_email = (SELECT email FROM public.tenant_patients WHERE id = patient_addresses.patient_id)
        AND a.phlebotomist_id = auth.uid()
    )
  );

CREATE POLICY patient_reads_own_patient_addresses
  ON public.patient_addresses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_patients tp
      WHERE tp.id = patient_addresses.patient_id AND tp.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_addresses TO authenticated;
