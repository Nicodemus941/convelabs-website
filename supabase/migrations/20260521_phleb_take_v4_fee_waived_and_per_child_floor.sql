-- v4 phleb-comp rules — closes two leaks identified in 14-day reconciliation 2026-05-21:
--
-- Leak #1: fee-waived visits ($0 total) still paid the phleb their base rate.
--   Bleeding ~$574/mo. Policy: $0 total → $0 phleb take. If the visit needs
--   to be comped to the phleb anyway (training, make-good), it should be a
--   manual_owed staff_payouts row, not an automatic base-rate payout.
--
-- Leak #2: family/companion bundles applied the $87 business floor only ONCE
--   regardless of body count. A 2-patient bundle billed at $375 left business
--   with $87 and phleb with $288. Policy: business floor scales by bundle
--   size — N bodies = $87 × N to business. Bleeding ~$1,128/mo.
--
-- v4.0 changes:
--   • compute_phleb_take_v2_inline: new p_bundle_size param (default 1).
--     Floor multiplied by bundle_size. Fee-waived ($0 total) short-circuits to $0.
--   • compute_phleb_take_v2 (wrapper): auto-counts family_group_id siblings
--     and passes bundle_size through. Fee-waived short-circuit.
--
-- Examples under v4 (verified math):
--   mobile $150 solo         → phleb $63  business $87   (unchanged)
--   mobile $225 solo         → phleb $138 business $87   (unchanged)
--   family $375 / 2 bodies   → phleb $201 business $174  (was $288/$87)
--   family $375 / 3 bodies   → phleb $114 business $261  (was $288/$87)
--   family $375 / 4 bodies   → phleb $27  business $348  (was $288/$87)
--   doctors office $55       → phleb $30  business $25   (under $150, base — unchanged)
--   fee_waived $0            → phleb $0   business $0    (NEW — was $30 phleb leak)
--
-- Owner can override the per-child rule by manually overpaying a staff_payouts
-- row if a specific bundle deserves more (e.g. extreme distance). The RPC
-- enforces the FLOOR; it does not cap the ceiling.

-- ============================================================
-- 1. INLINE RPC — adds p_bundle_size + fee-waived gate
-- ============================================================
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
  v_rule text;
  v_floor_total_cents integer;
  v_business_floor_cents constant integer := 8700;       -- $87 per body
  v_floor_threshold_cents constant integer := 15000;     -- $150
  v_bundle_size integer := GREATEST(COALESCE(p_bundle_size, 1), 1);
BEGIN
  -- Leak #1 gate: fee-waived visits pay phleb nothing automatically.
  -- Tips/surcharges are still passed through if somehow present.
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
    -- Leak #2 fix: floor scales per body in the bundle.
    v_floor_total_cents := v_business_floor_cents * v_bundle_size;
    v_take_cents := GREATEST(v_base_cents, GREATEST(0, p_total_paid_cents - v_floor_total_cents));
    v_take_cents := v_take_cents + COALESCE(p_tip_cents, 0) + COALESCE(p_surcharge_cents, 0);
    v_take_cents := GREATEST(v_take_cents, v_min_take_cents);
    v_rule := CASE WHEN v_bundle_size > 1
                   THEN 'business_floor_87_per_body_v4'
                   ELSE 'business_floor_87_v3' END;
    RETURN QUERY SELECT v_take_cents, v_rule, GREATEST(0, p_total_paid_cents - v_take_cents);
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

-- ============================================================
-- 2. WRAPPER RPC — auto-counts family bundle size + fee-waived gate
-- ============================================================
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
  v_floor_total_cents integer;
  v_business_floor_cents constant integer := 8700;
  v_floor_threshold_cents constant integer := 15000;
  v_family_group_id uuid;
  v_companion_role text;
  v_bundle_size integer := 1;
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

  -- Companions still resolve via primary (no double-pay)
  IF v_companion_role IS NOT NULL AND lower(v_companion_role) NOT IN ('primary', '') THEN
    RETURN QUERY SELECT 0, 'companion_billed_via_primary'::text, v_total_charged_cents, 0, 0, 0;
    RETURN;
  END IF;

  -- Leak #1: fee-waived primary pays $0 (plus tip pass-through)
  IF v_total_charged_cents = 0 THEN
    RETURN QUERY SELECT COALESCE(v_tip_cents, 0) + COALESCE(v_surcharge_cents, 0),
                        'fee_waived_no_phleb_pay'::text,
                        0::bigint, 0, 0, v_tip_cents;
    RETURN;
  END IF;

  -- Leak #2: count siblings in the bundle to scale the business floor
  IF v_family_group_id IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_bundle_size
    FROM appointments a2
    WHERE a2.family_group_id = v_family_group_id
      AND a2.status NOT IN ('cancelled', 'no_show');
    v_bundle_size := GREATEST(v_bundle_size, 1);
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
    v_floor_total_cents := v_business_floor_cents * v_bundle_size;
    v_take_cents := GREATEST(
      v_base_cents,
      GREATEST(0, v_total_charged_cents - v_floor_total_cents)::integer
    );
    v_take_cents := v_take_cents + v_tip_cents + v_surcharge_cents;
    v_take_cents := GREATEST(v_take_cents, v_min_take_cents);
    v_rule := CASE WHEN v_bundle_size > 1
                   THEN 'business_floor_87_per_body_v4'
                   ELSE 'business_floor_87_v3' END;
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
