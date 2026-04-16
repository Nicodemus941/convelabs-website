-- No-show tracking for appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show boolean DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show_fee numeric(10,2) DEFAULT 0;

-- Index for finding no-show patterns per patient
CREATE INDEX IF NOT EXISTS idx_appointments_no_show ON appointments (patient_email, no_show) WHERE no_show = true;
