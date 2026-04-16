-- Track when the final warning was sent (separate from the gentle reminder)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS invoice_final_warning_at timestamptz;

-- Update index to include appointment_date for proximity-based escalation tiers
DROP INDEX IF EXISTS idx_appointments_invoice_pending;
CREATE INDEX idx_appointments_invoice_pending
  ON appointments (invoice_status, is_vip, invoice_sent_at, appointment_date)
  WHERE invoice_status IN ('sent', 'reminded', 'final_warning')
    AND status != 'cancelled';
