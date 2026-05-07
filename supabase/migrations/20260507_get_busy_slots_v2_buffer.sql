-- get_busy_slots v2 — anon-safe slot-availability RPC for booking flow
--
-- The HIPAA lockdown (14c86b7) dropped "Anyone can check availability"
-- which the slot picker on /book-now used. Replaced with this RPC that
-- returns slot info WITHOUT exposing PHI (address, zipcode,
-- family_group_id, patient_name, etc.).
--
-- Mirrors the buffer math from src/lib/bookingBuffer.ts so the client
-- doesn't need PHI fields to compute slot blocking — the RPC pre-computes
-- buffer_minutes server-side and returns it.

DROP FUNCTION IF EXISTS public.get_busy_slots(date);

CREATE FUNCTION public.get_busy_slots(p_date date)
RETURNS TABLE (
  appointment_time time,
  duration_minutes int,
  buffer_minutes int,
  service_type text,
  status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  BUFFER_HEAVY_SERVICE constant int := 30;
  BUFFER_EXTENDED_AREA constant int := 30;
  BUFFER_COMPANION     constant int := 15;
  EXTENDED_CITIES text[] := ARRAY[
    'lake nona','celebration','kissimmee','sanford','eustis',
    'clermont','montverde','deltona','geneva','tavares',
    'mount dora','leesburg','groveland','mascotte','minneola',
    'daytona beach','deland','debary','orange city'
  ];
  HEAVY_SERVICES text[] := ARRAY[
    'specialty-kit','specialty-kit-genova','therapeutic','partner-aristotle-education'
  ];
BEGIN
  RETURN QUERY
  SELECT
    a.appointment_time,
    COALESCE(a.duration_minutes, 30)::int,
    (
      CASE WHEN lower(COALESCE(a.service_type, '')) = ANY (HEAVY_SERVICES) THEN BUFFER_HEAVY_SERVICE ELSE 0 END
      +
      CASE WHEN
        array_length(string_to_array(lower(COALESCE(a.address, '')), ','), 1) >= 2
        AND btrim(split_part(lower(COALESCE(a.address, '')), ',', 2)) = ANY (EXTENDED_CITIES)
      THEN BUFFER_EXTENDED_AREA ELSE 0 END
      +
      CASE WHEN a.family_group_id IS NOT NULL THEN BUFFER_COMPANION ELSE 0 END
    )::int,
    a.service_type::text,
    a.status::text
  FROM appointments a
  WHERE a.appointment_date::date = p_date
    AND a.status NOT IN ('cancelled', 'no_show')
    AND a.appointment_time IS NOT NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_busy_slots(date) TO anon, authenticated;
