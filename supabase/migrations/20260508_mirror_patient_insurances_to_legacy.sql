-- 2026-05-08 — Hormozi single-source-of-truth: every write to
-- patient_insurances (the new canonical store) auto-mirrors the active
-- primary row's fields back to tenant_patients legacy columns
-- (insurance_provider / insurance_member_id / insurance_group_number /
-- insurance_card_path).
--
-- Why: surfaces still read the legacy fields. Without the mirror, an
-- admin uploads via the new path and chart-old surfaces stay stale —
-- exactly what happened to Charles Cook (provider+member_id landed in
-- patient_insurances but tenant_patients.insurance_provider stayed null
-- until manual backfill).

CREATE OR REPLACE FUNCTION public.mirror_patient_insurances_to_legacy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_target_pid uuid;
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.rank = 'primary' AND NEW.is_active THEN
    v_target_pid := NEW.patient_id;
  ELSIF TG_OP = 'DELETE' AND OLD.rank = 'primary' THEN
    v_target_pid := OLD.patient_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.rank = 'primary' AND (OLD.is_active <> NEW.is_active) THEN
    v_target_pid := COALESCE(NEW.patient_id, OLD.patient_id);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.tenant_patients tp SET
    insurance_provider     = COALESCE(pi.provider, tp.insurance_provider),
    insurance_member_id    = COALESCE(pi.member_id, tp.insurance_member_id),
    insurance_group_number = COALESCE(pi.group_number, tp.insurance_group_number),
    insurance_card_path    = COALESCE(pi.card_front_path, tp.insurance_card_path),
    updated_at = now()
  FROM (
    SELECT provider, member_id, group_number, card_front_path
    FROM public.patient_insurances
    WHERE patient_id = v_target_pid AND rank = 'primary' AND is_active
    ORDER BY updated_at DESC
    LIMIT 1
  ) pi
  WHERE tp.id = v_target_pid;

  UPDATE public.appointments a SET
    insurance_card_path = COALESCE(a.insurance_card_path, pi.card_front_path),
    updated_at = now()
  FROM (
    SELECT card_front_path
    FROM public.patient_insurances
    WHERE patient_id = v_target_pid AND rank = 'primary' AND is_active
    LIMIT 1
  ) pi
  WHERE a.patient_id = v_target_pid
    AND a.insurance_card_path IS NULL
    AND a.appointment_date >= (now() - interval '7 days');

  RETURN COALESCE(NEW, OLD);
END$$;

DROP TRIGGER IF EXISTS trg_mirror_patient_insurances_to_legacy ON public.patient_insurances;
CREATE TRIGGER trg_mirror_patient_insurances_to_legacy
AFTER INSERT OR UPDATE OR DELETE ON public.patient_insurances
FOR EACH ROW EXECUTE FUNCTION public.mirror_patient_insurances_to_legacy();
