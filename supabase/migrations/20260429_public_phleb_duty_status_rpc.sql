-- 2026-04-29 Public-readable phleb-on-duty RPC for patient booking grid
-- Patient slot grid needs to know if any phleb is on duty so it can:
--   1. Show after-hours slots (5:30 PM – 8 PM)
--   2. Relax the 3 PM same-day cutoff
-- But phleb_duty_status RLS blocks anon/patient reads (only phlebs +
-- admins can read it directly). This RPC returns ONLY a boolean +
-- duty_through timestamp — no phleb identity, no PII — so it's safe
-- for anon to call.

CREATE OR REPLACE FUNCTION public.get_any_phleb_on_duty_now()
RETURNS TABLE (on_duty boolean, duty_through timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT
    EXISTS(SELECT 1 FROM phleb_duty_status p
           WHERE p.on_duty = true AND p.duty_through IS NOT NULL
             AND p.duty_through > now()) as on_duty,
    (SELECT max(duty_through) FROM phleb_duty_status
       WHERE on_duty = true AND duty_through > now()) as duty_through;
$$;

GRANT EXECUTE ON FUNCTION public.get_any_phleb_on_duty_now() TO anon, authenticated;
