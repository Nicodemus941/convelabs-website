-- auto_reconcile_phleb_payout_v2 summed only 'succeeded' and 'manual_owed'
-- payouts as already paid. A payout settled out-of-band ('manual_settled')
-- was invisible to it, so any later status/amount change on that visit
-- inserted a second 'manual_owed' payout for money already paid (e.g. Betsy
-- Babbit's invoice row carries two settled $42 payouts). Same as the "B3"
-- fix in the reviewed payout migration; body otherwise unchanged.
-- SECURITY DEFINER + search_path preserved from the live definition.

CREATE OR REPLACE FUNCTION public.auto_reconcile_phleb_payout_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_take_cents integer;
  v_already_paid_cents integer;
  v_delta_cents integer;
  v_staff_id uuid;
  v_stripe_acct text;
  v_service_type text;
BEGIN
  IF NEW.phlebotomist_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('completed','confirmed','scheduled') THEN RETURN NEW; END IF;
  IF LOWER(COALESCE(NEW.patient_name,'')) LIKE '%block time%' THEN RETURN NEW; END IF;
  IF NEW.payment_arrangement IN ('standing_order_prepaid','bundle_prepaid','comp') THEN RETURN NEW; END IF;

  SELECT take_cents INTO v_take_cents FROM compute_phleb_take_v2(NEW.id) LIMIT 1;
  IF v_take_cents IS NULL OR v_take_cents <= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_already_paid_cents
  FROM staff_payouts WHERE appointment_id = NEW.id AND status IN ('succeeded','manual_owed','manual_settled');

  v_delta_cents := v_take_cents - v_already_paid_cents;
  IF v_delta_cents < 100 THEN RETURN NEW; END IF;

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
    v_service_type, v_delta_cents, 0, 0,
    v_delta_cents, 'manual_owed',
    'v2 auto-reconcile: business floor $87 rule', now()
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;
