-- Bug surfaced 2026-05-21 (the Lauren Van Pelt case): the phleb dashboard
-- showed "Tomorrow · 3 visits · ~$105" when the actual day was 4 visits
-- and phleb take should have been $233. Root cause: compute_phleb_take_v2
-- treated any non-null companion_role as a companion (returning $0), but
-- the primary row of a bundle has companion_role='primary'. So the BUNDLE
-- PRIMARY was being zeroed out and the entire bundle's pay invisible.
--
-- Plus: this function was still using the older v2 floor logic (against
-- a synthesized market_rate). Migrated to the same v3 unified floor logic
-- from compute_phleb_take_v2_inline so both code paths agree.
--
-- This RPC powers: DaySummaryBanner, phleb_take_for_appointment_cents,
-- audit_recent_payouts_match_v2, HormoziDashboard projections.

CREATE OR REPLACE FUNCTION public.compute_phleb_take_v2(p_appointment_id uuid)
RETURNS TABLE(
  take_cents integer,
  rule_used text,
  total_charged_cents bigint,
  business_keep_cents integer,
  companion_addon_cents integer,
  tip_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service text;
  v_total_charged_cents bigint;
  v_tip_cents integer;
  v_surcharge_cents integer;
  v_phleb_user_id uuid;
  v_staff_id uuid;
  v_base_cents integer;
  v_companion_cents integer;
  v_min_take_cents integer;
  v_take_cents integer;
  v_rule text;
  v_business_floor_cents constant integer := 8700;
  v_floor_threshold_cents constant integer := 15000;
  v_family_group_id uuid;
  v_companion_role text;
BEGIN
  SELECT a.service_type,
         ROUND(COALESCE(a.total_amount, a.service_price, 0) * 100)::bigint,
         COALESCE(ROUND(a.tip_amount * 100)::integer, 0),
         COALESCE(ROUND(a.surcharge_amount * 100)::integer, 0),
         a.phlebotomist_id,
         a.family_group_id,
         a.companion_role
    INTO v_service, v_total_charged_cents, v_tip_cents, v_surcharge_cents,
         v_phleb_user_id, v_family_group_id, v_companion_role
  FROM appointments a WHERE a.id = p_appointment_id;

  IF v_phleb_user_id IS NULL THEN
    RETURN QUERY SELECT 0, 'no_phleb_assigned'::text, 0::bigint, 0, 0, 0; RETURN;
  END IF;

  SELECT sp.id INTO v_staff_id FROM staff_profiles sp WHERE sp.user_id = v_phleb_user_id LIMIT 1;
  IF v_staff_id IS NULL THEN
    RETURN QUERY SELECT 0, 'no_staff_profile'::text, v_total_charged_cents, 0, 0, v_tip_cents; RETURN;
  END IF;

  -- Treat as companion only when role is set AND not the primary marker
  IF v_companion_role IS NOT NULL AND lower(v_companion_role) NOT IN ('primary', '') THEN
    RETURN QUERY SELECT 0, 'companion_billed_via_primary'::text, v_total_charged_cents, 0, 0, 0;
    RETURN;
  END IF;

  SELECT r.base_per_visit_cents,
         COALESCE(r.companion_addon_cents, 0),
         COALESCE(r.min_phleb_take_cents, 0)
    INTO v_base_cents, v_companion_cents, v_min_take_cents
  FROM phleb_pay_rates r
  WHERE r.staff_id = v_staff_id AND r.service_type = v_service
    AND (r.effective_to IS NULL OR r.effective_to > now())
  ORDER BY r.effective_from DESC LIMIT 1;

  v_base_cents := COALESCE(v_base_cents, 0);

  IF v_total_charged_cents >= v_floor_threshold_cents THEN
    v_take_cents := GREATEST(
      v_base_cents,
      GREATEST(0, v_total_charged_cents - v_business_floor_cents)::integer
    );
    v_take_cents := v_take_cents + v_tip_cents + v_surcharge_cents;
    v_take_cents := GREATEST(v_take_cents, v_min_take_cents);
    v_rule := 'business_floor_87_v3';
    RETURN QUERY SELECT v_take_cents, v_rule, v_total_charged_cents,
                        GREATEST(0, v_total_charged_cents::integer - v_take_cents),
                        0, v_tip_cents;
    RETURN;
  END IF;

  v_take_cents := v_base_cents + v_tip_cents + v_surcharge_cents;
  v_take_cents := GREATEST(v_take_cents, v_min_take_cents);
  v_rule := 'base_rate_under_150';
  RETURN QUERY SELECT v_take_cents, v_rule, v_total_charged_cents,
                      GREATEST(0, v_total_charged_cents::integer - v_take_cents),
                      0, v_tip_cents;
END;
$$;
