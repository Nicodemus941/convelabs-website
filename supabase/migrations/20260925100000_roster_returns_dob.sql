-- Give the roster the one field that made it useless.
--
-- A provider with 145 patients on her roster reported she could not add a lab
-- slip to a patient already in her system -- she had to "recreate the patient
-- entirely". She was not wrong. Picking from the roster fills the name, email
-- and phone, and then step one refuses to advance: it requires a date of
-- birth, because the patient is asked to verify it to unlock their booking
-- link. The roster never returned one, so it could not be filled, so every
-- lab slip meant finding and re-typing the DOB of somebody the practice
-- already had on file.
--
-- The data was there the whole time: 126 of her 127 roster rows have a date
-- of birth. Only the query was not asking for it.
--
-- DROP then CREATE rather than CREATE OR REPLACE: the return type changes,
-- and Postgres will not replace a function's signature in place.
DROP FUNCTION IF EXISTS public.get_org_linked_patients();

CREATE FUNCTION public.get_org_linked_patients()
 RETURNS TABLE(patient_name text, patient_email text, patient_phone text, patient_dob date,
               visit_count bigint, last_visit_date timestamp with time zone, last_service text,
               last_lab_order_file_path text, pending_request_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := (auth.jwt()->'user_metadata'->>'organization_id')::uuid;
  IF v_org_id IS NULL THEN
    v_org_id := (auth.jwt()->'app_metadata'->>'organization_id')::uuid;
  END IF;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH from_appts AS (
    SELECT DISTINCT a.id, a.patient_name, a.patient_email, a.patient_phone, a.patient_dob,
           a.appointment_date, a.service_name, a.service_type, a.lab_order_file_path
    FROM appointments a
    LEFT JOIN appointment_organizations ao ON ao.appointment_id = a.id
    WHERE (a.organization_id = v_org_id OR ao.organization_id = v_org_id)
      AND a.status <> 'cancelled'
      AND a.patient_name IS NOT NULL
  ),
  appt_agg AS (
    SELECT
      patient_name,
      MIN(patient_email) AS patient_email,
      MIN(patient_phone) AS patient_phone,
      -- The most recent one we were actually given, not the most recent row:
      -- a later booking that skipped the DOB must not erase an earlier one.
      (ARRAY_AGG(patient_dob ORDER BY appointment_date DESC) FILTER (WHERE patient_dob IS NOT NULL))[1] AS patient_dob,
      COUNT(*) AS visit_count,
      MAX(appointment_date) AS last_visit_date,
      (ARRAY_AGG(COALESCE(service_name, service_type) ORDER BY appointment_date DESC))[1] AS last_service,
      (ARRAY_AGG(lab_order_file_path ORDER BY appointment_date DESC) FILTER (WHERE lab_order_file_path IS NOT NULL))[1] AS last_lab_order_file_path
    FROM from_appts
    GROUP BY patient_name
  ),
  from_roster AS (
    SELECT
      TRIM(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')) AS patient_name,
      tp.email AS patient_email,
      tp.phone AS patient_phone,
      tp.date_of_birth AS patient_dob,
      0::bigint AS visit_count,
      tp.created_at AS last_visit_date,
      NULL::text AS last_service,
      NULL::text AS last_lab_order_file_path
    FROM tenant_patients tp
    WHERE tp.organization_id = v_org_id
      AND tp.deleted_at IS NULL
      AND COALESCE(tp.is_active, true) = true
      AND TRIM(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')) <> ''
  ),
  combined AS (
    SELECT * FROM appt_agg
    UNION ALL
    SELECT r.* FROM from_roster r
    WHERE NOT EXISTS (
      SELECT 1 FROM appt_agg ag
      WHERE LOWER(TRIM(ag.patient_name)) = LOWER(TRIM(r.patient_name))
    )
  )
  SELECT
    c.patient_name,
    c.patient_email,
    c.patient_phone,
    c.patient_dob,
    c.visit_count,
    c.last_visit_date,
    c.last_service,
    c.last_lab_order_file_path,
    (SELECT count(*) FROM patient_lab_requests plr
       WHERE plr.organization_id = v_org_id
         AND lower(plr.patient_name) = lower(c.patient_name)
         AND plr.status IN ('pending_verification','pending_dob','pending_schedule','needs_followup')
    ) AS pending_request_count
  FROM combined c
  ORDER BY c.last_visit_date DESC NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_org_linked_patients() TO authenticated;
