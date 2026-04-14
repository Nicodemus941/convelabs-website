-- =============================================================
-- Visit bundles (prepaid multi-visit packages)
-- =============================================================
CREATE TABLE IF NOT EXISTS visit_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email text NOT NULL,
  patient_id uuid,
  initial_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  credits_purchased int NOT NULL DEFAULT 4,
  credits_remaining int NOT NULL DEFAULT 3,
  discount_percent numeric NOT NULL DEFAULT 15,
  amount_paid numeric NOT NULL,
  stripe_checkout_session_id text UNIQUE,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_bundles_email ON visit_bundles(patient_email);
CREATE INDEX IF NOT EXISTS idx_visit_bundles_patient ON visit_bundles(patient_id);
CREATE INDEX IF NOT EXISTS idx_visit_bundles_active ON visit_bundles(credits_remaining) WHERE credits_remaining > 0;

ALTER TABLE visit_bundles ENABLE ROW LEVEL SECURITY;

-- Admins and owners can read/write; patients can see their own
DROP POLICY IF EXISTS "Admins can manage visit bundles" ON visit_bundles;
CREATE POLICY "Admins can manage visit bundles" ON visit_bundles
  FOR ALL
  USING (auth.jwt() ->> 'role' IN ('super_admin', 'office_manager', 'service_role'));

DROP POLICY IF EXISTS "Patients can view own bundles" ON visit_bundles;
CREATE POLICY "Patients can view own bundles" ON visit_bundles
  FOR SELECT
  USING (
    patient_id = auth.uid()
    OR lower(patient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- =============================================================
-- Org-invoice dunning (7/14/30-day automated follow-ups)
-- =============================================================
ALTER TABLE org_invoices
  ADD COLUMN IF NOT EXISTS dunning_stage int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dunning_at timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_paused boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_org_invoices_dunning
  ON org_invoices(status, sent_at, dunning_stage)
  WHERE status = 'sent' AND dunning_paused = false;
