-- Update the index to include the new 'final_warning' invoice status
-- used by the 3-stage Hormozi escalation in process-invoice-reminders
DROP INDEX IF EXISTS idx_appointments_invoice_pending;
CREATE INDEX idx_appointments_invoice_pending
  ON appointments (invoice_status, is_vip, invoice_sent_at)
  WHERE invoice_status IN ('sent', 'reminded', 'final_warning')
    AND status != 'cancelled';
