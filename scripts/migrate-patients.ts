/**
 * Patient Migration Script
 *
 * Migrates patients from GHS CSV export into Supabase Auth + user_profiles.
 * Run with: npx tsx scripts/migrate-patients.ts
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Generate a random password (patients will reset via magic link)
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let result = '';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function parseAddress(addressJson: string): any {
  try {
    return JSON.parse(addressJson);
  } catch {
    return {};
  }
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const parts = trimmed.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

async function migratePatients() {
  console.log('Reading CSV...');
  const csvPath = process.env.CSV_PATH || 'C:\\Users\\nicod\\Downloads\\convelabs_patients.csv';
  const csvContent = readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true });

  console.log(`Found ${records.length} patients to migrate`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of records) {
    const email = record.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      console.log(`  SKIP: Invalid email for ${record.full_name}`);
      skipped++;
      continue;
    }

    const { firstName, lastName } = parseName(record.full_name || '');
    const address = parseAddress(record.address || '{}');

    try {
      // Try to create — duplicates will error and be skipped
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: generateTempPassword(),
        email_confirm: false, // Don't auto-confirm — they need to verify
        user_metadata: {
          firstName,
          lastName,
          full_name: record.full_name?.trim() || '',
          role: 'patient',
          origin_source: 'ghs_migration',
          needs_password_reset: true,
        },
      });

      if (authError) {
        if (authError.message?.includes('already been registered') || authError.message?.includes('duplicate')) {
          console.log(`  SKIP: ${email} already registered`);
          skipped++;
          continue;
        }
        throw authError;
      }

      const userId = authData.user?.id;
      if (!userId) throw new Error('No user ID returned');

      // Create user profile
      const profileData: any = {
        id: userId,
        full_name: record.full_name?.trim() || '',
        phone: record.phone?.trim() || null,
        date_of_birth: record.date_of_birth || null,
        address_street: address.street || null,
        address_city: address.city || null,
        address_state: address.state || 'FL',
        address_zipcode: address.zip || address.zipCode || null,
      };

      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert(profileData);

      if (profileError) {
        console.warn(`  WARN: Profile insert failed for ${email}: ${profileError.message}`);
      }

      console.log(`  OK: ${email} (${record.full_name?.trim()})`);
      created++;

    } catch (err: any) {
      console.error(`  ERROR: ${email} — ${err.message}`);
      errors++;
    }

    // Rate limit: small delay between requests
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n--- Migration Complete ---');
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${records.length}`);
}

migratePatients().catch(console.error);
