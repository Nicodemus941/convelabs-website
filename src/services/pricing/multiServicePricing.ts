/**
 * Multi-Service Stacking (Hormozi v1)
 *
 * When a single appointment carries 2+ services (e.g., Mobile + Therapeutic),
 * apply a stacking discount that rewards the patient for batching services
 * into one visit. Margin justification: the phleb only makes one trip, one
 * setup, one cleanup, regardless of how many services are stacked.
 *
 * Curve (per-service discount on its own price, sorted high → low):
 *   1st (anchor) — full price
 *   2nd          — 25% off
 *   3rd          — 35% off
 *   4th+         — 40% off
 *
 * The cart shows DOLLARS saved (not %) and a named-bundle label when the
 * combo matches a known bundle (e.g. "Wellness Stack"). Naming bundles
 * lifts conversion 2-3× per Hormozi's case studies.
 *
 * Tier discounts (member/VIP/concierge) are applied to each service's
 * base price BEFORE the stacking curve. This compounds correctly: a VIP
 * with Mobile + Therapeutic gets the VIP rate on each AND the stack
 * discount on the cheaper one.
 *
 * Companion add-on ($75 for additional patient on same visit) is WAIVED
 * automatically when the primary patient already has 2+ services on the
 * visit — the visit overhead is already paid for.
 */

import { getServicePrice, MembershipTier } from './pricingService';

// Stacking discount curve — discount applied to a service's price by its
// position in the sort. Position 0 is the most expensive service (anchor)
// and gets no discount.
export const STACK_DISCOUNT_CURVE: number[] = [0, 0.25, 0.35, 0.40, 0.40, 0.40];

export interface StackedServiceLine {
  serviceId: string;
  serviceName: string;
  basePrice: number;        // tier-priced base, before stacking discount
  discountPct: number;      // 0, 0.25, 0.35, 0.40
  discountAmount: number;   // dollars saved on this line
  finalPrice: number;       // basePrice * (1 - discountPct)
}

export interface StackedTotal {
  lines: StackedServiceLine[];
  subtotal: number;         // sum of finalPrice
  totalSavings: number;     // sum of discountAmount
  unbundledTotal: number;   // sum of basePrice (what they'd pay without stacking)
  bundleLabel: string | null; // "Wellness Stack", etc., null if no canonical match
  companionAddonWaived: boolean; // true when 2+ services on primary
}

// Canonical bundle names. Match against the SET of service IDs (order-independent).
// Only services on the SAME appointment count — companion services don't fold in.
const NAMED_BUNDLES: Array<{ name: string; ids: string[] }> = [
  { name: 'The Full Workup',     ids: ['therapeutic', 'mobile', 'specialty-kit'] },
  { name: 'The Reset Stack',     ids: ['therapeutic', 'specialty-kit'] },
  { name: 'The Therapeutic Pair', ids: ['therapeutic', 'mobile'] },
  { name: 'The Wellness Stack',  ids: ['mobile', 'specialty-kit'] },
  { name: 'The Office Stack',    ids: ['in-office', 'specialty-kit'] },
];

function matchBundleName(serviceIds: string[]): string | null {
  if (serviceIds.length < 2) return null;
  const set = new Set(serviceIds);
  for (const b of NAMED_BUNDLES) {
    if (b.ids.length !== set.size) continue;
    if (b.ids.every(id => set.has(id))) return b.name;
  }
  return null;
}

/**
 * Resolve a service's display name from its ID. Mirrors the SERVICE_CATALOG
 * in pricingService.ts but lighter — used for line-item rendering only.
 */
function serviceDisplayName(id: string): string {
  const map: Record<string, string> = {
    'mobile': 'Mobile Blood Draw',
    'in-office': 'Office Visit',
    'senior': 'Senior Blood Draw (65+)',
    'therapeutic': 'Therapeutic Phlebotomy',
    'specialty-kit': 'Specialty Collection Kit',
    'specialty-kit-genova': 'Genova Diagnostics Kit',
    'additional': 'Additional Patient',
  };
  if (map[id]) return map[id];
  if (id.startsWith('partner-')) {
    return id.replace('partner-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return id;
}

/**
 * Compute the stacked total for an array of service IDs on a SINGLE
 * appointment (one patient). Companion services live on a separate
 * appointment row and run through this function independently.
 *
 * Pure function — no side effects, easy to unit test.
 */
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

  // Compute tier-priced base for each, then sort high → low so the most
  // expensive service is the anchor (no discount).
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
      serviceName: serviceDisplayName(p.id),
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
 * Compute the companion's appointment subtotal. Companions get the same
 * stacking curve on their own services. The $75 companion add-on is
 * folded in UNLESS the primary's stack already waives it (handled at
 * the booking-summary level by checking primary's StackedTotal.companionAddonWaived).
 *
 * The $75 add-on attribution is a separate line at the visit level —
 * NOT on the companion's own service lines — so the companion can see
 * what their actual lab costs are vs the visit-attribution fee.
 */
export function calculateCompanionStackedTotal(
  companionServiceIds: string[],
  tier: MembershipTier = 'none',
  includeCompanionAddon: boolean = true
): StackedTotal & { companionAddonCents: number } {
  const stacked = calculateStackedTotal(companionServiceIds, tier);
  const companionAddonCents = includeCompanionAddon ? 7500 : 0;
  return {
    ...stacked,
    subtotal: parseFloat((stacked.subtotal + (companionAddonCents / 100)).toFixed(2)),
    companionAddonCents,
  };
}

/**
 * Combine primary + companions into a single visit-level total.
 * Returns the visit total + per-patient breakdowns + total savings
 * across the whole visit.
 */
export interface VisitStackedTotal {
  primary: StackedTotal;
  companions: Array<StackedTotal & { companionAddonCents: number }>;
  visitTotal: number;
  visitSavings: number;
  visitUnbundledTotal: number;
}

export function calculateVisitTotal(
  primaryServices: string[],
  companionsServices: string[][],
  tier: MembershipTier = 'none'
): VisitStackedTotal {
  const primary = calculateStackedTotal(primaryServices, tier);
  // Companion add-on waived if primary stacks 2+ services
  const waiveCompanion = primary.companionAddonWaived;
  const companions = companionsServices.map(svcs =>
    calculateCompanionStackedTotal(svcs, tier, !waiveCompanion)
  );

  const visitTotal = parseFloat(
    (primary.subtotal + companions.reduce((s, c) => s + c.subtotal, 0)).toFixed(2)
  );
  const visitUnbundledTotal = parseFloat(
    (primary.unbundledTotal +
      companions.reduce((s, c) => s + c.unbundledTotal + (waiveCompanion ? 0 : 75), 0)
    ).toFixed(2)
  );
  const visitSavings = parseFloat((visitUnbundledTotal - visitTotal).toFixed(2));

  return {
    primary,
    companions,
    visitTotal,
    visitSavings,
    visitUnbundledTotal,
  };
}
