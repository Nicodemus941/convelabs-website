// Tier-based slot gating. Determines which membership tier is required to
// book a given slot, and computes the exact dollar savings the patient
// would see on THIS visit if they upgraded.
//
// Hormozi frame: show the slots the non-member CAN'T have as LOCKED (not
// hidden) so the upgrade math is visible in the moment of decision.

import { evaluateSlot, type MemberTier } from './bookingWindows.ts';

export type Tier = 'none' | 'regular_member' | 'vip' | 'concierge';

// Access windows live in ./bookingWindows.ts (premium-hours model, 2026-10-02):
// weekdays are open to every tier 5 AM – 3 PM (premium 5–7 / 1–3 priced, not
// gated); the only tier-held inventory left is a weekend slot more than 24 h
// out, which VIP / Concierge can book and everyone else sees labelled.
// AdventHealth destination still bypasses gating in availability.ts.

const TIER_ORDER: Tier[] = ['none', 'regular_member', 'vip', 'concierge'];

const TO_MEMBER_TIER: Record<Tier, MemberTier> = {
  none: 'none', regular_member: 'member', vip: 'vip', concierge: 'concierge',
};

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

function isSlotInTierWindow(tier: Tier, dateIso: string, time: string, now?: Date): boolean {
  const rule = evaluateSlot({ tier: TO_MEMBER_TIER[tier], dateIso, time, isFasting: false, now });
  // A held weekend slot is the only tier-specific "no"; closed windows are
  // closed for everyone and the grid never offers them.
  return rule.bookable || (!rule.vipHold && rule.window === 'closed');
}

/**
 * Minimum tier that can book this slot right now. Returns 'none' if anyone
 * can book (every weekday slot; weekend slots inside the 24 h release).
 */
export function minTierForSlot(dateIso: string, time: string, now?: Date): Tier {
  for (const tier of TIER_ORDER) {
    if (isSlotInTierWindow(tier, dateIso, time, now)) return tier;
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
