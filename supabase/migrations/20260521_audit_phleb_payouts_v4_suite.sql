-- v4 phleb-payout reconciliation suite. Three layers:
--   1. audit_phleb_payouts_v4(p_days) — detail rows per appointment
--   2. audit_phleb_payouts_v4_summary(p_days) — single-row aggregate
--   3. audit_phleb_payouts_v4_digest(p_days) — JSONB digest for SMS/dashboard
--
-- Initial version: status set = (succeeded, manual_owed, pending).
-- See follow-up migration 20260521_audit_v4_recognize_manual_settled.sql for
-- the manual_settled fix that landed minutes later when 23 false-positive
-- `no_payout_row` flags were discovered.
--
-- All three read compute_phleb_take_v2 as ground truth (which itself now uses v4).

CREATE OR REPLACE FUNCTION public.audit_phleb_payouts_v4_summary(p_days integer DEFAULT 30)
RETURNS TABLE(
  appointments_audited integer,
  match_count integer,
  fee_waived_ok_count integer,
  overpaid_count integer,
  overpaid_total numeric,
  underpaid_count integer,
  underpaid_total numeric,
  no_payout_count integer,
  no_payout_total numeric,
  net_business_drift numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH rows AS (SELECT * FROM audit_phleb_payouts_v4(p_days))
  SELECT
    COUNT(*)::integer,
    SUM(CASE WHEN status='match' THEN 1 ELSE 0 END)::integer,
    SUM(CASE WHEN status='fee_waived_ok' THEN 1 ELSE 0 END)::integer,
    SUM(CASE WHEN status='overpaid' THEN 1 ELSE 0 END)::integer,
    COALESCE(SUM(CASE WHEN status='overpaid' THEN delta ELSE 0 END), 0),
    SUM(CASE WHEN status='underpaid' THEN 1 ELSE 0 END)::integer,
    COALESCE(SUM(CASE WHEN status='underpaid' THEN -delta ELSE 0 END), 0),
    SUM(CASE WHEN status='no_payout_row' THEN 1 ELSE 0 END)::integer,
    COALESCE(SUM(CASE WHEN status='no_payout_row' THEN expected_take ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status IN ('overpaid','underpaid') THEN delta ELSE 0 END), 0)
  FROM rows;
$function$;

CREATE OR REPLACE FUNCTION public.audit_phleb_payouts_v4_digest(p_days integer DEFAULT 1)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'window_days', p_days,
    'generated_at', now(),
    'summary', (SELECT row_to_json(s) FROM audit_phleb_payouts_v4_summary(p_days) s),
    'worst_offenders', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT appointment_id, patient_name, appointment_date, service_type,
               total_paid, expected_take, actual_payout, delta, status
        FROM audit_phleb_payouts_v4(p_days)
        WHERE status IN ('overpaid','underpaid','no_payout_row')
        ORDER BY ABS(delta) DESC NULLS LAST
        LIMIT 10
      ) r
    )
  );
$function$;
