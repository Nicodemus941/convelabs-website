-- Patch: the v4 audit was excluding `manual_settled` from the "paid" check,
-- producing 23 false-positive `no_payout_row` flags (out-of-band settlements
-- from the 5/19 reconciliation). Result: nightly cron would have ordered a
-- $1,810 double-pay if backfilled blindly.
--
-- Fix: any row that isn't 'reversed' counts as paid. Status set is now:
--   succeeded | transferred | manual_owed | manual_settled | pending  → counts
--   reversed                                                          → excluded

CREATE OR REPLACE FUNCTION public.audit_phleb_payouts_v4(p_days integer DEFAULT 30)
RETURNS TABLE(
  appointment_id uuid,
  patient_name text,
  appointment_date date,
  service_type text,
  total_paid numeric,
  expected_take numeric,
  actual_payout numeric,
  delta numeric,
  rule_used text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH appts AS (
    SELECT a.id, a.patient_name, a.appointment_date::date AS appointment_date, a.service_type,
           a.total_amount::numeric AS total_paid,
           (compute_phleb_take_v2(a.id)).take_cents::numeric / 100 AS expected_take,
           (compute_phleb_take_v2(a.id)).rule_used AS rule_used
    FROM appointments a
    WHERE a.payment_status = 'completed'
      AND a.phlebotomist_id IS NOT NULL
      AND a.payment_arrangement IS NULL
      AND a.appointment_date >= (CURRENT_DATE - p_days)
      AND COALESCE(lower(a.companion_role), 'primary') IN ('primary', '')
  ),
  paid AS (
    SELECT appointment_id, SUM(amount_cents)::numeric / 100 AS paid_total
    FROM staff_payouts
    WHERE status IN ('succeeded', 'transferred', 'manual_owed', 'manual_settled', 'pending')
    GROUP BY appointment_id
  )
  SELECT a.id, a.patient_name, a.appointment_date, a.service_type,
         a.total_paid, a.expected_take, COALESCE(p.paid_total, 0),
         (COALESCE(p.paid_total, 0) - a.expected_take) AS delta,
         a.rule_used,
         CASE
           WHEN a.rule_used = 'fee_waived_no_phleb_pay' AND COALESCE(p.paid_total, 0) = 0 THEN 'fee_waived_ok'
           WHEN COALESCE(p.paid_total, 0) = 0 AND a.expected_take > 0 THEN 'no_payout_row'
           WHEN ABS(a.expected_take - COALESCE(p.paid_total, 0)) < 1 THEN 'match'
           WHEN COALESCE(p.paid_total, 0) > a.expected_take THEN 'overpaid'
           ELSE 'underpaid'
         END AS status
  FROM appts a LEFT JOIN paid p ON p.appointment_id = a.id
  ORDER BY ABS(COALESCE(p.paid_total, 0) - a.expected_take) DESC, a.appointment_date DESC;
$function$;
