-- 2026-05-08 — Insurance expiry pulse: column + cron schedules.

ALTER TABLE public.patient_insurances
  ADD COLUMN IF NOT EXISTS expiry_pulse_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_pulse_response text CHECK (expiry_pulse_response IN ('confirmed','update_requested','no_response')),
  ADD COLUMN IF NOT EXISTS expiry_pulse_responded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_patient_insurances_pulse_due
  ON public.patient_insurances (expiry_pulse_sent_at NULLS FIRST, verified_at NULLS FIRST)
  WHERE is_active;

-- Daily pulse — 14:00 UTC (10am ET / 9am CT)
SELECT cron.schedule(
  'insurance-expiry-pulse-daily',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/insurance-expiry-pulse',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('limit', 50)
  );
  $$
);

-- Annual blast — Dec 28 with force=true to nudge even freshly-verified
-- patients before Jan 1 plan renewal
SELECT cron.schedule(
  'insurance-expiry-pulse-annual-dec28',
  '0 14 28 12 *',
  $$
  SELECT net.http_post(
    url := 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/insurance-expiry-pulse',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('force', true, 'limit', 200)
  );
  $$
);
