// ═══════════════════════════════════════════════════════════════════════
// PROVIDER DRAW-PLAN PRICING — shared quote core (Phase 1)
// Single source of truth for the frequency math + volume-tier resolution.
// The per-draw rate tiers themselves live in the provider_rate_card table;
// this module only turns (patients, frequency, rate rows) into a quote.
// ═══════════════════════════════════════════════════════════════════════

export type DrawFrequency = 'one_time' | 'monthly' | 'biweekly' | 'weekly' | 'custom';

// Draws per patient per MONTH implied by each cadence. Averaged so billing is
// stable month to month (52 weeks / 12 months = 4.333; 26 biweekly / 12 = 2.1667).
export const FREQUENCY_DRAWS_PER_MONTH: Record<DrawFrequency, number> = {
  one_time: 1,   // treated as a single cycle
  monthly: 1,
  biweekly: 2.1667,
  weekly: 4.3333,
  custom: 1,     // caller must supply drawsPerCycle explicitly
};

export interface RateTier {
  tier_key: string;
  label: string;
  min_draws_mo: number;
  max_draws_mo: number | null;
  per_draw_cents: number;
}

export interface QuoteInput {
  patientCount: number;
  frequency: DrawFrequency;
  /** Required only when frequency === 'custom' — draws per patient per month. */
  customDrawsPerMonthPerPatient?: number;
  setupFeeCents?: number;
}

export interface Quote {
  patientCount: number;
  frequency: DrawFrequency;
  drawsPerCycle: number;       // total draws billed per monthly cycle
  tier: RateTier;
  perDrawCents: number;
  monthlyTotalCents: number;   // drawsPerCycle * perDrawCents
  setupFeeCents: number;
  firstChargeCents: number;    // monthly + setup (charged upfront)
}

const DEFAULT_SETUP_FEE_CENTS = 19900; // $199 activation (waivable)

/** Resolve the volume tier for a given monthly draw count. */
export function resolveTier(drawsPerMonth: number, tiers: RateTier[]): RateTier {
  const sorted = [...tiers].sort((a, b) => a.min_draws_mo - b.min_draws_mo);
  const match = sorted.find(
    (t) => drawsPerMonth >= t.min_draws_mo && (t.max_draws_mo == null || drawsPerMonth <= t.max_draws_mo),
  );
  // Below the lowest floor → use the lowest tier; above the top → use the top.
  return match ?? sorted[sorted.length - 1] ?? sorted[0];
}

/** Compute a full quote from the patient count, cadence, and rate-card rows. */
export function computeQuote(input: QuoteInput, tiers: RateTier[]): Quote {
  const patients = Math.max(1, Math.floor(input.patientCount || 0));
  const perPatientPerMonth =
    input.frequency === 'custom'
      ? Math.max(0, input.customDrawsPerMonthPerPatient ?? 1)
      : FREQUENCY_DRAWS_PER_MONTH[input.frequency];

  // Round up so a fractional cadence never under-provisions the cycle.
  const drawsPerCycle = Math.max(1, Math.ceil(patients * perPatientPerMonth));
  const tier = resolveTier(drawsPerCycle, tiers);
  const perDrawCents = tier.per_draw_cents;
  const monthlyTotalCents = drawsPerCycle * perDrawCents;
  const setupFeeCents = input.setupFeeCents ?? DEFAULT_SETUP_FEE_CENTS;

  return {
    patientCount: patients,
    frequency: input.frequency,
    drawsPerCycle,
    tier,
    perDrawCents,
    monthlyTotalCents,
    setupFeeCents,
    firstChargeCents: monthlyTotalCents + setupFeeCents,
  };
}
