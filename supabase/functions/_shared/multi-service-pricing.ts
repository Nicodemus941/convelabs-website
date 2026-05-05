/**
 * Server-side mirror of src/services/pricing/multiServicePricing.ts.
 *
 * Edge functions MUST re-verify the patient-supplied price against this
 * module before charging Stripe. The client value is advisory; the server
 * value is authoritative.
 *
 * Keep this file in lockstep with the client module — same curve, same
 * named bundles, same companion-waiver rule.
 */

export type MembershipTier = 'none' | 'member' | 'vip' | 'concierge';

const TIER_PRICING: Record<string, Record<MembershipTier, number>> = {
  'dev-testing':            { none: 1,   member: 1,   vip: 1,   concierge: 1 },
  'mobile':                 { none: 150, member: 130, vip: 115, concierge: 99 },
  'in-office':              { none: 55,  member: 49,  vip: 45,  concierge: 39 },
  'senior':                 { none: 100, member: 85,  vip: 75,  concierge: 65 },
  'specialty-kit':          { none: 185, member: 165, vip: 150, concierge: 135 },
  'specialty-kit-genova':   { none: 200, member: 180, vip: 165, concierge: 150 },
  'therapeutic':            { none: 200, member: 180, vip: 165, concierge: 150 },
  'additional':             { none: 75,  member: 55,  vip: 45,  concierge: 35 },
  'partner-restoration-place':       { none: 125,   member: 115,   vip: 99,    concierge: 85 },
  'partner-naturamed':               { none: 85,    member: 80,    vip: 75,    concierge: 65 },
  'partner-nd-wellness':             { none: 85,    member: 80,    vip: 75,    concierge: 65 },
  'partner-elite-medical-concierge': { none: 72.25, member: 72.25, vip: 72.25, concierge: 72.25 },
  'partner-aristotle-education':     { none: 185,   member: 185,   vip: 185,   concierge: 185 },
};

const PARTNER_PRICING: Record<string, number> = {
  'partner-restoration-place': 125,
  'partner-elite-medical-concierge': 72.25,
  'partner-naturamed': 85,
  'partner-nd-wellness': 85,
  'partner-aristotle-education': 185,
};

export const STACK_DISCOUNT_CURVE: number[] = [0, 0.25, 0.35, 0.40, 0.40, 0.40];

const NAMED_BUNDLES: Array<{ name: string; ids: string[] }> = [
  { name: 'The Full Workup',      ids: ['therapeutic', 'mobile', 'specialty-kit'] },
  { name: 'The Reset Stack',      ids: ['therapeutic', 'specialty-kit'] },
  { name: 'The Therapeutic Pair', ids: ['therapeutic', 'mobile'] },
  { name: 'The Wellness Stack',   ids: ['mobile', 'specialty-kit'] },
  { name: 'The Office Stack',     ids: ['in-office', 'specialty-kit'] },
];

export interface StackedServiceLine {
  serviceId: string;
  basePrice: number;
  discountPct: number;
  discountAmount: number;
  finalPrice: number;
}

export interface StackedTotal {
  lines: StackedServiceLine[];
  subtotal: number;
  totalSavings: number;
  unbundledTotal: number;
  bundleLabel: string | null;
  companionAddonWaived: boolean;
}

export function getServicePrice(serviceId: string, tier: MembershipTier = 'none'): number {
  if (serviceId.startsWith('partner-')) {
    return PARTNER_PRICING[serviceId] ?? 125;
  }
  return TIER_PRICING[serviceId]?.[tier] ?? TIER_PRICING['mobile']?.[tier] ?? 150;
}

function matchBundleName(serviceIds: string[]): string | null {
  if (serviceIds.length < 2) return null;
  const set = new Set(serviceIds);
  for (const b of NAMED_BUNDLES) {
    if (b.ids.length !== set.size) continue;
    if (b.ids.every(id => set.has(id))) return b.name;
  }
  return null;
}

export function calculateStackedTotal(
  serviceIds: string[],
  tier: MembershipTier = 'none'
): StackedTotal {
  if (!serviceIds || serviceIds.length === 0) {
    return {
      lines: [],
      subtotal: 0,
      totalSavings: 0,
      unbundledTotal: 0,
      bundleLabel: null,
      companionAddonWaived: false,
    };
  }

  const priced = serviceIds.map(id => ({
    id,
    base: getServicePrice(id, tier),
  })).sort((a, b) => b.base - a.base);

  const lines: StackedServiceLine[] = priced.map((p, idx) => {
    const pct = STACK_DISCOUNT_CURVE[Math.min(idx, STACK_DISCOUNT_CURVE.length - 1)] || 0;
    const discountAmount = parseFloat((p.base * pct).toFixed(2));
    const finalPrice = parseFloat((p.base - discountAmount).toFixed(2));
    return {
      serviceId: p.id,
      basePrice: p.base,
      discountPct: pct,
      discountAmount,
      finalPrice,
    };
  });

  const subtotal = parseFloat(lines.reduce((s, l) => s + l.finalPrice, 0).toFixed(2));
  const unbundledTotal = parseFloat(lines.reduce((s, l) => s + l.basePrice, 0).toFixed(2));
  const totalSavings = parseFloat((unbundledTotal - subtotal).toFixed(2));

  return {
    lines,
    subtotal,
    totalSavings,
    unbundledTotal,
    bundleLabel: matchBundleName(serviceIds),
    companionAddonWaived: serviceIds.length >= 2,
  };
}

/**
 * Server-side helper: given an appointment row's `service_type` (the
 * anchor) plus its `additional_services` jsonb array (legacy: may be
 * empty/null), return the full StackedTotal.
 */
export function stackedTotalFromAppointment(
  serviceType: string,
  additionalServices: string[] | null | undefined,
  tier: MembershipTier = 'none'
): StackedTotal {
  const ids = [serviceType, ...((additionalServices || []) as string[])].filter(Boolean);
  // De-duplicate (defense in depth)
  const unique = Array.from(new Set(ids));
  return calculateStackedTotal(unique, tier);
}
