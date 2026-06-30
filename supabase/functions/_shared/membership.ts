/**
 * Canonical membership ↔ Stripe mapping + idempotent user_memberships upsert.
 *
 * ONE source of truth, used by BOTH the real-time webhook and the hourly
 * reconcile safety net, so a paid membership ALWAYS produces a user_memberships
 * row. Memberships are identified by INTENT — `metadata.type === 'membership'`
 * plus `metadata.plan_id` carried on the Stripe Subscription — falling back to
 * the Stripe price id, and only as a last resort to the price amount. Amount is
 * never sufficient on its own (a $225 visit ≠ the $225 Essential Care plan).
 */

export interface PlanRow {
  id: string;
  name: string;
  annual_price: number;
  monthly_price: number;
  quarterly_price: number;
  credits_per_year: number;
  stripe_annual_price_id: string | null;
  stripe_monthly_price_id: string | null;
  stripe_quarterly_price_id: string | null;
}

export function tierFromPlanName(name: string): 'member' | 'vip' | 'concierge' {
  const n = (name || '').toLowerCase();
  if (n.includes('concierge')) return 'concierge';
  if (n.includes('vip')) return 'vip';
  return 'member';
}

/**
 * Resolve a membership plan deterministically. Priority:
 *   1. explicit plan_id (from metadata) — the authoritative signal
 *   2. Stripe price id (matches a membership_plans.stripe_*_price_id)
 *   3. exact price amount (last resort; ambiguous, callers should require
 *      a membership signal before trusting an amount-only match)
 */
export async function resolveMembershipPlan(
  admin: any,
  opts: { planId?: string | null; priceId?: string | null; amountCents?: number | null },
): Promise<{ plan: PlanRow; matchedBy: 'plan_id' | 'price_id' | 'amount' } | null> {
  const { data: plans } = await admin
    .from('membership_plans')
    .select('id, name, annual_price, monthly_price, quarterly_price, credits_per_year, stripe_annual_price_id, stripe_monthly_price_id, stripe_quarterly_price_id');
  const list: PlanRow[] = plans || [];

  if (opts.planId) {
    const p = list.find((x) => x.id === opts.planId);
    if (p) return { plan: p, matchedBy: 'plan_id' };
  }
  if (opts.priceId) {
    const p = list.find((x) =>
      [x.stripe_annual_price_id, x.stripe_monthly_price_id, x.stripe_quarterly_price_id].includes(opts.priceId!));
    if (p) return { plan: p, matchedBy: 'price_id' };
  }
  if (opts.amountCents && opts.amountCents > 0) {
    const p = list.find((x) => x.annual_price === opts.amountCents)
      || list.find((x) => x.monthly_price === opts.amountCents)
      || list.find((x) => x.quarterly_price === opts.amountCents);
    if (p) return { plan: p, matchedBy: 'amount' };
  }
  return null;
}

export function billingFreqFromPrice(plan: PlanRow, priceId?: string | null, fallback = 'annual'): string {
  if (priceId && priceId === plan.stripe_monthly_price_id) return 'monthly';
  if (priceId && priceId === plan.stripe_quarterly_price_id) return 'quarterly';
  if (priceId && priceId === plan.stripe_annual_price_id) return 'annual';
  return fallback;
}

/** Resolve an auth user_id from an email via tenant_patients. */
export async function userIdFromEmail(admin: any, email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const { data: tp } = await admin
    .from('tenant_patients')
    .select('user_id')
    .ilike('email', email)
    .not('user_id', 'is', null)
    .maybeSingle();
  return (tp as any)?.user_id || null;
}

/**
 * Idempotent upsert of a user_memberships row from Stripe truth. Keyed on
 * stripe_subscription_id when present, else the user's existing active row,
 * else inserts. Mirrors the chart tier onto tenant_patients so booking honors
 * the benefits. Returns whether a new row was created.
 */
export async function upsertUserMembership(admin: any, args: {
  userId: string;
  plan: PlanRow;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  billingFrequency?: string;
  billingEmail?: string | null;
  billingName?: string | null;
  nextRenewal?: string | null;
}): Promise<{ membershipId: string | null; created: boolean }> {
  const { userId, plan } = args;
  const now = new Date().toISOString();

  if (args.stripeSubscriptionId) {
    const { data: bySub } = await admin.from('user_memberships')
      .select('id').eq('stripe_subscription_id', args.stripeSubscriptionId).maybeSingle();
    if (bySub) {
      await admin.from('user_memberships')
        .update({ status: 'active', plan_id: plan.id, updated_at: now }).eq('id', (bySub as any).id);
      return { membershipId: (bySub as any).id, created: false };
    }
  }

  const { data: byUser } = await admin.from('user_memberships')
    .select('id').eq('user_id', userId).eq('status', 'active').maybeSingle();
  if (byUser) {
    await admin.from('user_memberships').update({
      plan_id: plan.id,
      stripe_customer_id: args.stripeCustomerId ?? undefined,
      stripe_subscription_id: args.stripeSubscriptionId ?? undefined,
      updated_at: now,
    }).eq('id', (byUser as any).id);
    return { membershipId: (byUser as any).id, created: false };
  }

  const nextRenewal = args.nextRenewal || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data: created, error } = await admin.from('user_memberships').insert({
    user_id: userId,
    plan_id: plan.id,
    stripe_customer_id: args.stripeCustomerId || null,
    stripe_subscription_id: args.stripeSubscriptionId || null,
    billing_frequency: args.billingFrequency || 'annual',
    status: 'active',
    is_primary_member: true,
    credits_allocated_annual: plan.credits_per_year || 0,
    credits_remaining: plan.credits_per_year || 0,
    next_renewal: nextRenewal,
    billing_email: args.billingEmail || null,
    billing_name: args.billingName || null,
  }).select('id').single();
  if (error) throw error;

  try {
    await admin.from('tenant_patients')
      .update({ membership_tier: tierFromPlanName(plan.name) }).eq('user_id', userId);
  } catch { /* non-blocking chart mirror */ }

  return { membershipId: (created as any)?.id || null, created: true };
}
