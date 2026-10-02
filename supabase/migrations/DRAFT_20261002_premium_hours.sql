-- DRAFT — NOT APPLIED. Premium-hours fee (owner-approved model, 2026-10-02).
--
-- Apply AFTER review, BEFORE deploying stripe-webhook / verify-appointment-
-- checkout / create-appointment-checkout (they write appointments.premium_fee).
--
-- Owner decision: the $10 premium-hours fee is BUSINESS revenue, not phleb pay.
--   • stored on its own column, never folded into surcharge_amount (which
--     compute_phleb_take_v2 passes through 100% to the phleb);
--   • compute_phleb_take_v2 subtracts it from total_amount before the 40%
--     split, so neither the pct rule nor the base-rate rule sees it;
--   • compute_phleb_take_v2_inline (called at checkout time with `amount`,
--     which already excludes the fee) needs no change.
--
-- Precedence of the live timing fees (never stacked):
--   same-day $100  >  after-hours $50  >  premium hours $10

BEGIN;

-- ─── 1. Column ─────────────────────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS premium_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.appointments.premium_fee IS
  'Premium-hours fee (dollars) charged on this visit: weekday 5-7 AM / 1-3 PM or a weekend slot released inside 24 h. $10 non-members, $0 paid members. Business revenue — excluded from the phleb split (compute_phleb_take_v2). Included in total_amount.';

-- ─── 2. compute_phleb_take_v2: exclude premium_fee from the split ───────────
-- Identical to the live body (verified via pg_get_functiondef on 2026-10-02)
-- except: premium_fee is read and subtracted from v_total_charged_cents up
-- front, so total_charged_cents / business_keep_cents reported downstream
-- still describe the visit the phleb worked, and the fee stays with the business.
CREATE OR REPLACE FUNCTION public.compute_phleb_take_v2(p_appointment_id uuid)
 RETURNS TABLE(take_cents integer, rule_used text, total_charged_cents bigint, business_keep_cents integer, companion_addon_cents integer, tip_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_service text;
  v_total_charged_cents bigint;
  v_service_cents bigint;
  v_tip_cents integer;
  v_surcharge_cents integer;
  v_premium_fee_cents integer;
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
         COALESCE(ROUND(a.premium_fee * 100)::integer, 0),
         a.phlebotomist_id, a.family_group_id, a.companion_role
    INTO v_service, v_total_charged_cents, v_tip_cents, v_surcharge_cents,
         v_premium_fee_cents,
         v_phleb_user_id, v_family_group_id, v_companion_role
  FROM appointments a WHERE a.id = p_appointment_id;

  -- Premium-hours fee is business revenue: take it off the top before any
  -- phleb math. It is NOT a surcharge (those pass through 100% to the phleb).
  v_total_charged_cents := GREATEST(0, v_total_charged_cents - COALESCE(v_premium_fee_cents, 0));

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

  -- Service amount = grand total minus the pass-through items (tip + surcharge),
  -- which are added back 100% below. This is the base for the 40% split.
  v_service_cents := GREATEST(0, v_total_charged_cents - v_tip_cents - v_surcharge_cents);

  IF v_service_cents >= v_floor_threshold_cents THEN
    v_pct_take_cents := ROUND(v_service_cents::numeric * v_phleb_pct)::integer;
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
$function$;

-- NOTE: supabase/migrations/drafts/20261002_referrals_and_phleb_payouts_NOT_APPLIED.sql
-- redefines this same function with a `payment_arrangement = 'comp'` branch.
-- If that draft is applied FIRST, re-run this file afterwards (it is the
-- newer body minus the comp branch); if this file is applied first, merge
-- the premium_fee subtraction into that draft before applying it.

-- ─── 3. Service catalog copy ────────────────────────────────────────────────
-- Live description reads "Requires 8-12 hours fasting, available any time
-- during operating hours" — fasting starts now end at noon.
UPDATE public.services_enhanced
   SET description = 'Requires 8-12 hours of fasting. Any start before noon (5 AM – noon Mon–Fri; 6 – 11 AM weekends). Members skip the early-morning premium fee.'
 WHERE service_code = 'fasting-blood-draw';

-- ─── 4. Cron note (no change) ───────────────────────────────────────────────
-- pg_cron jobid 44 ("0 21 * * *" → unlock-tomorrow-slots) stays as is. The
-- function now only stamps slot_unlocks + notifies the waitlist when
-- tomorrow is Sat/Sun; weekdays return skipped. The 24 h release itself is
-- evaluated live by _shared/bookingWindows.ts, not by this cron.

COMMIT;

-- ─── Verification (read-only, run after apply) ─────────────────────────────
-- 1. Column present:
--    select column_name, column_default from information_schema.columns
--     where table_name='appointments' and column_name='premium_fee';
-- 2. Fee excluded from the phleb split — pick a recent paid mobile visit,
--    compare before/after by simulating a $10 fee:
--    with a as (select id from appointments where payment_status='completed'
--               and phlebotomist_id is not null and service_type='mobile'
--               order by created_at desc limit 1)
--    select (select take_cents from compute_phleb_take_v2(a.id)) as take_now from a;
--    -- then in a transaction: update appointments set total_amount = total_amount + 10,
--    --   premium_fee = 10 where id = <that id>; select take_cents again; ROLLBACK.
--    -- take_cents must be unchanged.
