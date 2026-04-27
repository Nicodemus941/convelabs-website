-- get_phleb_served_patients — patient roster for the Phleb PWA "Patients" tab.
-- Hardens the auth gate so:
--   • phlebotomist  → sees patients they personally served
--   • super_admin   → sees ALL patients across all phlebs (this is the
--                      ConveLabs owner/admin role per CLAUDE.md memory)
--   • office_manager / staff → sees ALL (legacy admin-equivalent path)
--
-- Returns one row per unique patient_name + (best-effort) latest visit
-- metadata so the directory list can render.
--
-- Apply via:  supabase db push   (or paste into SQL editor)

CREATE OR REPLACE FUNCTION public.get_phleb_served_patients()
RETURNS TABLE (
  patient_name text,
  email text,
  phone text,
  last_visit_at timestamptz,
  total_visits int,
  organization_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_is_admin boolean;
BEGIN
  v_uid := auth.uid();

  -- Read role from JWT user_metadata first, then fall back to staff_profiles
  v_role := coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    (SELECT sp.role FROM public.staff_profiles sp WHERE sp.user_id = v_uid LIMIT 1)
  );

  v_is_admin := v_role IN ('super_admin', 'office_manager', 'admin', 'staff');

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_is_admin THEN
    -- Admins see everything
    RETURN QUERY
    SELECT
      a.patient_name,
      max(a.email)              AS email,
      max(a.phone)              AS phone,
      max(a.appointment_date::timestamptz) AS last_visit_at,
      count(*)::int             AS total_visits,
      (array_agg(a.organization_id) FILTER (WHERE a.organization_id IS NOT NULL))[1] AS organization_id
    FROM public.appointments a
    WHERE a.patient_name IS NOT NULL
      AND a.status IN ('completed', 'specimen_delivered', 'in_progress', 'arrived', 'en_route', 'confirmed', 'scheduled')
    GROUP BY a.patient_name
    ORDER BY max(a.appointment_date::timestamptz) DESC NULLS LAST
    LIMIT 2000;
  ELSIF v_role = 'phlebotomist' THEN
    -- Phlebs see only patients they served (assigned_phlebotomist_id matches)
    RETURN QUERY
    SELECT
      a.patient_name,
      max(a.email)              AS email,
      max(a.phone)              AS phone,
      max(a.appointment_date::timestamptz) AS last_visit_at,
      count(*)::int             AS total_visits,
      (array_agg(a.organization_id) FILTER (WHERE a.organization_id IS NOT NULL))[1] AS organization_id
    FROM public.appointments a
    WHERE a.patient_name IS NOT NULL
      AND a.assigned_phlebotomist_id = v_uid
      AND a.status IN ('completed', 'specimen_delivered', 'in_progress', 'arrived', 'en_route', 'confirmed', 'scheduled')
    GROUP BY a.patient_name
    ORDER BY max(a.appointment_date::timestamptz) DESC NULLS LAST
    LIMIT 2000;
  ELSE
    -- Unknown role: return empty (don't leak existence info)
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_phleb_served_patients() TO authenticated, service_role;
