/**
 * Import April 2026 appointments from GHS calendar screenshot.
 * Run with: SUPABASE_SERVICE_ROLE_KEY=xxx npx tsx scripts/import-april-appointments.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const APPOINTMENTS = [
  { date: '2026-04-13', time: '6:30 AM', name: 'Addison Barrios', service: 'At-Home Blood Work 65+' },
  { date: '2026-04-13', time: '8:00 AM', name: 'Nicolas Chaillan', service: 'At-Home Blood Work' },
  { date: '2026-04-13', time: '10:30 AM', name: 'Clinical Associates of Orlando', service: "Dr's In-Office Blood Draw" },
  { date: '2026-04-13', time: '12:00 PM', name: 'Clinical Associates of Orlando', service: "Dr's In-Office Blood Draw" },
  { date: '2026-04-14', time: '6:30 AM', name: 'Debbie Lobban', service: 'Restoration Place Patients Only' },
  { date: '2026-04-14', time: '7:30 AM', name: 'Frank Avilucea', service: 'Elite Medical Patients ONLY' },
  { date: '2026-04-14', time: '9:00 AM', name: 'Dean Faracchio', service: 'At-Home Blood Work' },
  { date: '2026-04-14', time: '10:00 AM', name: 'Todd Morgan', service: 'At-Home Blood Work' },
  { date: '2026-04-14', time: '12:00 PM', name: 'Allen Jones', service: 'Therapeutic Phlebotomy' },
  { date: '2026-04-15', time: '6:00 AM', name: 'Natasha Morgan', service: 'At-Home Blood Work' },
  { date: '2026-04-16', time: '8:00 AM', name: 'Lisa Koppe', service: 'At-Home Blood Work' },
  { date: '2026-04-16', time: '12:00 PM', name: 'Jennifer Stephenson', service: 'At-Home Blood Work' },
  { date: '2026-04-17', time: '7:00 AM', name: 'Blair and Bill Hull', service: 'Elite Medical Patients ONLY' },
  { date: '2026-04-17', time: '9:00 AM', name: 'Lawrence Carpenter', service: 'At-Home Blood Work' },
  { date: '2026-04-17', time: '11:00 AM', name: 'Lois Edmunds', service: 'At-Home Blood Work 65+' },
  { date: '2026-04-18', time: '8:00 AM', name: 'Joshua Jacobson', service: 'At-Home Blood Work' },
  { date: '2026-04-21', time: '6:00 AM', name: 'Valli & John Ritenour', service: 'At-Home Blood Work 65+' },
  { date: '2026-04-21', time: '8:00 AM', name: 'Catlin Jones', service: 'At-Home Blood Work' },
  { date: '2026-04-24', time: '7:00 AM', name: 'Kaley Jones', service: 'At-Home Blood Work' },
  { date: '2026-04-24', time: '9:00 AM', name: 'Lawrence Carpenter', service: 'At-Home Blood Work' },
  { date: '2026-04-27', time: '8:00 AM', name: 'Diane Oshiro', service: 'At-Home Blood Work' },
  { date: '2026-04-28', time: '8:00 AM', name: 'Ella Forbes', service: 'At-Home Blood Work 65+' },
];

function parseTime(timeStr: string, dateStr: string): string {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function mapServiceType(service: string): string {
  if (service.includes('65+')) return 'senior';
  if (service.includes('In-Office')) return 'in-office';
  if (service.includes('Therapeutic')) return 'therapeutic';
  if (service.includes('Elite Medical') || service.includes('Restoration Place')) return 'mobile';
  return 'mobile';
}

async function importAppointments() {
  console.log(`Importing ${APPOINTMENTS.length} appointments...`);

  let created = 0;
  let errors = 0;

  // Build a name-to-ID lookup from all auth users
  console.log('Building patient lookup...');
  const userMap = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
    if (listErr || !data?.users?.length) break;
    for (const u of data.users) {
      const fullName = u.user_metadata?.full_name || `${u.user_metadata?.firstName || ''} ${u.user_metadata?.lastName || ''}`.trim();
      if (fullName) userMap.set(fullName.toLowerCase(), u.id);
    }
  }
  console.log(`Found ${userMap.size} users in lookup`);

  for (const appt of APPOINTMENTS) {
    const appointmentDate = parseTime(appt.time, appt.date);

    // Try to find patient by name
    let patientId: string | null = null;
    const searchName = appt.name.toLowerCase().trim();
    for (const [name, id] of userMap) {
      if (name.includes(searchName) || searchName.includes(name) || name.split(' ')[1] === searchName.split(' ')[1]) {
        patientId = id;
        break;
      }
    }

    // If still no match, try partial last name match
    if (!patientId) {
      const lastName = appt.name.split(' ').pop()?.toLowerCase() || '';
      for (const [name, id] of userMap) {
        if (name.includes(lastName) && lastName.length > 3) {
          patientId = id;
          break;
        }
      }
    }

    // Use first available user as fallback (owner account)
    if (!patientId) {
      // Find any valid user ID as placeholder
      const firstUser = userMap.values().next().value;
      patientId = firstUser || null;
      if (!patientId) {
        console.error(`  SKIP: ${appt.name} — no user found and no fallback`);
        errors++;
        continue;
      }
    }

    const { error } = await supabase.from('appointments').insert([{
      appointment_date: appointmentDate,
      appointment_time: appt.time,
      patient_id: patientId,
      service_type: mapServiceType(appt.service),
      status: 'scheduled',
      address: 'Imported from GHS',
      zipcode: '32801',
      notes: `Patient: ${appt.name} | Service: ${appt.service} | Imported from GHS`,
    }]);

    if (error) {
      console.error(`  ERROR: ${appt.name} ${appt.date} ${appt.time} — ${error.message}`);
      errors++;
    } else {
      console.log(`  OK: ${appt.name} — ${appt.date} ${appt.time}`);
      created++;
    }
  }

  console.log(`\n--- Import Complete ---`);
  console.log(`Created: ${created}`);
  console.log(`Errors: ${errors}`);
}

importAppointments().catch(console.error);
