// One-off harness verifying the Hormozi specialty-kit bundle ladder.
// Run with: npx tsx scripts/verify-specialty-kit-pricing.mjs
import { calculateTotal } from '../src/services/pricing/pricingService.ts';

const cases = [
  { name: 'Solo · 1 kit',                   patients: [{ kits: 1 }], expected: 185 },
  { name: 'Solo · 2 kits',                  patients: [{ kits: 2 }], expected: 220 },
  { name: 'Solo · 3 kits (Wellness Stack)', patients: [{ kits: 3 }], expected: 255 },
  { name: 'Solo · 4 kits (Power Stack)',    patients: [{ kits: 4 }], expected: 285 },
  { name: 'Couple · 1 kit each',            patients: [{ kits: 1 }, { kits: 1 }], expected: 235 },
  { name: 'Couple · 2 kits each',           patients: [{ kits: 2 }, { kits: 2 }], expected: 305 },
  { name: 'Couple · 3 kits each',           patients: [{ kits: 3 }, { kits: 3 }], expected: 375 },
  { name: 'Family (3) · 1 kit each',        patients: [{ kits: 1 }, { kits: 1 }, { kits: 1 }], expected: 285 },
  { name: 'Family (3) · 2 kits each',       patients: [{ kits: 2 }, { kits: 2 }, { kits: 2 }], expected: 390 },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const r = calculateTotal('specialty-kit', { specialtyKitBundle: { patients: c.patients } }, 0, 0, 'none');
  const ok = r.total === c.expected;
  const flag = ok ? '✅' : `❌ expected $${c.expected}`;
  const saveStr = r.bundleSavings ? `  (save $${r.bundleSavings.toFixed(0)} · ${r.bundleLabel || ''})` : '';
  console.log(`${flag.padEnd(22)} ${c.name.padEnd(40)} → $${r.total.toFixed(2)}${saveStr}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
