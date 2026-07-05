// create-provider-plan-checkout — self-serve recurring draw-plan checkout.
// Re-quotes SERVER-SIDE from provider_rate_card (never trusts client amounts),
// resolves/creates the org, writes a pending provider_plans row, and opens a
// Stripe subscription checkout with the first cycle + setup fee charged upfront.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { stripe } from '../_shared/stripe.ts';
import { computeQuote, type DrawFrequency, type RateTier } from '../_shared/provider-pricing.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
);

const VALID_FREQ: DrawFrequency[] = ['one_time', 'monthly', 'biweekly', 'weekly', 'custom'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (p: unknown, status = 200) =>
    new Response(JSON.stringify(p), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'auth_required' }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'invalid_token' }, 401);
    const user = userData.user;

    // ── Validate config ───────────────────────────────────────────────
    const b = await req.json().catch(() => ({}));
    const patientCount = parseInt(b.patientCount, 10);
    const frequency = b.frequency as DrawFrequency;
    const startDate = String(b.startDate || '').slice(0, 10);
    const practiceName = String(b.practiceName || '').trim();

    if (!Number.isFinite(patientCount) || patientCount < 1 || patientCount > 5000) {
      return json({ error: 'invalid_patient_count' }, 400);
    }
    if (!VALID_FREQ.includes(frequency)) return json({ error: 'invalid_frequency' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return json({ error: 'invalid_start_date' }, 400);

    // ── Resolve or create the org ─────────────────────────────────────
    let orgId = (user.app_metadata?.organization_id as string) || (user.user_metadata?.org_id as string) || null;
    let org: any = null;
    if (orgId) {
      const { data } = await admin.from('organizations')
        .select('id, name, contact_email, billing_email, stripe_customer_id, subscription_status')
        .eq('id', orgId).maybeSingle();
      org = data;
    }
    if (!org) {
      // First-time self-serve provider — create the org and bind it to the
      // user's server-controlled app_metadata so future calls are scoped.
      if (!practiceName) return json({ error: 'practice_name_required' }, 400);
      const { data: created, error: createErr } = await admin.from('organizations')
        .insert({ name: practiceName, contact_email: b.contactEmail || user.email || null })
        .select('id, name, contact_email, billing_email, stripe_customer_id, subscription_status')
        .single();
      if (createErr || !created) return json({ error: 'org_create_failed' }, 500);
      org = created;
      orgId = created.id;
      await admin.auth.admin.updateUserById(user.id, { app_metadata: { organization_id: orgId } });
    }

    if (org.subscription_status === 'active') {
      return json({ error: 'already_active', message: 'Your practice already has an active plan.' }, 409);
    }

    // ── Re-quote SERVER-SIDE (authoritative) ──────────────────────────
    const { data: tiers } = await admin.from('provider_rate_card')
      .select('tier_key, label, min_draws_mo, max_draws_mo, per_draw_cents').eq('active', true);
    if (!tiers || tiers.length === 0) return json({ error: 'rate_card_unavailable' }, 500);

    const quote = computeQuote(
      { patientCount, frequency, customDrawsPerMonthPerPatient: b.customDrawsPerMonthPerPatient },
      tiers as RateTier[],
    );

    // ── Ensure Stripe customer ────────────────────────────────────────
    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org.billing_email || org.contact_email || user.email || undefined,
        name: org.name,
        metadata: { organization_id: orgId },
      });
      customerId = customer.id;
      await admin.from('organizations').update({ stripe_customer_id: customerId }).eq('id', orgId);
    }

    // ── Write pending plan row (webhook flips it to active) ────────────
    const { data: plan, error: planErr } = await admin.from('provider_plans').insert({
      organization_id: orgId,
      status: 'pending_payment',
      patient_count: patientCount,
      frequency,
      draws_per_cycle: quote.drawsPerCycle,
      cadence_days: Array.isArray(b.cadenceDays) ? b.cadenceDays : null,
      draw_window: b.drawWindow || null,
      start_date: startDate,
      per_draw_cents: quote.perDrawCents,
      tier_key: quote.tier.tier_key,
      setup_fee_cents: quote.setupFeeCents,
      monthly_total_cents: quote.monthlyTotalCents,
      stripe_customer_id: customerId,
      created_by: user.id,
    }).select('id').single();
    if (planErr || !plan) return json({ error: 'plan_create_failed' }, 500);

    // ── Subscription checkout — quantity-based so seat/volume changes get
    //    native Stripe proration; setup fee is a one-time first-invoice line.
    const origin = req.headers.get('origin') || 'https://www.convelabs.com';
    const line_items: any[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `ConveLabs draw plan — ${quote.tier.label} (${quote.drawsPerCycle} draws/mo)` },
          unit_amount: quote.perDrawCents,
          recurring: { interval: 'month' },
        },
        quantity: quote.drawsPerCycle,
      },
    ];
    if (quote.setupFeeCents > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'One-time setup & onboarding' },
          unit_amount: quote.setupFeeCents,
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items,
      success_url: `${origin}/providers/draw-plan?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/providers/draw-plan?status=cancel`,
      metadata: {
        type: 'provider_plan',
        provider_plan_id: plan.id,
        organization_id: orgId,
      },
      subscription_data: {
        metadata: { type: 'provider_plan', provider_plan_id: plan.id, organization_id: orgId },
      },
    });

    return json({ ok: true, url: session.url, planId: plan.id, quote });
  } catch (e: any) {
    console.error('[create-provider-plan-checkout] error:', e?.message);
    return json({ error: 'checkout_failed' }, 500);
  }
});
