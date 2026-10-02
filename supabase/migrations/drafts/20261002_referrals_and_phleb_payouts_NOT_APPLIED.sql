-- ============================================================================
-- DRAFT — NOT APPLIED. Review with the owner, then apply with
--   npx supabase db push   (or the Supabase MCP apply_migration)
-- Branch: fix/referrals-and-phleb-payouts, 2026-10-02.
--
-- Two workflows, verified against live data on 2026-10-02:
--
--  A) REFERRAL CREDIT ($25 / $25)
--     - referral_credits has no expiry column; code enforces 12 months via
--       created_at. This adds expires_at so the rule is visible in the DB.
--     - A friend could redeem referral codes on every booking (and the same
--       booking could be credited twice on a webhook replay). Partial unique
--       indexes make both impossible at the storage layer.
--
--  B) PHLEB PAYOUTS
--     - staff_payouts_status_check does NOT include 'tracking_only', so
--       trg_record_phleb_earnings_tracking has failed on EVERY insert since
--       the kill switch went on (zero tracking_only rows exist). That is why
--       appointment 426aeace ($1 comp + $0.15 tip at /pay) has no earnings
--       row and the tip is not tracked anywhere.
--     - auto_reconcile_phleb_payout_v2 skips payment_arrangement='comp'
--       entirely, so a tip on a comp visit (100% pass-through by rule) is
--       never owed. Comp now owes tip + surcharge only, with no $1 floor.
--     - rollback_phleb_payout_on_cancel only fires on status='cancelled'.
--       8 voided-invoice appointments ($866.41) and 5 unpaid ones ($266.00)
--       sat in manual_owed; the sweep function now gates on
--       v_sweep_eligibility, and this trigger reverses them at the source.
-- ============================================================================

BEGIN;

-- ─── A1. referral_credits.expires_at (12 months from earn date) ────────────
ALTER TABLE public.referral_credits
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE public.referral_credits
   SET expires_at = created_at + interval '1 year'
 WHERE expires_at IS NULL;
ALTER TABLE public.referral_credits
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '1 year');
COMMENT ON COLUMN public.referral_credits.expires_at IS
  'Credit is redeemable until this instant. create-appointment-checkout and CheckoutStep also enforce created_at >= now() - 1 year.';

-- ─── A2. One referral discount per friend, one redemption per booking ──────
-- Case-insensitive on email; NULL emails are not constrained.
CREATE UNIQUE INDEX IF NOT EXISTS referral_redemptions_one_per_friend
  ON public.referral_redemptions (lower(referred_email))
  WHERE referred_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS referral_redemptions_one_per_appointment
  ON public.referral_redemptions (appointment_id)
  WHERE appointment_id IS NOT NULL;
-- One credit per (code, friend's booking) — a webhook replay cannot double-credit.
CREATE UNIQUE INDEX IF NOT EXISTS referral_credits_one_per_referred_booking
  ON public.referral_credits (referral_code_id, appointment_id)
  WHERE type = 'referral_earned' AND appointment_id IS NOT NULL;

-- Lookups by owner on either identity key (tenant_patients.id OR auth uid).
CREATE INDEX IF NOT EXISTS referral_credits_user_open
  ON public.referral_credits (user_id) WHERE redeemed = false;

-- ─── B1. Allow the kill-switch tracking status ─────────────────────────────
ALTER TABLE public.staff_payouts DROP CONSTRAINT IF EXISTS staff_payouts_status_check;
ALTER TABLE public.staff_payouts ADD CONSTRAINT staff_payouts_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'succeeded'::text, 'reversed'::text, 'failed'::text,
    'manual_owed'::text, 'manual_settled'::text, 'partial_clawback'::text,
    'tracking_only'::text
  ]));

-- ─── B2. compute_phleb_take_v2: comp visits owe tip + surcharge only ───────
-- Identical to the live v5 body except for the payment_arrangement branch.
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
  v_arrangement text;
  v_bundle_size integer := 1;
BEGIN
  SELECT a.service_type,
         ROUND(COALESCE(a.total_amount, a.service_price, 0) * 100)::bigint,
         COALESCE(ROUND(a.tip_amount * 100)::integer, 0),
         COALESCE(ROUND(a.surcharge_amount * 100)::integer, 0),
         a.phlebotomist_id, a.family_group_id, a.companion_role, a.payment_arrangement
    INTO v_service, v_total_charged_cents, v_tip_cents, v_surcharge_cents,
         v_phleb_user_id, v_family_group_id, v_companion_role, v_arrangement
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

  -- NEW: a comped visit pays the phleb nothing for the draw, but a tip the
  -- patient adds (e.g. at /pay) and any surcharge still pass through 100%.
  IF v_arrangement = 'comp' THEN
    RETURN QUERY SELECT COALESCE(v_tip_cents, 0) + COALESCE(v_surcharge_cents, 0),
                        'comp_tip_passthrough'::text,
                        v_total_charged_cents, 0, 0, v_tip_cents;
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

-- ─── B3. auto_reconcile_phleb_payout_v2: comp tips are owed ────────────────
CREATE OR REPLACE FUNCTION public.auto_reconcile_phleb_payout_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_take_cents integer;
  v_already_paid_cents integer;
  v_delta_cents integer;
  v_staff_id uuid;
  v_stripe_acct text;
  v_service_type text;
  v_is_comp boolean;
BEGIN
  IF NEW.phlebotomist_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('completed','confirmed','scheduled') THEN RETURN NEW; END IF;
  IF LOWER(COALESCE(NEW.patient_name,'')) LIKE '%block time%' THEN RETURN NEW; END IF;
  -- Prepaid arrangements are settled elsewhere. Comp visits continue: the
  -- draw is free but compute_phleb_take_v2 returns the tip/surcharge
  -- pass-through for them.
  IF NEW.payment_arrangement IN ('standing_order_prepaid','bundle_prepaid') THEN RETURN NEW; END IF;
  v_is_comp := (NEW.payment_arrangement = 'comp');

  SELECT take_cents INTO v_take_cents FROM compute_phleb_take_v2(NEW.id) LIMIT 1;
  IF v_take_cents IS NULL OR v_take_cents <= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_already_paid_cents
  FROM staff_payouts WHERE appointment_id = NEW.id AND status IN ('succeeded','manual_owed');

  v_delta_cents := v_take_cents - v_already_paid_cents;
  -- Normal visits keep the $1 noise floor; a comp tip is owed in full even
  -- when it is small.
  IF v_delta_cents <= 0 THEN RETURN NEW; END IF;
  IF NOT v_is_comp AND v_delta_cents < 100 THEN RETURN NEW; END IF;

  SELECT sp.id, sp.stripe_connect_account_id INTO v_staff_id, v_stripe_acct
  FROM staff_profiles sp WHERE sp.user_id = NEW.phlebotomist_id LIMIT 1;
  IF v_staff_id IS NULL THEN RETURN NEW; END IF;

  v_service_type := COALESCE(NEW.service_type, 'mobile');
  INSERT INTO staff_payouts (
    staff_id, appointment_id, stripe_destination_account_id,
    service_type, base_per_visit_cents, companion_addon_cents, tip_cents,
    amount_cents, status, notes, created_at
  ) VALUES (
    v_staff_id, NEW.id, v_stripe_acct,
    v_service_type,
    CASE WHEN v_is_comp THEN 0 ELSE v_delta_cents END,
    0,
    CASE WHEN v_is_comp THEN v_delta_cents ELSE 0 END,
    v_delta_cents, 'manual_owed',
    CASE WHEN v_is_comp THEN 'v2 auto-reconcile: comp visit tip/surcharge pass-through'
         ELSE 'v2 auto-reconcile: business floor $87 rule' END,
    now()
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ─── B4. Tracking trigger: leave comp/prepaid to auto_reconcile ────────────
-- Same body as live, plus the arrangement skip (so a comp tip is one
-- manual_owed row, not a tracking_only row AND a manual_owed row).
CREATE OR REPLACE FUNCTION public.trg_record_phleb_earnings_tracking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_disabled boolean;
  v_existing_id uuid;
  v_staff_id uuid;
  v_take_cents integer := 0;
  v_tip_cents integer := 0;
  v_take RECORD;
  v_should_fire boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should_fire := COALESCE(NEW.payment_status, '') = 'completed';
  ELSIF TG_OP = 'UPDATE' THEN
    v_should_fire := (NEW.payment_status IS DISTINCT FROM OLD.payment_status)
                  AND COALESCE(NEW.payment_status, '') = 'completed';
  END IF;
  IF NOT v_should_fire THEN RETURN NEW; END IF;
  IF NEW.phlebotomist_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.payment_arrangement IN ('standing_order_prepaid','bundle_prepaid','comp') THEN RETURN NEW; END IF;

  BEGIN
    SELECT (value::text = 'true' OR value::text = '"true"') INTO v_disabled
    FROM public.system_settings WHERE key = 'phleb_connect_payouts_disabled' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_disabled := false;
  END;
  IF NOT COALESCE(v_disabled, false) THEN RETURN NEW; END IF;

  SELECT id INTO v_existing_id FROM staff_payouts WHERE appointment_id = NEW.id LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_staff_id FROM staff_profiles WHERE user_id = NEW.phlebotomist_id LIMIT 1;
  IF v_staff_id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    SELECT * INTO v_take FROM compute_phleb_take_v2(NEW.id);
    v_take_cents := COALESCE(v_take.take_cents, 0);
    v_tip_cents := COALESCE(v_take.tip_cents, 0);
  EXCEPTION WHEN OTHERS THEN
    v_take_cents := 0;
    v_tip_cents := 0;
  END;

  BEGIN
    INSERT INTO staff_payouts (
      staff_id, appointment_id, service_type,
      amount_cents, tip_cents, base_per_visit_cents, companion_addon_cents,
      status, payout_mode, notes
    ) VALUES (
      v_staff_id, NEW.id, NEW.service_type,
      v_take_cents, v_tip_cents, 0, 0,
      'tracking_only', 'tracking_only',
      'kill-switch 2026-05-25: business retains 100%, phleb sees tracked earnings only'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_record_phleb_earnings_tracking insert failed for appt %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- ─── B5. Reverse owed rows when the invoice is voided / refunded ───────────
CREATE OR REPLACE FUNCTION public.rollback_phleb_payout_on_void()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_voided_total integer := 0;
  v_voided_count integer := 0;
BEGIN
  IF NEW.payment_status IN ('voided','refunded')
     AND COALESCE(OLD.payment_status,'') NOT IN ('voided','refunded') THEN
    SELECT COALESCE(SUM(amount_cents), 0), COUNT(*)
      INTO v_voided_total, v_voided_count
    FROM staff_payouts
    WHERE appointment_id = NEW.id AND status = 'manual_owed' AND amount_cents > 0;

    IF v_voided_count > 0 THEN
      UPDATE staff_payouts
         SET status = 'reversed',
             reversed_at = now(),
             reversed_reason = 'payment_status → ' || NEW.payment_status,
             notes = COALESCE(notes, '') || ' | reversed ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
                     || ' UTC: invoice ' || NEW.payment_status
       WHERE appointment_id = NEW.id AND status = 'manual_owed' AND amount_cents > 0;

      BEGIN
        INSERT INTO activity_log (activity_type, description, status, patient_name)
        VALUES ('payout_voided',
                'Invoice ' || NEW.payment_status || ' — reversed $' || (v_voided_total::numeric / 100)::text ||
                  ' across ' || v_voided_count || ' phleb payout row(s)',
                'completed', NEW.patient_name);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rollback_phleb_payout_on_void ON public.appointments;
CREATE TRIGGER trg_rollback_phleb_payout_on_void
  AFTER UPDATE OF payment_status ON public.appointments
  FOR EACH ROW
  WHEN (NEW.payment_status IN ('voided','refunded') AND COALESCE(OLD.payment_status,'') NOT IN ('voided','refunded'))
  EXECUTE FUNCTION public.rollback_phleb_payout_on_void();

COMMIT;

-- ============================================================================
-- ONE-OFF DATA FIXES — run by the owner AFTER review, each in its own txn.
-- (Not part of the schema migration; listed here so they are not lost.)
-- ============================================================================

-- D1. Reverse the manual_owed rows that belong to already-voided invoices
--     (8 rows / $866.41 on 2026-10-02: Sadrameli, H. Ritenour, Pattillo,
--     Stone, Nanton, Johnson-Sapp, Parker, J. Bryan 25edb2b2).
-- UPDATE staff_payouts sp SET status='reversed', reversed_at=now(),
--        reversed_reason='backfill: invoice voided before 2026-10-02 trigger'
--   FROM appointments a
--  WHERE a.id = sp.appointment_id AND sp.status='manual_owed' AND sp.amount_cents > 0
--    AND a.payment_status IN ('voided','refunded');

-- D2. Un-double the /pay tip stamp (PR #68 stamped tip_cents on BOTH delta
--     rows; the ledger over-reports $85 of tips across 8 visits). Keep the
--     stamp on the row whose amount IS the tip, clear it on the other.
-- UPDATE staff_payouts s SET tip_cents = 0
--  WHERE s.tip_cents > 0 AND s.amount_cents <> s.tip_cents
--    AND EXISTS (SELECT 1 FROM staff_payouts t
--                 WHERE t.appointment_id = s.appointment_id AND t.id <> s.id
--                   AND t.tip_cents = s.tip_cents AND t.amount_cents = t.tip_cents);

-- D3. Test appointment 426aeace-8c6b-424e-aad8-e69c01fac7fd ($0.15 tip on a
--     comp visit): after B2/B3 are applied, a no-op update re-fires the
--     trigger and books the 15c as manual_owed (owner may prefer to leave
--     the test visit alone and delete it instead).
-- UPDATE appointments SET tip_amount = tip_amount WHERE id = '426aeace-8c6b-424e-aad8-e69c01fac7fd';
