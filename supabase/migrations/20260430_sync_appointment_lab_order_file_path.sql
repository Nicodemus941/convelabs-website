-- Visibility-bug fix: staff lab-order uploads write to appointment_lab_orders
-- (the normalized, multi-file, OCR-aware table) but the calendar, phleb
-- dashboard, phleb-app, today-execution view, and ~16 other surfaces still
-- read appointments.lab_order_file_path (legacy comma-joined column). This
-- trigger keeps the legacy column live as a comma-joined list of active
-- (deleted_at IS NULL) file_paths for the appointment so every existing
-- reader works without code changes.

CREATE OR REPLACE FUNCTION public.sync_appointment_lab_order_file_path()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt_id uuid;
  v_paths text;
BEGIN
  v_appt_id := COALESCE(NEW.appointment_id, OLD.appointment_id);
  IF v_appt_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT string_agg(file_path, ',' ORDER BY uploaded_at)
    INTO v_paths
  FROM appointment_lab_orders
  WHERE appointment_id = v_appt_id
    AND deleted_at IS NULL
    AND file_path IS NOT NULL;

  UPDATE appointments
     SET lab_order_file_path = NULLIF(v_paths, ''),
         updated_at = now()
   WHERE id = v_appt_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lab_order_path_iud ON public.appointment_lab_orders;
CREATE TRIGGER trg_sync_lab_order_path_iud
AFTER INSERT OR UPDATE OF file_path, deleted_at OR DELETE
ON public.appointment_lab_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_appointment_lab_order_file_path();

-- Backfill: recompute lab_order_file_path for every appointment that has
-- normalized rows. Non-destructive — only rewrites rows where the join
-- yields content. (Appointments with file_path already set but no normalized
-- rows are left alone — those came from the legacy upload paths.)
WITH agg AS (
  SELECT appointment_id, string_agg(file_path, ',' ORDER BY uploaded_at) AS paths
  FROM appointment_lab_orders
  WHERE deleted_at IS NULL AND file_path IS NOT NULL
  GROUP BY appointment_id
)
UPDATE appointments a
   SET lab_order_file_path = agg.paths,
       updated_at = now()
  FROM agg
 WHERE a.id = agg.appointment_id
   AND COALESCE(a.lab_order_file_path, '') <> agg.paths;
