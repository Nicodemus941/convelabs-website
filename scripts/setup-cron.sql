-- Daily dunning sweep at 14:00 UTC (≈9am ET, 10am EDT)
-- pg_cron + pg_net must be enabled on the project.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with this name
SELECT cron.unschedule('org-invoice-dunning-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'org-invoice-dunning-daily');

-- Schedule the daily sweep
SELECT cron.schedule(
  'org-invoice-dunning-daily',
  '0 14 * * *',
  $$
    SELECT net.http_post(
      url := 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/process-org-invoice-dunning',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
