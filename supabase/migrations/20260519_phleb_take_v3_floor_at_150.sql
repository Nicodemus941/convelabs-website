-- v3 phleb-comp rule (owner clarification 2026-05-19):
--   Any service where total_paid_cents >= $150 → $87 floor to business,
--   remainder to phleb. Tip + surcharge pass through 100% on top.
--   Under $150 → per-service base rate (exception path).
--
-- v3.1 patch (same day): in floor mode, companion add-on is NOT added
-- on top because the bundle total ALREADY includes companion pricing.
-- Tip stays on top because Stripe bills it as a separate line item.
--
-- Examples (verified live):
--   mobile $150        → phleb $63  business $87  (floor)
--   mobile $225        → phleb $138 business $87  (Mark Disler — the case that surfaced the bug)
--   mobile $170 + $20  → phleb $103 business $67  (tip pass-through)
--   senior $175        → phleb $88  business $87  (Juanita Sevor — was $42 under v2)
--   senior $100        → phleb $42  business $58  (under $150, base rate)
--   partner-elite $72  → phleb $35  business $37  (under $150, base rate)
--   partner-rest. $135 → phleb $53  business $83  (under $150, base rate)
--   family $375        → phleb $288 business $87  (ONE floor per bundle)
--   therapeutic $200   → phleb $113 business $87  (floor)

CREATE OR REPLACE FUNCTION public.compute_phleb_take_v2_inline(
  p_staff_id uuid,
  p_service_type text,
  p_total_paid_cents integer,
  p_surcharge_cents integer DEFAULT 0,
  p_tip_cents integer DEFAULT 0,
  p_has_companion boolean DEFAULT false
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
  v_business_floor_cents constant integer := 8700;       -- $87
  v_floor_threshold_cents constant integer := 15000;     -- $150
BEGIN
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
    -- $87 to business, remainder to phleb. Companion add-on NOT applied
    -- (bundle total already includes companion). Tip + surcharge on top.
    v_take_cents := GREATEST(v_base_cents, GREATEST(0, p_total_paid_cents - v_business_floor_cents));
    v_take_cents := v_take_cents + COALESCE(p_tip_cents, 0) + COALESCE(p_surcharge_cents, 0);
    v_take_cents := GREATEST(v_take_cents, v_min_take_cents);
    v_rule := 'business_floor_87_v3';
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
