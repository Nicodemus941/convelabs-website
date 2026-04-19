// Tier-based slot gating. Determines which membership tier is required to
// book a given slot, and computes the exact dollar savings the patient
// would see on THIS visit if they upgraded.
//
// Hormozi frame: show the slots the non-member CAN'T have as LOCKED (not
// hidden) so the upgrade math is visible in the moment of decision.

export type Tier = 'none' | 'regular_member' | 'vip' | 'concierge';

// Access windows per tier (24h clock; fractional hours allowed for Sat 9/11)
const TIER_WINDOWS: Record<Tier, {
  weekday: { start: number; end: number } | null;
  saturday: { start: number; end: number } | null;
  sunday: boolean;
}> = {
  none:           { weekday: { start: 9, end: 12 }, saturday: null,                  sunday: false },
  regular_member: { weekday: { start: 6, end: 12 }, saturday: { start: 6, end: 9 },  sunday: false },
  vip:            { weekday: { start: 6, end: 14 }, saturday: { start: 6, end: 11 }, sunday: false },
  concierge:      { weekday: { start: 6, end: 20 }, saturday: { start: 6, end: 20 }, sunday: true  },
};

const TIER_ORDER: Tier[] = ['none', 'regular_member', 'vip', 'concierge'];

// Membership pricing (cents) — matches lib/memberBenefits.ts
export const TIER_ANNUAL_PRICE_CENTS: Record<Tier, number> = {
  none: 0,
  regular_member: 9900,
  vip: 19900,
  concierge: 39900,
};

// Per-visit prices per service type per tier (mobile + in-office only — we
// don't sell in-office any more but keep for consistency)
export const TIER_VISIT_PRICE_CENTS: Record<string, Record<Tier, number>> = {
  mobile:     { none: 15000, regular_member: 13000, vip: 11500, concierge: 9900 },
  'in-office':{ none:  5500, regular_member:  4900, vip:  4500, concierge: 3900 },
};

function parseTime(t: string): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  if (!match) return { h: 0, m: 0 };
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return { h, m };
}

function isSlotInTierWindow(tier: Tier, dateIso: string, time: string): boolean {
  const date = new Date(dateIso + 'T12:00:00');
  const dow = date.getDay();
  const { h, m } = parseTime(time);
  const hourFrac = h + m / 60;
  const w = TIER_WINDOWS[tier];

  if (dow === 0) return w.sunday;
  if (dow === 6) return w.saturday != null && hourFrac >= w.saturday.start && hourFrac < w.saturday.end;
  // weekday
  return w.weekday != null && hourFrac >= w.weekday.start && hourFrac < w.weekday.end;
}

/**
 * Minimum tier that can book this slot. Returns 'none' if anyone can book.
 */
export function minTierForSlot(dateIso: string, time: string): Tier {
  for (const tier of TIER_ORDER) {
    if (isSlotInTierWindow(tier, dateIso, time)) return tier;
  }
  return 'concierge';
}

/**
 * For a slot locked behind a tier, compute how much the patient would save
 * on THIS visit if they upgraded AND the annual membership price. Used by
 * the "Unlock this slot" modal.
 */
export function slotUnlockOffer(
  currentTier: Tier,
  requiredTier: Tier,
  serviceType: 'mobile' | 'in-office' = 'mobile',
): { unlock_price_cents: number; visit_savings_cents: number; required_tier: Tier } {
  const visitPrices = TIER_VISIT_PRICE_CENTS[serviceType] || TIER_VISIT_PRICE_CENTS.mobile;
  const currentVisitPrice = visitPrices[currentTier];
  const requiredVisitPrice = visitPrices[requiredTier];
  const visitSavings = Math.max(0, currentVisitPrice - requiredVisitPrice);
  return {
    unlock_price_cents: TIER_ANNUAL_PRICE_CENTS[requiredTier],
    visit_savings_cents: visitSavings,
    required_tier: requiredTier,
  };
}

export const TIER_LABEL: Record<Tier, string> = {
  none: 'Non-member',
  regular_member: 'Regular Member',
  vip: 'VIP',
  concierge: 'Concierge',
};
