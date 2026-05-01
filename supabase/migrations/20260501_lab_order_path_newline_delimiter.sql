-- Switch the lab_order_file_path join delimiter from comma → newline.
-- Filenames CAN contain commas (Mary Rienzi 5/1/2026: "Rienzi, Mary Ellen.pdf",
-- "Rienzi,P.pdf") which broke the comma-joined column on every reader that
-- did .split(','). Filenames CANNOT contain newlines on Windows/macOS/Linux
-- through any browser file picker or HTTP upload, so newline is collision-
-- free. Readers split on newline first, fall back to comma for legacy rows.

CREATE OR REPLACE FUNCTION public.sync_appointment_lab_order_file_path()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_appt_id uuid;
  v_paths text;
BEGIN
  v_appt_id := COALESCE(NEW.appointment_id, OLD.appointment_id);
  IF v_appt_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT string_agg(file_path, E'\n' ORDER BY uploaded_at)
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

-- Backfill / re-broadcast — applies the new newline delimiter to every
-- appointment that currently has appointment_lab_orders rows.
WITH agg AS (
  SELECT appointment_id, string_agg(file_path, E'\n' ORDER BY uploaded_at) AS paths
  FROM appointment_lab_orders
  WHERE deleted_at IS NULL AND file_path IS NOT NULL
  GROUP BY appointment_id
)
UPDATE appointments a
   SET lab_order_file_path = agg.paths,
       updated_at = now()
  FROM agg
 WHERE a.id = agg.appointment_id;
