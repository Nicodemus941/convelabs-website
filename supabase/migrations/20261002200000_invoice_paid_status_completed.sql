-- Invoice reminder bug: card payments are recorded as payment_status='completed'
-- (177 of 230 invoiced rows), but trg_clear_invoice_status_when_paid only
-- recognised 'paid' / 'succeeded'. Paid invoices therefore kept
-- invoice_status 'sent' / 'reminded' / 'final_warning' (19 rows, $2,290 on
-- 2026-10-02) and showed as outstanding.
--
-- process-invoice-reminders already excludes payment_status 'completed', so
-- these rows were not being re-reminded by our cron; this fixes the status
-- at the source and clears the backlog.
--
-- Safety (verified 2026-10-02): every UPDATE trigger on appointments that can
-- make an outbound call is column-scoped (status, payment_status,
-- delivered_at, lab_order_file_path) or keyed on phlebotomist/status/date
-- changes; the payout reconcile trigger is scoped to amount/status/phleb/
-- service/tip/family. Changing invoice_status alone fires none of them —
-- no SMS, email, push or payout rows.

CREATE OR REPLACE FUNCTION public.clear_invoice_status_when_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only act when payment_status JUST moved to a paid state.
  -- 'completed' is what card checkout writes; it was missing here.
  IF NEW.payment_status IN ('paid', 'succeeded', 'completed')
     AND (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
     AND NEW.invoice_status IN ('sent', 'reminded', 'final_warning') THEN
    NEW.invoice_status := 'paid';
  END IF;
  RETURN NEW;
END;
$function$;

-- Backlog: rows already paid by card but still showing an open invoice.
UPDATE public.appointments
   SET invoice_status = 'paid'
 WHERE payment_status IN ('paid', 'succeeded', 'completed')
   AND invoice_status IN ('sent', 'reminded', 'final_warning');
