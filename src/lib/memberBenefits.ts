/**
 * Member benefits calculator — single source of truth for "what discount does
 * this patient get?" across the entire application.
 *
 * Used by:
 *   - Online booking flow (auto-apply at checkout preview)
 *   - Admin ScheduleAppointmentModal (auto-apply + referral-credit modal)
 *   - create-appointment-checkout edge fn (server-side authoritative pricing)
 *   - Stripe invoice line items (discount shown as negative line)
 *
 * Keep in sync with the server-side mirror in create-appointment-checkout/index.ts
 * (edge fns can't import src/ — we duplicate the math there).
 */

import { supabase } from '@/integrations/supabase/client';

export type MemberTier = 'none' | 'member' | 'vip' | 'concierge';

/**
 * Base list prices (cents) per service type. Mirrors TIER_PRICING in the edge fn.
 */
export const SERVICE_LIST_PRICE_CENTS: Record<string, number> = {
  'mobile':               15000,
  'in-office':            5500,
  'senior':               10000,
  'specialty-kit':        18500,
  'specialty-kit-genova': 20000,
  'therapeutic':          20000,
};

/**
 * Discounted price (cents) per (service, tier) pair. Mirrors TIER_PRICING in
 * create-appointment-checkout.
 */
export const TIER_PRICING: Record<string, Record<MemberTier, number>> = {
  'mobile':               { none: 15000, member: 13000, vip: 11500, concierge: 9900 },
  'in-office':            { none: 5500,  member: 4900,  vip: 4500,  concierge: 3900 },
  'senior':               { none: 10000, member: 8500,  vip: 7500,  concierge: 6500 },
  'specialty-kit':        { none: 18500, member: 16500, vip: 15000, concierge: 13500 },
  'specialty-kit-genova': { none: 20000, member: 18000, vip: 16500, concierge: 15000 },
  'therapeutic':          { none: 20000, member: 18000, vip: 16500, concierge: 15000 },
};

/**
 * Family add-on price (cents) per tier. Concierge = free for up to 2 members.
 */
export const FAMILY_ADDON_CENTS: Record<MemberTier, number> = {
  none: 7500,
  member: 6000,
  vip: 4500,
  concierge: 0,
};

// ─────────────────────────────────────────────────────────────

export interface MembershipRecord {
  id: string;
  plan_name?: string | null;
  status?: string | null;
  benefit_first_used_at?: string | null;
  promotion_locked_price?: number | null;
}

/**
 * Looks up the patient's active membership tier by email. Returns 'none' if
 * no active membership is found.
 */
export async function getMemberTier(email: string): Promise<{ tier: MemberTier; membership: MembershipRecord | null }> {
  if (!email) return { tier: 'none', membership: null };
  try {
    const { data: tp } = await supabase
      .from('tenant_patients')
      .select('user_id')
      .ilike('email', email)
      .maybeSingle();
    if (!tp?.user_id) return { tier: 'none', membership: null };

    const { data: mem } = await supabase
      .from('user_memberships' as any)
      .select('id, benefit_first_used_at, promotion_locked_price, status, membership_plans(name)')
      .eq('user_id', tp.user_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!mem) return { tier: 'none', membership: null };

    const planName = String((mem as any)?.membership_plans?.name || '').toLowerCase();
    let tier: MemberTier = 'member';
    if (planName.includes('concierge')) tier = 'concierge';
    else if (planName.includes('vip')) tier = 'vip';
    else if (planName.includes('regular') || planName.includes('member')) tier = 'member';

    return {
      tier,
      membership: {
        id: (mem as any).id,
        plan_name: (mem as any)?.membership_plans?.name || null,
        status: (mem as any).status || null,
        benefit_first_used_at: (mem as any).benefit_first_used_at || null,
        promotion_locked_price: (mem as any).promotion_locked_price || null,
      },
    };
  } catch (e) {
    console.warn('[memberBenefits] getMemberTier failed:', e);
    return { tier: 'none', membership: null };
  }
}

/**
 * Returns unredeemed referral credits for a user (by email OR user_id).
 * Sums to a total cents figure + the individual credit rows for auditing.
 */
export async function getReferralCreditBalance(opts: { email?: string; userId?: string }): Promise<{
  totalCents: number;
  credits: Array<{ id: string; amount_cents: number; description: string | null; created_at: string }>;
}> {
  let userId = opts.userId || null;
  if (!userId && opts.email) {
    const { data: tp } = await supabase
      .from('tenant_patients')
      .select('user_id')
      .ilike('email', opts.email)
      .maybeSingle();
    userId = (tp as any)?.user_id || null;
  }
  if (!userId) return { totalCents: 0, credits: [] };

  const { data: rows } = await supabase
    .from('referral_credits' as any)
    .select('id, amount, description, created_at')
    .eq('user_id', userId)
    .eq('redeemed', false);

  const credits = (rows || []).map((r: any) => ({
    id: r.id,
    amount_cents: Math.round(Number(r.amount || 0) * 100),
    description: r.description || null,
    created_at: r.created_at,
  }));
  const totalCents = credits.reduce((s, c) => s + c.amount_cents, 0);
  return { totalCents, credits };
}

/**
 * Compute the final checkout breakdown for a given patient + service combo,
 * auto-applying membership discount + optionally referral credits.
 */
export interface CheckoutBreakdown {
  listPriceCents: number;
  memberDiscountCents: number;
  referralCreditAppliedCents: number;
  finalPriceCents: number;
  tier: MemberTier;
  savingsSummary: string;
}

export function computeCheckout(opts: {
  serviceType: string;
  tier: MemberTier;
  applyReferralCents?: number;
}): CheckoutBreakdown {
  const list = SERVICE_LIST_PRICE_CENTS[opts.serviceType] ?? 15000;
  const discounted = TIER_PRICING[opts.serviceType]?.[opts.tier] ?? list;
  const memberDiscount = Math.max(0, list - discounted);
  const referral = Math.max(0, Math.min(opts.applyReferralCents || 0, discounted));
  const final = Math.max(0, discounted - referral);

  const totalSaved = memberDiscount + referral;
  const parts: string[] = [];
  if (memberDiscount > 0) parts.push(`$${(memberDiscount / 100).toFixed(2)} member discount`);
  if (referral > 0) parts.push(`$${(referral / 100).toFixed(2)} referral credit`);
  const savingsSummary = totalSaved > 0 ? `Saved $${(totalSaved / 100).toFixed(2)} (${parts.join(' + ')})` : '';

  return {
    listPriceCents: list,
    memberDiscountCents: memberDiscount,
    referralCreditAppliedCents: referral,
    finalPriceCents: final,
    tier: opts.tier,
    savingsSummary,
  };
}
