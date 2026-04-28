-- 2026-04-28
-- 1. Promoted hickmannaquala6@gmail.com (Naquala) to super_admin so she
--    has full operational control: schedule, invoice, staff, services,
--    discounts, account notes.
-- 2. Added is_platform_owner() helper that's TRUE only for the single
--    human who owns the business (currently nicodemmebaptiste@convelabs.com).
--    UI gates "complete business view" surfaces (Hormozi Dashboard,
--    Upgrades & ROI) via this helper so super_admins like Naquala don't
--    see whole-business financials/valuation that are owner-only.
-- 3. Stored owner email in business_metrics for editable-via-SQL
--    ownership transfer (don't have to change RLS policies if owner
--    changes — just update one row).

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role
FROM auth.users WHERE email = 'hickmannaquala6@gmail.com'
ON CONFLICT DO NOTHING;

INSERT INTO public.business_metrics (metric_key, value_text, value_numeric)
SELECT 'platform_owner_email', 'nicodemmebaptiste@convelabs.com', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_metrics WHERE metric_key = 'platform_owner_email'
);

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND lower(u.email) = lower(coalesce(
        (SELECT value_text FROM public.business_metrics WHERE metric_key = 'platform_owner_email'),
        'nicodemmebaptiste@convelabs.com'
      ))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;
COMMENT ON FUNCTION public.is_platform_owner() IS
  'TRUE only for the single human who owns the business. Use for owner-only surfaces (whole-business P&L, valuation reports, legal docs) — distinct from super_admin which is full operational control.';
