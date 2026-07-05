// Runnable check of the provider draw-plan quote core. `npx tsx scripts/_pricing_test.ts`
import { computeQuote, type RateTier } from '../supabase/functions/_shared/provider-pricing.ts';

const TIERS: RateTier[] = [
  { tier_key: 'starter', label: 'Starter', min_draws_mo: 5, max_draws_mo: 24, per_draw_cents: 8500 },
  { tier_key: 'growth', label: 'Growth', min_draws_mo: 25, max_draws_mo: 74, per_draw_cents: 7500 },
  { tier_key: 'scale', label: 'Scale', min_draws_mo: 75, max_draws_mo: 199, per_draw_cents: 6500 },
  { tier_key: 'enterprise', label: 'Enterprise', min_draws_mo: 200, max_draws_mo: null, per_draw_cents: 5500 },
];

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${JSON.stringify(got)}${ok ? '' : ` want=${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

// 20 patients, monthly → 20 draws → Starter $85 → $1,700/mo (+$199 setup)
const q1 = computeQuote({ patientCount: 20, frequency: 'monthly' }, TIERS);
check('20 monthly draws/cycle', q1.drawsPerCycle, 20);
check('20 monthly tier', q1.tier.tier_key, 'starter');
check('20 monthly monthly$', q1.monthlyTotalCents, 170000);
check('20 monthly firstCharge$', q1.firstChargeCents, 170000 + 19900);

// 30 patients, biweekly → 30*2.1667=65.0 → ceil 65 → Growth $75 → $4,875
const q2 = computeQuote({ patientCount: 30, frequency: 'biweekly' }, TIERS);
check('30 biweekly draws/cycle', q2.drawsPerCycle, 65);
check('30 biweekly tier', q2.tier.tier_key, 'growth');
check('30 biweekly monthly$', q2.monthlyTotalCents, 65 * 7500);

// 40 patients, weekly → 40*4.3333=173.3 → ceil 174 → Scale $65
const q3 = computeQuote({ patientCount: 40, frequency: 'weekly' }, TIERS);
check('40 weekly draws/cycle', q3.drawsPerCycle, 174);
check('40 weekly tier', q3.tier.tier_key, 'scale');
check('40 weekly monthly$', q3.monthlyTotalCents, 174 * 6500);

// Enterprise: 60 patients weekly → 60*4.3333=260 → 200+ → $55
const q4 = computeQuote({ patientCount: 60, frequency: 'weekly' }, TIERS);
check('60 weekly tier', q4.tier.tier_key, 'enterprise');

// Edge: 5 patients monthly → 5 draws → Starter floor
const q5 = computeQuote({ patientCount: 5, frequency: 'monthly' }, TIERS);
check('5 monthly tier', q5.tier.tier_key, 'starter');

// Custom cadence honored
const q6 = computeQuote({ patientCount: 10, frequency: 'custom', customDrawsPerMonthPerPatient: 3 }, TIERS);
check('10 custom(3) draws/cycle', q6.drawsPerCycle, 30);
check('10 custom(3) tier', q6.tier.tier_key, 'growth');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
