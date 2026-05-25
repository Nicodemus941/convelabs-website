-- v5 take rule: percentage at $150+, base-rate floor under $150.
-- Replaces v4's fixed $87 business floor which caused platform take %
-- to drop as visit price rose. v5 makes platform margin scale with
-- transaction size — industry-standard for healthcare marketplaces.
--
-- Owner approval: 2026-05-25 — explicit choice to capture more platform
-- margin on premium visits (concierge / longevity / family bundles).
--
-- Real production impact over 60-day prior cohort (136 appts):
--   Phleb total:    $9,711.10 → $8,460.70   (delta -$1,250.40)
--   Business total: $8,350.15 → $9,561.55   (delta +$1,211.40)
--   Biggest single swing: Michael Morelli 4/23 $850 visit —
--     phleb $763 → $340, business $87 → $510 (+$423)
--
-- The 1.6% rounding gap between deltas comes from how tip/surcharge
-- pass-through interacts with the percentage split rounding.
--
-- Rule labels for audit trail:
--   business_pct_60_v5             — main case, 40/60 split applied
--   base_rate_under_150            — unchanged from v4 (under-threshold)
--   fee_waived_no_phleb_pay        — unchanged from v4
--   companion_billed_via_primary   — unchanged from v4
--
-- Roll-back path: re-apply 20260521_phleb_take_v4_fee_waived_and_per_child_floor.sql
-- (v4 RPC bodies preserved there atomically).

CREATE OR REPLACE FUNCTION public.compute_phleb_take_v2_inline(
  p_staff_id uuid,
  p_service_type text,
  p_total_paid_cents integer,
  p_surcharge_cents integer DEFAULT 0,
  p_tip_cents integer DEFAULT 0,
  p_has_companion boolean DEFAULT false,
  p_bundle_size integer DEFAULT 1
)
RETURNS TABLE(take_cents integer, rule_used text, business_keep_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base_cents integer;
  v_companion_cents integer;
  v_min_take_cents integer;
  v_take_cents integer;
  v_pct_take_cents integer;
  v_rule text;
  v_floor_threshold_cents constant integer := 15000;
  v_phleb_pct constant numeric := 0.40;
BEGIN
  IF COALESCE(p_total_paid_cents, 0) = 0 THEN
    v_take_cents := COALESCE(p_tip_cents, 0) + COALESCE(p_surcharge_cents, 0);
    RETURN QUERY SELECT v_take_cents, 'fee_waived_no_phleb_pay'::text, 0;
    RETURN;
  END IF;

  SELECT r.base_per_visit_cents,
         COALESCE(r.companion_addon_cents, 0),
         COALESCE(r.min_phleb_take_cents, 0)
    INTO v_base_cents, v_companion_cents, v_min_take_cents
  FROM phleb_pay_rates r
  WHERE r.staff_id = p_staff_id
    AND r.service_type = p_service_type
    AND (r.effective_to IS NULL OR r.effective_to > now())
  ORDER BY r.effective_from DESC
  LIMIT 1;
  v_base_cents := COALESCE(v_base_cents, 0);

  IF p_total_paid_cents >= v_floor_threshold_cents THEN
    v_pct_take_cents := ROUND(p_total_paid_cents::numeric * v_phleb_pct)::integer;
    v_take_cents := GREATEST(v_base_cents, v_pct_take_cents);
    v_take_cents := v_take_cents + COALESCE(p_tip_cents, 0) + COALESCE(p_surcharge_cents, 0);
    v_take_cents := GREATEST(v_take_cents, v_min_take_cents);
    v_rule := 'business_pct_60_v5';
    RETURN QUERY SELECT v_take_cents, v_rule,
                        GREATEST(0, p_total_paid_cents - v_take_cents);
    RETURN;
  END IF;

  v_companion_cents := CASE WHEN p_has_companion THEN v_companion_cents ELSE 0 END;
  v_take_cents := v_base_cents + v_companion_cents + COALESCE(p_tip_cents, 0) + COALESCE(p_surcharge_cents, 0);
  v_take_cents := GREATEST(v_take_cents, v_min_take_cents);
  v_rule := 'base_rate_under_150';
  RETURN QUERY SELECT v_take_cents, v_rule, GREATEST(0, p_total_paid_cents - v_take_cents);
  RETURN;
END;
$function$;

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
  v_min_take_cents integer;
  v_take_cents integer;
  v_pct_take_cents integer;
  v_rule text;
  v_floor_threshold_cents constant integer := 15000;
  v_phleb_pct constant numeric := 0.40;
  v_family_group_id uuid;
  v_companion_role text;
  v_bundle_size integer := 1;
BEGIN
  SELECT a.service_type,
         ROUND(COALESCE(a.total_amount, a.service_price, 0) * 100)::bigint,
         COALESCE(ROUND(a.tip_amount * 100)::integer, 0),
         COALESCE(ROUND(a.surcharge_amount * 100)::integer, 0),
         a.phlebotomist_id, a.family_group_id, a.companion_role
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

  IF v_companion_role IS NOT NULL AND lower(v_companion_role) NOT IN ('primary', '') THEN
    RETURN QUERY SELECT 0, 'companion_billed_via_primary'::text, v_total_charged_cents, 0, 0, 0;
    RETURN;
  END IF;

  IF v_total_charged_cents = 0 THEN
    RETURN QUERY SELECT COALESCE(v_tip_cents, 0) + COALESCE(v_surcharge_cents, 0),
                        'fee_waived_no_phleb_pay'::text,
                        0::bigint, 0, 0, v_tip_cents;
    RETURN;
  END IF;

  IF v_family_group_id IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_bundle_size
    FROM appointments a2
    WHERE a2.family_group_id = v_family_group_id
      AND a2.status NOT IN ('cancelled', 'no_show');
    v_bundle_size := GREATEST(v_bundle_size, 1);
  END IF;

  SELECT r.base_per_visit_cents, COALESCE(r.min_phleb_take_cents, 0)
    INTO v_base_cents, v_min_take_cents
  FROM phleb_pay_rates r
  WHERE r.staff_id = v_staff_id AND r.service_type = v_service
    AND (r.effective_to IS NULL OR r.effective_to > now())
  ORDER BY r.effective_from DESC LIMIT 1;
  v_base_cents := COALESCE(v_base_cents, 0);

  IF v_total_charged_cents >= v_floor_threshold_cents THEN
    v_pct_take_cents := ROUND(v_total_charged_cents::numeric * v_phleb_pct)::integer;
    v_take_cents := GREATEST(v_base_cents, v_pct_take_cents);
    v_take_cents := v_take_cents + v_tip_cents + v_surcharge_cents;
    v_take_cents := GREATEST(v_take_cents, v_min_take_cents);
    v_rule := 'business_pct_60_v5';
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
