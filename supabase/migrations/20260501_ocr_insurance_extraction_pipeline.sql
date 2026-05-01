-- Capture OCR-extracted insurance on appointment_lab_orders so any
-- downstream consumer (chart sync, billing audit, patient confirm modal)
-- can see exactly what the form said vs. what's stored on the patient.

ALTER TABLE public.appointment_lab_orders
  ADD COLUMN IF NOT EXISTS ocr_insurance_provider text,
  ADD COLUMN IF NOT EXISTS ocr_insurance_member_id text,
  ADD COLUMN IF NOT EXISTS ocr_insurance_group_number text,
  ADD COLUMN IF NOT EXISTS insurance_match_status text;
-- insurance_match_status values:
--   'match'          — extracted matches tenant_patients exactly
--   'differs'        — extracted differs from stored → patient confirm modal
--   'extracted_new'  — patient had no insurance on file; OCR found one (auto-add)
--   'none'           — no insurance block detected on the form
--   NULL             — not yet evaluated

CREATE TABLE IF NOT EXISTS public.pending_insurance_changes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_lab_order_id uuid REFERENCES public.appointment_lab_orders(id) ON DELETE CASCADE,
  appointment_id        uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  tenant_patient_id     uuid REFERENCES public.tenant_patients(id) ON DELETE CASCADE,
  current_provider      text,
  current_member_id     text,
  current_group_number  text,
  proposed_provider     text,
  proposed_member_id    text,
  proposed_group_number text,
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted_new','kept_existing','admin_reviewed','dismissed')),
  resolved_at           timestamptz,
  resolved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_insurance_per_alo
  ON public.pending_insurance_changes(appointment_lab_order_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_pending_insurance_patient_open
  ON public.pending_insurance_changes(tenant_patient_id, status) WHERE status = 'open';

ALTER TABLE public.pending_insurance_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pic_admin_all ON public.pending_insurance_changes;
CREATE POLICY pic_admin_all ON public.pending_insurance_changes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS pic_patient_select ON public.pending_insurance_changes;
CREATE POLICY pic_patient_select ON public.pending_insurance_changes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tenant_patients tp WHERE tp.id = tenant_patient_id AND tp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS pic_patient_update ON public.pending_insurance_changes;
CREATE POLICY pic_patient_update ON public.pending_insurance_changes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM tenant_patients tp WHERE tp.id = tenant_patient_id AND tp.user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.get_my_pending_insurance_change()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(pic.*) FROM pending_insurance_changes pic
  JOIN tenant_patients tp ON tp.id = pic.tenant_patient_id
  WHERE tp.user_id = auth.uid() AND pic.status = 'open'
  ORDER BY pic.created_at DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_pending_insurance_change() TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_my_pending_insurance(p_change_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_change pending_insurance_changes;
  v_patient tenant_patients;
BEGIN
  IF p_action NOT IN ('accept_new','keep_existing') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_action');
  END IF;
  SELECT * INTO v_change FROM pending_insurance_changes WHERE id = p_change_id AND status = 'open';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found_or_resolved'); END IF;
  SELECT * INTO v_patient FROM tenant_patients WHERE id = v_change.tenant_patient_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized'); END IF;

  IF p_action = 'accept_new' THEN
    UPDATE tenant_patients SET
      insurance_provider     = v_change.proposed_provider,
      insurance_member_id    = v_change.proposed_member_id,
      insurance_group_number = v_change.proposed_group_number,
      updated_at = now()
    WHERE id = v_change.tenant_patient_id;
    UPDATE pending_insurance_changes SET status = 'accepted_new', resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_change_id;
  ELSE
    UPDATE pending_insurance_changes SET status = 'kept_existing', resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_change_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', p_action);
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_my_pending_insurance(uuid, text) TO authenticated;
