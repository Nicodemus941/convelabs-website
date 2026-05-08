-- 2026-05-08 — schedule storage-health-check every 6 hours via pg_cron.
-- Hormozi: codify the safety net so silent infra rot can't repeat.
-- The Charles Cook bucket-missing incident silently lasted 24+ hours;
-- this catches it within 6.

SELECT cron.schedule(
  'storage-health-check-every-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/storage-health-check',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('alert', true)
  );
  $$
);
