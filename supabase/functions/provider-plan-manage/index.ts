// provider-plan-manage — self-serve plan lifecycle for a provider draw plan.
// Actions: pause | resume | cancel | change_volume. Auth: the caller's org
// (app_metadata / verified) must own the plan. Stripe is the source of truth
// for billing state; the webhook (syncOrgSubscription) mirrors status back, but
// we also stamp provider_plans directly for an instant portal update.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { stripe } from '../_shared/stripe.ts';
import { computeQuote, type RateTier } from '../_shared/provider-pricing.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (p: unknown, s = 200) =>
    new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'auth_required' }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'invalid_token' }, 401);
    const user = userData.user;

    const b = await req.json().catch(() => ({}));
    const planId = String(b.planId || '');
    const action = String(b.action || '');
    if (!planId || !['pause', 'resume', 'cancel', 'change_volume'].includes(action)) {
      return json({ error: 'invalid_request' }, 400);
    }

    // Load the plan and verify ownership by org scope.
    const { data: plan } = await admin.from('provider_plans')
      .select('id, organization_id, stripe_subscription_id, patient_count, frequency, status')
      .eq('id', planId).maybeSingle();
    if (!plan) return json({ error: 'plan_not_found' }, 404);

    const callerOrg = (user.app_metadata?.organization_id as string) || (user.user_metadata?.org_id as string) || null;
    if (!callerOrg || callerOrg !== plan.organization_id) {
      return json({ error: 'not_authorized_for_plan' }, 403);
    }
    const subId = plan.stripe_subscription_id;
    if (!subId) return json({ error: 'no_active_subscription' }, 409);

    if (action === 'cancel') {
      await stripe.subscriptions.cancel(subId);
      await admin.from('provider_plans').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', planId);
      return json({ ok: true, status: 'canceled' });
    }

    if (action === 'pause') {
      await stripe.subscriptions.update(subId, { pause_collection: { behavior: 'void' } });
      await admin.from('provider_plans').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', planId);
      return json({ ok: true, status: 'paused' });
    }

    if (action === 'resume') {
      await stripe.subscriptions.update(subId, { pause_collection: '' });
      await admin.from('provider_plans').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', planId);
      return json({ ok: true, status: 'active' });
    }

    // change_volume — recompute the tier for the new patient count and update
    // the subscription (quantity + price), prorated by Stripe.
    if (action === 'change_volume') {
      const patientCount = parseInt(b.patientCount, 10);
      if (!Number.isFinite(patientCount) || patientCount < 1 || patientCount > 5000) {
        return json({ error: 'invalid_patient_count' }, 400);
      }
      const { data: tiers } = await admin.from('provider_rate_card')
        .select('tier_key, label, min_draws_mo, max_draws_mo, per_draw_cents').eq('active', true);
      if (!tiers?.length) return json({ error: 'rate_card_unavailable' }, 500);

      const quote = computeQuote({ patientCount, frequency: plan.frequency as any, setupFeeCents: 0 }, tiers as RateTier[]);

      const sub = await stripe.subscriptions.retrieve(subId);
      const item = sub.items.data[0];
      await stripe.subscriptions.update(subId, {
        items: [{
          id: item.id,
          quantity: quote.drawsPerCycle,
          price_data: {
            currency: 'usd',
            product: (item.price.product as string),
            unit_amount: quote.perDrawCents,
            recurring: { interval: 'month' },
          },
        }],
        proration_behavior: 'create_prorations',
      });

      await admin.from('provider_plans').update({
        patient_count: patientCount,
        draws_per_cycle: quote.drawsPerCycle,
        per_draw_cents: quote.perDrawCents,
        tier_key: quote.tier.tier_key,
        monthly_total_cents: quote.monthlyTotalCents,
        updated_at: new Date().toISOString(),
      }).eq('id', planId);

      return json({ ok: true, quote });
    }

    return json({ error: 'unhandled' }, 400);
  } catch (e: any) {
    console.error('[provider-plan-manage] error:', e?.message);
    return json({ error: 'manage_failed' }, 500);
  }
});
