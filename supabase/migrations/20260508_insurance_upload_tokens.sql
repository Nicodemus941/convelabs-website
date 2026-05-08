-- 2026-05-08 — patient self-serve insurance upload tokens.
-- Each token is a 14-day single-use URL that lets a patient upload an
-- updated insurance card without logging in. Used by the expiry-pulse
-- SMS/email + future "phleb didn't capture at door" recovery flows.

CREATE TABLE IF NOT EXISTS public.insurance_upload_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.tenant_patients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  rank text NOT NULL DEFAULT 'primary' CHECK (rank IN ('primary','secondary')),
  source text NOT NULL DEFAULT 'expiry_pulse' CHECK (source IN ('expiry_pulse','admin_send','phleb_followup','first_visit_recovery')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_upload_tokens_patient
  ON public.insurance_upload_tokens (patient_id) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_upload_tokens_expiry
  ON public.insurance_upload_tokens (expires_at) WHERE used_at IS NULL;

ALTER TABLE public.insurance_upload_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_admin_all_insurance_upload_tokens
  ON public.insurance_upload_tokens FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['super_admin','admin','owner']))
  WITH CHECK (public.has_any_role(ARRAY['super_admin','admin','owner']));

GRANT SELECT, INSERT, UPDATE ON public.insurance_upload_tokens TO authenticated;
