const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join('C:', 'Users', 'nicod', 'Downloads', 'convelabs_patients.csv');
const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdXlvbmhyeHh0eXVpeXJkaXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1MDExODgsImV4cCI6MjA2MzA3NzE4OH0.ZKP-k5fizUtKZsekV9RFL1wYcVfIHEeQWArs-4l5Q-Y';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function parseCSV(text) {
  const lines = text.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = {};
    let current = '';
    let inQuotes = false;
    let braceDepth = 0;
    let fieldIndex = 0;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      if (ch === '"' && braceDepth === 0) { inQuotes = !inQuotes; continue; }
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
      if (ch === ',' && !inQuotes && braceDepth === 0) {
        row[headers[fieldIndex]] = current.trim();
        current = '';
        fieldIndex++;
      } else {
        current += ch;
      }
    }
    row[headers[fieldIndex]] = current.trim();
    rows.push(row);
  }
  return rows;
}

function cleanPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits : null;
}

async function sbRest(endpoint, method, body) {
  const h = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (method === 'POST' || method === 'PATCH') h['Prefer'] = 'return=minimal';
  const opts = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + endpoint, opts);
  if (!res.ok) throw new Error(res.status + ': ' + (await res.text()).substring(0, 200));
  return method === 'GET' ? res.json() : null;
}

async function main() {
  console.log('Reading CSV...');
  const patients = parseCSV(fs.readFileSync(CSV_PATH, 'utf-8'));
  console.log('Parsed ' + patients.length + ' patients');

  const existing = await sbRest('tenant_patients?select=id,email,phone&tenant_id=eq.' + TENANT_ID + '&limit=1000', 'GET');
  const emailMap = new Map();
  existing.forEach(function(p) { if (p.email) emailMap.set(p.email.toLowerCase(), p); });
  console.log('Existing: ' + existing.length);

  let created = 0, updated = 0, skipped = 0, errors = 0;
  const seen = new Set();

  for (const p of patients) {
    const email = (p.email || '').trim().toLowerCase();
    if (!email || seen.has(email)) { skipped++; continue; }
    seen.add(email);

    const parts = (p.full_name || '').trim().split(/\s+/);
    const first = parts[0] || '';
    const last = parts.slice(1).join(' ') || '';
    const phone = cleanPhone(p.phone);

    try {
      if (emailMap.has(email)) {
        const ex = emailMap.get(email);
        if (phone && !ex.phone) {
          await sbRest('tenant_patients?id=eq.' + ex.id, 'PATCH', { phone: phone });
          updated++;
        } else { skipped++; }
      } else {
        await sbRest('tenant_patients', 'POST', {
          tenant_id: TENANT_ID,
          first_name: first,
          last_name: last,
          email: email,
          phone: phone
        });
        created++;
      }
    } catch (err) {
      if (err.message.includes('23505')) { skipped++; }
      else { console.error('ERR [' + email + ']: ' + err.message.substring(0, 80)); errors++; }
    }

    if ((created + updated + skipped + errors) % 100 === 0) {
      console.log('... ' + created + 'c ' + updated + 'u ' + skipped + 's ' + errors + 'e');
    }
  }

  console.log('\n=== Done ===');
  console.log('Created: ' + created);
  console.log('Updated: ' + updated);
  console.log('Skipped: ' + skipped);
  console.log('Errors: ' + errors);
}

main().catch(console.error);
