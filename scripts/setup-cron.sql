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

-- Weekly org-billing gap audit — Mondays 13:00 UTC (~9am ET).
-- Texts the owner when org-billed visits are uninvoiced OR invoices were
-- created but never sent (the Elite Medical Concierge gap). See
-- supabase/functions/audit-org-invoices.
SELECT cron.unschedule('org-invoice-gap-audit-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'org-invoice-gap-audit-weekly');

SELECT cron.schedule(
  'org-invoice-gap-audit-weekly',
  '0 13 * * 1',
  $$
    SELECT net.http_post(
      url := 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/audit-org-invoices',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
