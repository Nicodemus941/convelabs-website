-- Make tenant_patients org-aware so providers can build their roster BEFORE
-- the first appointment (today the org-linked patient list is appointment-derived
-- only, leaving newly-registered orgs with an empty roster they can't grow).

ALTER TABLE public.tenant_patients
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_patients_org
  ON public.tenant_patients(organization_id) WHERE organization_id IS NOT NULL AND deleted_at IS NULL;

-- Backfill: link existing tenant_patients to the org of their most recent
-- non-cancelled appointment (best-effort, non-destructive — only fills NULLs).
WITH best_org AS (
  SELECT DISTINCT ON (LOWER(TRIM(a.patient_name)))
    LOWER(TRIM(a.patient_name)) AS norm_name,
    a.patient_email,
    a.patient_phone,
    a.organization_id
  FROM appointments a
  WHERE a.organization_id IS NOT NULL
    AND a.status <> 'cancelled'
    AND a.patient_name IS NOT NULL
  ORDER BY LOWER(TRIM(a.patient_name)), a.appointment_date DESC NULLS LAST
)
UPDATE public.tenant_patients tp
SET organization_id = b.organization_id
FROM best_org b
WHERE tp.organization_id IS NULL
  AND LOWER(TRIM(tp.first_name || ' ' || tp.last_name)) = b.norm_name
  AND COALESCE(tp.email, '') = COALESCE(b.patient_email, COALESCE(tp.email, ''));

-- Replace get_org_linked_patients to union appointment-derived patients with
-- tenant_patients rows that the provider added directly to their roster.
CREATE OR REPLACE FUNCTION public.get_org_linked_patients()
 RETURNS TABLE(patient_name text, patient_email text, patient_phone text, visit_count bigint, last_visit_date timestamp with time zone, last_service text, last_lab_order_file_path text, pending_request_count bigint)
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
    SELECT DISTINCT a.id, a.patient_name, a.patient_email, a.patient_phone,
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
      COUNT(*) AS visit_count,
      MAX(appointment_date) AS last_visit_date,
      (ARRAY_AGG(COALESCE(service_name, service_type) ORDER BY appointment_date DESC))[1] AS last_service,
      (ARRAY_AGG(lab_order_file_path ORDER BY appointment_date DESC) FILTER (WHERE lab_order_file_path IS NOT NULL))[1] AS last_lab_order_file_path
    FROM from_appts
    GROUP BY patient_name
  ),
  -- Roster-only patients: added via AddPatientModal but no appointments yet.
  -- We exclude any whose name matches an appt_agg row to avoid duplicates.
  from_roster AS (
    SELECT
      TRIM(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')) AS patient_name,
      tp.email AS patient_email,
      tp.phone AS patient_phone,
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
