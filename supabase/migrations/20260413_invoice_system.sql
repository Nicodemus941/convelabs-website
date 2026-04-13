-- Invoice system for manual appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS invoice_status text DEFAULT 'not_required';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS invoice_sent_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS invoice_reminder_sent_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS invoice_due_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_vip boolean DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS stripe_invoice_id text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_source text DEFAULT 'online';

-- Index for invoice processing queries
CREATE INDEX IF NOT EXISTS idx_appointments_invoice_status ON appointments(invoice_status) WHERE invoice_status IN ('sent', 'reminded');
