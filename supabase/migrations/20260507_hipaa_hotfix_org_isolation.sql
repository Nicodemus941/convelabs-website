-- HIPAA HOTFIX 2026-05-07 — three-pass org isolation lockdown
--
-- INCIDENT
--   Lara Kiessling at Littleton Concierge Medicine reported being able to
--   see patients NOT belonging to Littleton in her provider-portal patient
--   list. Investigation showed two stacked bugs:
--
--   1) appointment_organizations cc-link breadcrumbs were being treated as
--      a permission grant by the patient-list RPCs. The OCR auto-discovery
--      flow (`discover_or_link_provider_org`) inserts a cc-link row every
--      time a lab order's practice extraction matches an existing org —
--      meant as outreach breadcrumb, NOT as data visibility.
--
--   2) Even with cc-links removed, RLS on `appointments` and
--      `tenant_patients` had wide-open policies ("Authenticated users can
--      view appointments" USING true; "Allow authenticated read"). Any
--      authenticated user could SELECT every row directly.
--
--   Concrete leaks found: Dean Faracchio (Diabetes & Endocrine Center
--   patient) and Charles Cook (no primary org) were both visible to
--   Littleton via cc-links. 10 cross-org cc-links existed system-wide.
--
-- THIS MIGRATION
--
-- Pass 1 — RPC fix:
--   - get_org_linked_patients          → drop cc-link OR clause + add caller-role guard
--   - get_org_roi(p_org_id)            → same pattern + caller-org guard
--   - get_patients_for_org_admin(...)  → same pattern + caller-org guard
--                                         (also closed param-injection: office_manager
--                                          could pass any p_org_id)
--
-- Pass 2 — RLS lockdown:
--   - DROP "Authenticated users can view appointments" (USING true)
--   - DROP "Allow authenticated read" on tenant_patients
--   - ADD org-scoped SELECT policies for office_manager / provider keyed
--     to JWT user_metadata.organization_id
--   - ADD platform-admin SELECT policies for super_admin / admin / owner
--   - ADD "patient_reads_own_row" so patients can still see their own
--     tenant_patients record (matched by user_id OR auth email)
--   - ADD org-scoped SELECT on patient_lab_requests for office_manager / provider
--
-- Pass 3 — Acknowledged remaining risk:
--   - "Anyone can check availability" on appointments still allows anon
--     SELECT (used by the booking-flow slot picker). This exposes
--     patient_name/email/phone to anon role. NOT closed in this migration
--     because the fix requires replacing the policy with a stripped view
--     exposing only date/time/status. Tracked separately. Org-staff
--     cross-org leakage — the stated incident — is fully closed.

-- ─── Pass 1: get_org_linked_patients ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_org_linked_patients()
RETURNS TABLE(patient_name text, patient_email text, patient_phone text,
              visit_count bigint, last_visit_date timestamp with time zone,
              last_service text, last_lab_order_file_path text,
              pending_request_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE v_org_id uuid; v_caller_role text;
BEGIN
  v_caller_role := lower(COALESCE(auth.jwt()->'user_metadata'->>'role',''));
  IF v_caller_role NOT IN ('office_manager','provider') THEN RETURN; END IF;
  v_org_id := (auth.jwt()->'user_metadata'->>'organization_id')::uuid;
  IF v_org_id IS NULL THEN v_org_id := (auth.jwt()->'app_metadata'->>'organization_id')::uuid; END IF;
  IF v_org_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH from_appts AS (
    SELECT DISTINCT a.id, a.patient_name AS pn, a.patient_email AS pe, a.patient_phone AS pp,
           a.appointment_date AS ad, a.service_name AS sn, a.service_type AS st, a.lab_order_file_path AS lop
    FROM appointments a
    WHERE a.organization_id = v_org_id AND a.status <> 'cancelled' AND a.patient_name IS NOT NULL
  ),
  appt_agg AS (
    SELECT fa.pn AS patient_name,
           MIN(fa.pe) AS patient_email, MIN(fa.pp) AS patient_phone,
           COUNT(*) AS visit_count, MAX(fa.ad) AS last_visit_date,
           (ARRAY_AGG(COALESCE(fa.sn, fa.st) ORDER BY fa.ad DESC))[1] AS last_service,
           (ARRAY_AGG(fa.lop ORDER BY fa.ad DESC) FILTER (WHERE fa.lop IS NOT NULL))[1] AS last_lab_order_file_path
    FROM from_appts fa GROUP BY fa.pn
  ),
  from_roster AS (
    SELECT TRIM(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')) AS patient_name,
           tp.email AS patient_email, tp.phone AS patient_phone, 0::bigint AS visit_count,
           tp.created_at AS last_visit_date, NULL::text AS last_service, NULL::text AS last_lab_order_file_path
    FROM tenant_patients tp
    WHERE tp.organization_id = v_org_id AND tp.deleted_at IS NULL
      AND COALESCE(tp.is_active, true) = true
      AND TRIM(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')) <> ''
  ),
  combined AS (
    SELECT * FROM appt_agg
    UNION ALL
    SELECT r.* FROM from_roster r
    WHERE NOT EXISTS (SELECT 1 FROM appt_agg ag WHERE LOWER(TRIM(ag.patient_name)) = LOWER(TRIM(r.patient_name)))
  )
  SELECT c.patient_name, c.patient_email, c.patient_phone, c.visit_count,
         c.last_visit_date, c.last_service, c.last_lab_order_file_path,
         (SELECT count(*) FROM patient_lab_requests plr
            WHERE plr.organization_id = v_org_id
              AND lower(plr.patient_name) = lower(c.patient_name)
              AND plr.status IN ('pending_verification','pending_dob','pending_schedule','needs_followup')
         ) AS pending_request_count
  FROM combined c ORDER BY c.last_visit_date DESC NULLS LAST;
END;
$function$;

-- ─── Pass 1: get_org_roi ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_org_roi(p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_caller_role text; v_caller_org uuid;
BEGIN
  v_caller_role := lower(COALESCE(auth.jwt()->'user_metadata'->>'role',''));
  IF v_caller_role NOT IN ('super_admin','admin','owner') THEN
    v_caller_org := (auth.jwt()->'user_metadata'->>'organization_id')::uuid;
    IF v_caller_role NOT IN ('office_manager','provider') OR v_caller_org IS NULL OR v_caller_org <> p_org_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN (
    WITH linked_appts AS (
      SELECT DISTINCT a.id, a.total_amount, a.payment_status, a.appointment_date, a.status
      FROM appointments a WHERE a.organization_id = p_org_id AND a.status <> 'cancelled'
    )
    SELECT jsonb_build_object(
      'visit_count',          COALESCE(count(*), 0),
      'completed_visits',     COALESCE(sum(CASE WHEN status IN ('completed','specimen_delivered') THEN 1 ELSE 0 END), 0),
      'total_revenue_cents',  COALESCE(sum(CASE WHEN payment_status = 'completed' THEN total_amount ELSE 0 END) * 100, 0)::bigint,
      'outstanding_cents',    COALESCE(sum(CASE WHEN payment_status <> 'completed' THEN total_amount ELSE 0 END) * 100, 0)::bigint,
      'avg_visit_cents',      COALESCE(avg(CASE WHEN payment_status = 'completed' THEN total_amount END) * 100, 0)::bigint,
      'first_visit_date',     min(appointment_date),
      'last_visit_date',      max(appointment_date)
    ) FROM linked_appts
  );
END; $function$;

-- ─── Pass 1: get_patients_for_org_admin ───────────────────────────
CREATE OR REPLACE FUNCTION public.get_patients_for_org_admin(p_org_id uuid)
RETURNS TABLE(patient_name text, patient_email text, patient_phone text,
              visit_count bigint, last_visit_date timestamp with time zone,
              last_service text, last_lab_order_file_path text,
              pending_request_count bigint, specimens_delivered_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE v_caller_role text; v_caller_org uuid;
BEGIN
  v_caller_role := lower(COALESCE(public.get_current_user_role(), ''));
  IF v_caller_role NOT IN ('super_admin','admin','owner') THEN
    v_caller_org := (auth.jwt()->'user_metadata'->>'organization_id')::uuid;
    IF v_caller_role NOT IN ('office_manager','provider') OR v_caller_org IS NULL OR v_caller_org <> p_org_id THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
  WITH linked AS (
    SELECT DISTINCT a.id, a.patient_name AS pn, a.patient_email AS pe, a.patient_phone AS pp,
           a.appointment_date AS ad, a.service_name AS sn, a.service_type AS st,
           a.lab_order_file_path AS lop, a.specimens_delivered_at AS sd
    FROM appointments a
    WHERE a.organization_id = p_org_id AND a.status <> 'cancelled' AND a.patient_name IS NOT NULL
  ),
  aggregated AS (
    SELECT l.pn AS patient_name, MIN(l.pe) AS patient_email, MIN(l.pp) AS patient_phone,
           COUNT(*)::bigint AS visit_count, MAX(l.ad) AS last_visit_date,
           (ARRAY_AGG(COALESCE(l.sn, l.st) ORDER BY l.ad DESC))[1] AS last_service,
           (ARRAY_AGG(l.lop ORDER BY l.ad DESC) FILTER (WHERE l.lop IS NOT NULL))[1] AS last_lab_order_file_path,
           COUNT(*) FILTER (WHERE l.sd IS NOT NULL)::bigint AS specimens_delivered_count
    FROM linked l GROUP BY l.pn
  )
  SELECT ag.patient_name, ag.patient_email, ag.patient_phone, ag.visit_count,
         ag.last_visit_date, ag.last_service, ag.last_lab_order_file_path,
         (SELECT count(*)::bigint FROM patient_lab_requests plr
            WHERE plr.organization_id = p_org_id
              AND lower(plr.patient_name) = lower(ag.patient_name)
              AND plr.status IN ('pending_verification','pending_dob','pending_schedule','needs_followup')
         ) AS pending_request_count,
         ag.specimens_delivered_count
  FROM aggregated ag ORDER BY ag.last_visit_date DESC;
END; $function$;

-- ─── Pass 2: RLS lockdown ─────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.tenant_patients;

CREATE POLICY "org_staff_see_only_their_org_appointments"
ON public.appointments FOR SELECT TO authenticated
USING (
  organization_id IS NOT NULL
  AND organization_id::text = (auth.jwt()->'user_metadata'->>'organization_id')
  AND lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('office_manager','provider')
);

CREATE POLICY "platform_admin_read_all_appointments"
ON public.appointments FOR SELECT TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));

CREATE POLICY "patient_reads_own_row"
ON public.tenant_patients FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (auth.jwt()->>'email' IS NOT NULL AND lower(email) = lower(auth.jwt()->>'email'))
);

CREATE POLICY "org_staff_see_only_their_org_patients"
ON public.tenant_patients FOR SELECT TO authenticated
USING (
  organization_id IS NOT NULL
  AND organization_id::text = (auth.jwt()->'user_metadata'->>'organization_id')
  AND lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('office_manager','provider')
);

CREATE POLICY "platform_admin_read_all_patients"
ON public.tenant_patients FOR SELECT TO authenticated
USING (lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner'));

CREATE POLICY "org_staff_see_only_their_org_lab_requests"
ON public.patient_lab_requests FOR SELECT TO authenticated
USING (
  organization_id IS NOT NULL
  AND organization_id::text = (auth.jwt()->'user_metadata'->>'organization_id')
  AND lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('office_manager','provider')
);
