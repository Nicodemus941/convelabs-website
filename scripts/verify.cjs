const { Client } = require('pg');
const client = new Client({
  host: 'aws-0-us-east-2.pooler.supabase.com', port: 5432, database: 'postgres',
  user: 'postgres.yluyonhrxxtyuiyrdixl', password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  const b = await client.query(`SELECT to_regclass('public.visit_bundles') AS t`);
  console.log('visit_bundles table:', b.rows[0].t || 'MISSING');
  const c = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='org_invoices' AND column_name IN ('dunning_stage','last_dunning_at','dunning_paused') ORDER BY column_name`);
  console.log('org_invoices dunning cols:', c.rows.map(r => r.column_name).join(', '));
  const j = await client.query(`SELECT jobname, schedule, active FROM cron.job WHERE jobname='org-invoice-dunning-daily'`);
  console.log('cron job:', j.rows[0] || 'MISSING');
  await client.end();
})();
