import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  'https://yluyonhrxxtyuiyrdixl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const CSV_DATA = [
  { name: 'Addison Barrios', date: '2026-04-13T10:30:00+00', status: 'confirmed', service: 'At-Home Blood Work 65+', address: '1457 Shadwell Cir, Lake Mary, FL 32746', amount: 100, payment: 'paid' },
  { name: 'Nicolas Chaillan', date: '2026-04-13T12:00:00+00', status: 'pending', service: 'At-Home Blood Work', address: '182 Kentucky Blue Circle, Apopka, FL 32712', amount: 150, payment: 'paid' },
  { name: 'Clinical Associates of Orlando', date: '2026-04-13T14:30:00+00', status: 'confirmed', service: "Dr's In-Office Blood Draw", address: '7680 Universal Blvd, Orlando, FL 32819', amount: 55, payment: 'paid' },
  { name: 'Debbie Lobban', date: '2026-04-14T10:30:00+00', status: 'pending', service: 'Restoration Place Patients Only', address: '659 Park Lake Street, Orlando, FL 32803', amount: 125, payment: 'paid' },
  { name: 'Frank Avilucea', date: '2026-04-14T11:30:00+00', status: 'pending', service: 'Elite Medical Patients ONLY', address: '1180 Tom Gurney Dr, Winter Park, FL 32789', amount: 0, payment: 'paid' },
  { name: 'Dean Faracchio', date: '2026-04-14T13:00:00+00', status: 'pending', service: 'At-Home Blood Work', address: '369 Sprucewood Court, Lake Mary, FL 32746', amount: 150, payment: 'paid' },
  { name: 'Todd Morgan', date: '2026-04-14T14:00:00+00', status: 'pending', service: 'At-Home Blood Work', address: '1302 Sweetwater Club Blvd, Longwood, FL 32779', amount: 0, payment: 'paid' },
  { name: 'Allen Jones', date: '2026-04-14T16:00:00+00', status: 'pending', service: 'Therapeutic Phlebotomy', address: '149 Chelton Circle, Winter Park, FL 32789', amount: 200, payment: 'paid' },
  { name: 'Natasha Morgan', date: '2026-04-15T10:00:00+00', status: 'pending', service: 'At-Home Blood Work', address: '1888 Bridgewater Dr, Lake Mary, FL 32746', amount: 150, payment: 'pending' },
  { name: 'Lisa Koppe', date: '2026-04-16T12:00:00+00', status: 'pending', service: 'At-Home Blood Work', address: '18501 Sabal St, Orlando, FL 32833', amount: 185, payment: 'paid' },
  { name: 'Jennifer Stephenson', date: '2026-04-16T16:00:00+00', status: 'pending', service: 'At-Home Blood Work', address: '3401 Dawn Ct, Lake Mary, FL 32746', amount: 150, payment: 'paid' },
  { name: 'Blair and Bill Hull', date: '2026-04-17T11:00:00+00', status: 'pending', service: 'Elite Medical Patients ONLY', address: '1468 Holts Grove Cir, Winter Park, FL 32789', amount: 0, payment: 'paid' },
  { name: 'Lawrence Carpenter', date: '2026-04-17T13:00:00+00', status: 'pending', service: 'Blood Work', address: '401 N. Magnolia Ave', amount: 0, payment: 'paid' },
  { name: 'Lois Edmunds', date: '2026-04-17T15:00:00+00', status: 'pending', service: 'At-Home Blood Work 65+', address: '614 Pearl Rd, Winter Springs, FL 32708', amount: 100, payment: 'paid' },
  { name: 'Joshua Jacobson', date: '2026-04-18T12:00:00+00', status: 'confirmed', service: 'At-Home Blood Work', address: '7240 Azure Cir #2401, Golden Oak, FL 32836', amount: 185, payment: 'paid' },
  { name: 'Valli & John Ritenour', date: '2026-04-21T10:00:00+00', status: 'pending', service: 'At-Home Blood Work 65+', address: '2141 Alaqua Dr, Longwood, FL 32779', amount: 100, payment: 'paid' },
  { name: 'Catlin', date: '2026-04-21T12:00:00+00', status: 'confirmed', service: 'At-Home Blood Work', address: '149 Chelton Cir, Winter Park, FL 32789', amount: 185, payment: 'paid' },
  { name: 'Kaley Jones', date: '2026-04-24T11:00:00+00', status: 'confirmed', service: 'At-Home Blood Work', address: '3509 S Crystal Lake Dr, Orlando, FL 32806', amount: 150, payment: 'paid' },
  { name: 'Lawrence Carpenter', date: '2026-04-24T13:00:00+00', status: 'pending', service: 'Blood Work', address: '401 N. Magnolia Ave', amount: 0, payment: 'paid' },
  { name: 'Diane Oshiro', date: '2026-04-27T12:00:00+00', status: 'pending', service: 'At-Home Blood Work', address: '148 Marsh Pine St, Minneola, FL 34715', amount: 175, payment: 'paid' },
  { name: 'Ella Forbes', date: '2026-04-28T12:00:00+00', status: 'pending', service: 'At-Home Blood Work 65+', address: '99 South Street, Winter Springs, FL', amount: 100, payment: 'paid' },
];

async function run() {
  const { data: appts } = await supabase.from('appointments').select('*').order('appointment_date');
  console.log(`Found ${appts?.length} appointments to update`);

  let updated = 0;
  for (const csv of CSV_DATA) {
    const matching = appts?.find(a => a.notes?.toLowerCase().includes(csv.name.toLowerCase()));
    if (!matching) {
      console.log(`  SKIP: No match for ${csv.name}`);
      continue;
    }

    const { error } = await supabase.from('appointments').update({
      address: csv.address,
      status: csv.status === 'confirmed' ? 'confirmed' : 'scheduled',
      total_amount: csv.amount,
      payment_status: csv.payment === 'paid' ? 'completed' : 'pending',
      appointment_date: csv.date,
      notes: `Patient: ${csv.name} | Service: ${csv.service} | Address: ${csv.address}`,
    }).eq('id', matching.id);

    if (error) console.log(`  ERROR: ${csv.name} — ${error.message}`);
    else { console.log(`  OK: ${csv.name} → ${csv.address.substring(0, 35)}...`); updated++; }
  }
  console.log(`\nUpdated: ${updated}/${CSV_DATA.length}`);
}

run().catch(console.error);
