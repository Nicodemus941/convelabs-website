// One-shot migration runner — reads the SQL file and runs it directly via the
// Supabase Postgres pooler. Used when `supabase db push` refuses due to history drift.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const FILE = process.argv[2];

if (!PASSWORD || !FILE) {
  console.error('Usage: SUPABASE_DB_PASSWORD=xxx node scripts/apply-migration.js <path-to-sql-file>');
  process.exit(1);
}

const sql = fs.readFileSync(FILE, 'utf8');

const client = new Client({
  host: 'aws-0-us-east-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.yluyonhrxxtyuiyrdixl',
  password: PASSWORD,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    await client.connect();
    console.log('Connected. Running migration...');
    await client.query(sql);
    console.log('✓ Migration applied successfully');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
