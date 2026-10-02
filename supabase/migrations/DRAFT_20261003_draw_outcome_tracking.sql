-- ============================================================================
-- DRAFT — NOT APPLIED. Filename is deliberately outside the CLI's
-- <timestamp>_name.sql pattern so `supabase db push` ignores it. Apply by
-- hand (owner) after review, then rename to 20261003xxxxxx_draw_outcome_tracking.sql.
-- ============================================================================
--
-- Draw outcome + delivery-gate tracking — the data behind provable quality
-- numbers (draw success rate, draw time, every sample delivered) instead of
-- marketing claims.
--
--  1. appointments: draw_outcome / draw_failure_reason / draw_note / tube_count.
--     The redraw link REUSES the existing `original_appointment_id` self-FK
--     (verified live 2026-10-02: column + FK exist, 0 rows use it).
--  2. is_lab_bound_service(text) — ONE classifier, mirrored in
--     src/lib/phlebHelpers.ts isLabBound(). Not lab-bound: in-office, the
--     partner-* codes (drawn and left on site), therapeutic (blood discarded),
--     specialty-kit* (ships via UPS/FedEx), invoice, dev-testing. Everything
--     else — including blank, couples-wellness-stack and
--     specimen-collection-stool-urine — is lab-bound.
--  3. quality_metrics_since() — baseline date from system_settings
--     (`quality_metrics_since`, seeded "2026-10-03") with a code fallback.
--     A visit's "day" is the UTC date of appointment_date, the same convention
--     the frontend uses (src/lib/appointmentDate.ts toDateOnly), so a row
--     stored as 2026-10-03T00:00:00Z counts as Oct 3.
--  4. delivery_gate_overrides — admin override with a reason (audit).
--  5. Guard trigger (BEFORE UPDATE OF status): a lab-bound visit dated on/after
--     the baseline cannot move to specimen_delivered OR completed without a
--     specimen_deliveries row, unless an override row exists. Pre-baseline
--     rows are untouched; nothing here UPDATEs existing appointment rows.
--  6. RPCs: get_quality_metrics (admin), get_delivery_gaps (admin: all; phleb:
--     own), admin_override_delivery_gate (admin), create_free_redraw (assigned
--     phleb or admin), get_public_quality_counts (anon, counts only, no PHI).
--  7. Indexes + the settings seed.
--
-- Everything is additive and idempotent. Never back-fills or synthesizes
-- delivery rows. The ~26 historical lab-bound visits without a delivery row
-- are intentionally outside the baseline window.

-- 1 ── appointments columns ──────────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS draw_outcome text,
  ADD COLUMN IF NOT EXISTS draw_failure_reason text,
  ADD COLUMN IF NOT EXISTS draw_note text,
  ADD COLUMN IF NOT EXISTS tube_count integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_draw_outcome_check') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_draw_outcome_check
      CHECK (draw_outcome IS NULL OR draw_outcome IN
        ('success_first_stick', 'success_after_second_stick', 'partial', 'unsuccessful'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_draw_failure_reason_check') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_draw_failure_reason_check
      CHECK (draw_failure_reason IS NULL OR draw_failure_reason IN
        ('difficult_veins', 'patient_declined', 'fainted', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_tube_count_check') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_tube_count_check
      CHECK (tube_count IS NULL OR (tube_count >= 0 AND tube_count <= 60));
  END IF;
END $$;

COMMENT ON COLUMN public.appointments.draw_outcome IS
  'Phleb-recorded outcome at "Draw done": success_first_stick | success_after_second_stick | partial | unsuccessful. Stamped with collection_at.';
COMMENT ON COLUMN public.appointments.draw_failure_reason IS
  'Only when draw_outcome = unsuccessful: difficult_veins | patient_declined | fainted | other.';
COMMENT ON COLUMN public.appointments.draw_note IS 'Free-text note from the phleb at Draw done (required reason detail for unsuccessful/other).';
COMMENT ON COLUMN public.appointments.tube_count IS 'Tubes collected at the visit (optional, phleb-entered at Draw done).';
COMMENT ON COLUMN public.appointments.original_appointment_id IS
  'Redraw link: the visit this free redraw was created for (set by create_free_redraw). A redraw never counts as a successful collection of the original.';

-- 2 ── lab-bound classifier (mirror of src/lib/phlebHelpers.ts isLabBound) ──
CREATE OR REPLACE FUNCTION public.is_lab_bound_service(p_service_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NOT (
    coalesce(p_service_type, '') IN (
      'in-office',
      'partner-nd-wellness',
      'partner-restoration-place',
      'partner-elite-medical-concierge',
      'partner-naturamed',
      'partner-aristotle-education',
      'therapeutic',
      'invoice',
      'dev-testing'
    )
    OR coalesce(p_service_type, '') LIKE 'specialty-kit%'
  );
$$;

COMMENT ON FUNCTION public.is_lab_bound_service(text) IS
  'TRUE when the visit produces a specimen we drop at a lab (so a specimen_deliveries row is expected). Blank service_type is lab-bound. Keep in sync with isLabBound() in src/lib/phlebHelpers.ts.';

-- 3 ── baseline ──────────────────────────────────────────────────────────────
INSERT INTO public.system_settings (key, value)
SELECT 'quality_metrics_since', '"2026-10-03"'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'quality_metrics_since');

CREATE OR REPLACE FUNCTION public.quality_metrics_since()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT nullif(trim(both '"' from value::text), '')::date
       FROM public.system_settings WHERE key = 'quality_metrics_since'),
    DATE '2026-10-03'
  );
$$;

-- "Visit day" in the app's convention (UTC date portion of appointment_date).
CREATE OR REPLACE FUNCTION public.appointment_day(p_at timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$ SELECT (p_at AT TIME ZONE 'UTC')::date; $$;

-- 4 ── override audit table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_gate_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  actor uuid NOT NULL DEFAULT auth.uid(),
  actor_email text,
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  target_status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_gate_overrides_appointment_idx
  ON public.delivery_gate_overrides (appointment_id);

ALTER TABLE public.delivery_gate_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_gate_overrides_admin_select ON public.delivery_gate_overrides;
CREATE POLICY delivery_gate_overrides_admin_select ON public.delivery_gate_overrides
  FOR SELECT TO authenticated
  USING ((SELECT public.jwt_role()) IN ('super_admin', 'admin', 'owner'));

DROP POLICY IF EXISTS delivery_gate_overrides_admin_insert ON public.delivery_gate_overrides;
CREATE POLICY delivery_gate_overrides_admin_insert ON public.delivery_gate_overrides
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.jwt_role()) IN ('super_admin', 'admin', 'owner') AND actor = auth.uid());

COMMENT ON TABLE public.delivery_gate_overrides IS
  'Admin overrides of the delivery gate (closing a lab-bound visit with no specimen_deliveries row). One row per override, reason required.';

-- 5 ── guard trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_delivery_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only on a real transition INTO a closing status.
  IF NEW.status NOT IN ('specimen_delivered', 'completed') THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  -- Scope: lab-bound visits dated on/after the baseline. Old rows untouched.
  IF NOT public.is_lab_bound_service(NEW.service_type) THEN RETURN NEW; END IF;
  IF public.appointment_day(NEW.appointment_date) < public.quality_metrics_since() THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.specimen_deliveries d WHERE d.appointment_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.delivery_gate_overrides o WHERE o.appointment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'check_violation',
    MESSAGE = 'Delivery record required: log the specimen drop-off (Specimen Delivered) before this visit can be marked ' || NEW.status || '. Admins can override with a reason.',
    HINT = 'delivery_gate';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_delivery_gate ON public.appointments;
CREATE TRIGGER trg_enforce_delivery_gate
  BEFORE UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_gate();

-- 6 ── indexes ───────────────────────────────────────────────────────────────
-- specimen_deliveries(appointment_id) already has idx_specimens_appointment.
CREATE INDEX IF NOT EXISTS appointments_original_appointment_idx
  ON public.appointments (original_appointment_id) WHERE original_appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_draw_outcome_idx
  ON public.appointments (draw_outcome) WHERE draw_outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_quality_window_idx
  ON public.appointments (appointment_date, status);

-- 7 ── RPCs ──────────────────────────────────────────────────────────────────

-- 7a. Admin override: logs the reason, then applies the status. The guard
--     sees the override row and lets the transition through.
CREATE OR REPLACE FUNCTION public.admin_override_delivery_gate(
  p_appointment_id uuid,
  p_reason text,
  p_target_status text DEFAULT 'completed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  IF (SELECT public.jwt_role()) NOT IN ('super_admin', 'admin', 'owner') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_target_status NOT IN ('specimen_delivered', 'completed') THEN
    RAISE EXCEPTION 'target_status must be specimen_delivered or completed';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'A reason (at least 5 characters) is required';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.delivery_gate_overrides (appointment_id, actor, actor_email, reason, target_status)
  VALUES (p_appointment_id, auth.uid(), v_email, trim(p_reason), p_target_status);

  UPDATE public.appointments SET status = p_target_status
   WHERE id = p_appointment_id AND status IS DISTINCT FROM p_target_status;

  RETURN jsonb_build_object('ok', true, 'appointment_id', p_appointment_id, 'status', p_target_status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_override_delivery_gate(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_override_delivery_gate(uuid, text, text) TO authenticated;

-- 7b. Delivery gaps (post-baseline only). Admins see every row; a phleb sees
--     only visits assigned to them (phlebs have no SELECT on specimen_deliveries,
--     so this is how the "Delivery pending" flag reaches the phleb app).
--     pending_6h = lab-bound, collected or completed, no delivery row, and the
--     collection/completion stamp is older than 6 hours.
CREATE OR REPLACE FUNCTION public.get_delivery_gaps()
RETURNS TABLE (
  appointment_id uuid,
  appointment_date timestamptz,
  appointment_time time,
  status text,
  service_type text,
  patient_name text,
  patient_id uuid,
  patient_phone text,
  patient_email text,
  phlebotomist_id uuid,
  lab_destination text,
  collection_at timestamptz,
  completion_time timestamptz,
  draw_outcome text,
  overridden boolean,
  pending_6h boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT auth.uid() AS uid, (SELECT public.jwt_role()) AS role
  )
  SELECT
    a.id, a.appointment_date, a.appointment_time, a.status, a.service_type,
    CASE WHEN me.role IN ('super_admin','admin','owner') OR a.phlebotomist_id = me.uid THEN a.patient_name END,
    a.patient_id,
    CASE WHEN me.role IN ('super_admin','admin','owner') OR a.phlebotomist_id = me.uid THEN a.patient_phone END,
    CASE WHEN me.role IN ('super_admin','admin','owner') OR a.phlebotomist_id = me.uid THEN a.patient_email END,
    a.phlebotomist_id, a.lab_destination, a.collection_at, a.completion_time, a.draw_outcome,
    EXISTS (SELECT 1 FROM public.delivery_gate_overrides o WHERE o.appointment_id = a.id) AS overridden,
    (coalesce(a.collection_at, a.completion_time, CASE WHEN a.status = 'completed' THEN a.updated_at END) < now() - interval '6 hours') AS pending_6h
  FROM public.appointments a
  CROSS JOIN me
  WHERE public.is_lab_bound_service(a.service_type)
    AND public.appointment_day(a.appointment_date) >= public.quality_metrics_since()
    AND a.status IN ('in_progress', 'specimen_delivered', 'completed')
    AND a.draw_outcome IS DISTINCT FROM 'unsuccessful'
    AND NOT EXISTS (SELECT 1 FROM public.specimen_deliveries d WHERE d.appointment_id = a.id)
    AND (
      me.role IN ('super_admin', 'admin', 'owner')
      OR (me.role = 'phlebotomist' AND a.phlebotomist_id = me.uid)
    )
  ORDER BY a.appointment_date DESC, a.appointment_time DESC NULLS LAST;
$$;
REVOKE ALL ON FUNCTION public.get_delivery_gaps() FROM public;
GRANT EXECUTE ON FUNCTION public.get_delivery_gaps() TO authenticated;

-- 7c. Quality metrics (admin). Definitions:
--   * outcome_n            visits (any service, not cancelled, post-baseline) with a recorded draw_outcome
--   * first_stick_rate     success_first_stick / outcome_n
--   * overall_success_rate (success_first_stick + success_after_second_stick) / outcome_n
--                          (partial and unsuccessful are NOT successes)
--   * draw_time_*          minutes between start_time ("Start draw") and
--                          collection_at ("Draw done"), where both exist and
--                          0 < duration <= 4h; median + p90
--   * lab_bound_closed     lab-bound visits in specimen_delivered/completed
--   * delivered_count      ...of those, with a specimen_deliveries row
--   * delivery_coverage    delivered_count / lab_bound_closed
--   * samples_lost         lab_bound_closed with NO delivery row (expected 0; the guard blocks it)
--   * overrides            admin gate overrides in the window
--   * delivery_pending     open gaps older than 6h (from get_delivery_gaps logic)
--   * unsuccessful / redraws (visits with original_appointment_id set) / redraws_completed
--   * advertisable         outcome_n >= 200
CREATE OR REPLACE FUNCTION public.get_quality_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH w AS (
    SELECT a.*
    FROM public.appointments a
    WHERE (SELECT public.jwt_role()) IN ('super_admin', 'admin', 'owner')
      AND public.appointment_day(a.appointment_date) >= public.quality_metrics_since()
      AND a.status <> 'cancelled'
  ),
  outcomes AS (SELECT * FROM w WHERE draw_outcome IS NOT NULL),
  timed AS (
    SELECT extract(epoch FROM (collection_at - start_time)) / 60.0 AS minutes
    FROM w
    WHERE start_time IS NOT NULL AND collection_at IS NOT NULL
      AND collection_at > start_time
      AND collection_at - start_time <= interval '4 hours'
  ),
  lab_closed AS (
    SELECT w.id,
           EXISTS (SELECT 1 FROM public.specimen_deliveries d WHERE d.appointment_id = w.id) AS delivered,
           EXISTS (SELECT 1 FROM public.delivery_gate_overrides o WHERE o.appointment_id = w.id) AS overridden
    FROM w
    WHERE public.is_lab_bound_service(w.service_type)
      AND w.status IN ('specimen_delivered', 'completed')
  ),
  pending AS (
    SELECT count(*)::int AS n
    FROM w
    WHERE public.is_lab_bound_service(w.service_type)
      AND w.status IN ('in_progress', 'specimen_delivered', 'completed')
      AND w.draw_outcome IS DISTINCT FROM 'unsuccessful'
      AND NOT EXISTS (SELECT 1 FROM public.specimen_deliveries d WHERE d.appointment_id = w.id)
      AND coalesce(w.collection_at, w.completion_time, CASE WHEN w.status = 'completed' THEN w.updated_at END) < now() - interval '6 hours'
  )
  SELECT jsonb_build_object(
    'since', public.quality_metrics_since(),
    'generated_at', now(),
    'visits_in_window', (SELECT count(*) FROM w),
    'outcome_n', (SELECT count(*) FROM outcomes),
    'first_stick', (SELECT count(*) FROM outcomes WHERE draw_outcome = 'success_first_stick'),
    'second_stick', (SELECT count(*) FROM outcomes WHERE draw_outcome = 'success_after_second_stick'),
    'partial', (SELECT count(*) FROM outcomes WHERE draw_outcome = 'partial'),
    'unsuccessful', (SELECT count(*) FROM outcomes WHERE draw_outcome = 'unsuccessful'),
    'first_stick_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
        ELSE round(100.0 * count(*) FILTER (WHERE draw_outcome = 'success_first_stick') / count(*), 1) END FROM outcomes),
    'overall_success_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
        ELSE round(100.0 * count(*) FILTER (WHERE draw_outcome IN ('success_first_stick','success_after_second_stick')) / count(*), 1) END FROM outcomes),
    'draw_time_n', (SELECT count(*) FROM timed),
    'draw_time_median_min', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)::numeric, 1) FROM timed),
    'draw_time_p90_min', (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes)::numeric, 1) FROM timed),
    'lab_bound_closed', (SELECT count(*) FROM lab_closed),
    'delivered_count', (SELECT count(*) FROM lab_closed WHERE delivered),
    'delivery_coverage', (SELECT CASE WHEN count(*) = 0 THEN NULL
        ELSE round(100.0 * count(*) FILTER (WHERE delivered) / count(*), 1) END FROM lab_closed),
    'samples_lost', (SELECT count(*) FROM lab_closed WHERE NOT delivered),
    'overrides', (SELECT count(*) FROM lab_closed WHERE overridden),
    'delivery_pending', (SELECT n FROM pending),
    'redraws', (SELECT count(*) FROM w WHERE original_appointment_id IS NOT NULL),
    'redraws_completed', (SELECT count(*) FROM w WHERE original_appointment_id IS NOT NULL AND status IN ('specimen_delivered','completed')),
    'advertisable', (SELECT count(*) >= 200 FROM outcomes)
  );
$$;
REVOKE ALL ON FUNCTION public.get_quality_metrics() FROM public;
GRANT EXECUTE ON FUNCTION public.get_quality_metrics() TO authenticated;

-- 7d. Public counts — no PHI, counts only. Safe for the marketing site.
CREATE OR REPLACE FUNCTION public.get_public_quality_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH w AS (
    SELECT a.id, a.service_type, a.status, a.draw_outcome
    FROM public.appointments a
    WHERE public.appointment_day(a.appointment_date) >= public.quality_metrics_since()
      AND a.status IN ('specimen_delivered', 'completed')
  )
  SELECT jsonb_build_object(
    'since', public.quality_metrics_since(),
    'collections', (SELECT count(*) FROM w WHERE draw_outcome IS DISTINCT FROM 'unsuccessful'),
    'delivered', (SELECT count(*) FROM w
                   WHERE public.is_lab_bound_service(service_type)
                     AND EXISTS (SELECT 1 FROM public.specimen_deliveries d WHERE d.appointment_id = w.id)),
    'outcomes_recorded', (SELECT count(*) FROM w WHERE draw_outcome IS NOT NULL)
  );
$$;
REVOKE ALL ON FUNCTION public.get_public_quality_counts() FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_quality_counts() TO anon, authenticated;

-- 7e. Free redraw. Copies the patient + address, $0 waived, links back via
--     original_appointment_id. booking_source = 'redraw' so
--     trg_on_manual_appointment_notify_patient does NOT message the patient;
--     the office confirms date/time with them by hand.
CREATE OR REPLACE FUNCTION public.create_free_redraw(
  p_original_id uuid,
  p_appointment_date date DEFAULT NULL,
  p_appointment_time time DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.appointments%ROWTYPE;
  v_role text := (SELECT public.jwt_role());
  v_new_id uuid;
  v_date date;
BEGIN
  SELECT * INTO o FROM public.appointments WHERE id = p_original_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original appointment not found'; END IF;
  IF NOT (v_role IN ('super_admin', 'admin', 'owner') OR (v_role = 'phlebotomist' AND o.phlebotomist_id = auth.uid())) THEN
    RAISE EXCEPTION 'Not allowed to schedule a redraw for this visit' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF o.draw_outcome IS DISTINCT FROM 'unsuccessful' THEN
    RAISE EXCEPTION 'A free redraw can only be scheduled for an unsuccessful draw';
  END IF;
  -- One redraw per original.
  SELECT id INTO v_new_id FROM public.appointments
   WHERE original_appointment_id = p_original_id AND status <> 'cancelled' LIMIT 1;
  IF v_new_id IS NOT NULL THEN RETURN v_new_id; END IF;

  v_date := coalesce(p_appointment_date, (now() AT TIME ZONE 'America/New_York')::date + 1);

  INSERT INTO public.appointments (
    patient_id, patient_name, patient_email, patient_phone, patient_dob,
    address, zipcode, gate_code,
    service_type, service_name, duration_minutes,
    appointment_date, appointment_time,
    status, booking_source,
    total_amount, service_price, surcharge_amount, tip_amount,
    invoice_status, payment_status,
    phlebotomist_id, organization_id, billed_to, lab_destination, lab_request_id,
    fasting_required, is_vip, tenant_id,
    original_appointment_id, notes
  ) VALUES (
    o.patient_id, o.patient_name, o.patient_email, o.patient_phone, o.patient_dob,
    o.address, o.zipcode, o.gate_code,
    o.service_type, o.service_name, o.duration_minutes,
    (v_date::text || 'T00:00:00Z')::timestamptz, coalesce(p_appointment_time, o.appointment_time),
    'scheduled', 'redraw',
    0, 0, 0, 0,
    'not_required', 'completed',
    o.phlebotomist_id, o.organization_id, o.billed_to, o.lab_destination, NULL,
    o.fasting_required, o.is_vip, o.tenant_id,
    o.id,
    concat_ws(' | ', 'FREE REDRAW of ' || o.id::text || ' (' || coalesce(o.draw_failure_reason, 'unsuccessful') || ')', nullif(o.draw_note, ''), nullif(o.notes, ''))
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_free_redraw(uuid, date, time) FROM public;
GRANT EXECUTE ON FUNCTION public.create_free_redraw(uuid, date, time) TO authenticated;

COMMENT ON FUNCTION public.create_free_redraw(uuid, date, time) IS
  'Creates a $0 scheduled redraw linked via original_appointment_id. Assigned phleb or admin only; original must have draw_outcome = unsuccessful. No patient messaging.';
