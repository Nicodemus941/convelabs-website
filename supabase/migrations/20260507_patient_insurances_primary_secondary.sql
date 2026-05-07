-- patient_insurances — multi-row insurance store so a patient can have
-- BOTH primary and secondary coverage on file. Replaces the single-row
-- design on tenant_patients (insurance_provider / member_id / group_number /
-- card_path) which only allowed 1 insurance per patient.
--
-- The legacy 4 columns on tenant_patients stay in place for now (read
-- compatibility for surfaces that haven't been refactored yet); a
-- backfill below copies whatever's there into a primary row.

CREATE TABLE IF NOT EXISTS public.patient_insurances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.tenant_patients(id) ON DELETE CASCADE,
  rank text NOT NULL CHECK (rank IN ('primary','secondary')),
  provider text,
  member_id text,
  group_number text,
  plan_type text,
  card_front_path text,
  card_back_path text,
  effective_from date,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  -- "phleb verified at draw" — Hormozi tip: phleb confirms card-on-file
  -- matches what the patient just handed them, reducing claim rejections.
  verified_by_user_id uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  ocr_confidence numeric,
  ocr_raw_response jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_patient_insurance_active_rank
  ON public.patient_insurances (patient_id, rank)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_patient_insurances_patient
  ON public.patient_insurances (patient_id) WHERE is_active;

INSERT INTO public.patient_insurances
  (patient_id, rank, provider, member_id, group_number, card_front_path, is_active, created_at)
SELECT
  tp.id,
  'primary',
  NULLIF(tp.insurance_provider, ''),
  NULLIF(tp.insurance_member_id, ''),
  NULLIF(tp.insurance_group_number, ''),
  NULLIF(tp.insurance_card_path, ''),
  true,
  COALESCE(tp.created_at, now())
FROM public.tenant_patients tp
WHERE COALESCE(tp.insurance_provider, '') <> ''
   OR COALESCE(tp.insurance_member_id, '') <> ''
   OR COALESCE(tp.insurance_group_number, '') <> ''
   OR COALESCE(tp.insurance_card_path, '') <> ''
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_patient_insurances_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS patient_insurances_touch_updated ON public.patient_insurances;
CREATE TRIGGER patient_insurances_touch_updated
BEFORE UPDATE ON public.patient_insurances
FOR EACH ROW EXECUTE FUNCTION public.touch_patient_insurances_updated_at();

ALTER TABLE public.patient_insurances ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_admin_all_patient_insurances
  ON public.patient_insurances FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['super_admin','admin','owner']))
  WITH CHECK (public.has_any_role(ARRAY['super_admin','admin','owner']));

CREATE POLICY org_staff_their_patient_insurances
  ON public.patient_insurances FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_patients tp
      WHERE tp.id = patient_insurances.patient_id
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
      WHERE tp.id = patient_insurances.patient_id
        AND tp.organization_id::text = COALESCE(
          auth.jwt() -> 'user_metadata' ->> 'organization_id',
          auth.jwt() -> 'user_metadata' ->> 'org_id',
          auth.jwt() -> 'app_metadata' ->> 'organization_id'
        )
    )
  );

CREATE POLICY phleb_reads_assigned_patient_insurances
  ON public.patient_insurances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.patient_email = (
              SELECT email FROM public.tenant_patients WHERE id = patient_insurances.patient_id
            )
        AND a.phlebotomist_id = auth.uid()
    )
  );

CREATE POLICY patient_reads_own_patient_insurances
  ON public.patient_insurances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_patients tp
      WHERE tp.id = patient_insurances.patient_id
        AND tp.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_insurances TO authenticated;
