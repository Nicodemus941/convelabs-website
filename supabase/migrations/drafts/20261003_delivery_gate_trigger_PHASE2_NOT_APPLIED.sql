-- DRAFT — phase 2 of draw outcome tracking. NOT APPLIED.
-- Apply only after the new phleb flow (feat/draw-outcome-tracking) has been live a few days,
-- so the old TubeLabelModal auto-'specimen_delivered' path is gone. Admin calendar close-out of a
-- lab-bound post-baseline visit without a delivery row will then require admin_override_delivery_gate().

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
