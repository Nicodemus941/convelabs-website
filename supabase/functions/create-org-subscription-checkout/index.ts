/**
 * CREATE-ORG-SUBSCRIPTION-CHECKOUT
 *
 * Provider clicks "Subscribe your practice" in their dashboard → picks
 * patient volume → this mints a Stripe Checkout Session in SUBSCRIPTION
 * mode. The stripe-webhook stamps the org row on checkout.session.completed.
 *
 * Pricing model: $85/patient/mo. Provider picks estimated volume (seat_cap).
 * Monthly price = per_seat_cents × seat_cap. Stripe handles recurring billing.
 *
 * Auth: JWT-scoped — the caller must be a provider tied to the org via
 * user_metadata.org_id (set during invite/OTP login).
 *
 * Body: { seat_cap: number }  — e.g. 25 → 25 patient seats at $85 ea
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from '../_shared/stripe.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

const PER_SEAT_CENTS = 8500; // $85/patient/month — single source of truth
const MIN_SEATS = 5;
const MAX_SEATS = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'auth_required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: userData, error: userErr } = await admin.auth.getUser(authHeader);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = userData.user;
    const orgId = (user.user_metadata?.org_id as string) || (user.app_metadata?.organization_id as string);
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'no_org_scope', message: 'Your login isn\'t tied to an organization yet.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const seatCap = parseInt(body.seat_cap, 10);
    if (!Number.isFinite(seatCap) || seatCap < MIN_SEATS || seatCap > MAX_SEATS) {
      return new Response(JSON.stringify({ error: 'invalid_seat_cap', message: `Pick between ${MIN_SEATS} and ${MAX_SEATS} patients.` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch org (for name + existing Stripe customer)
    const { data: org, error: orgErr } = await admin.from('organizations')
      .select('id, name, contact_name, contact_email, billing_email, stripe_customer_id, subscription_status')
      .eq('id', orgId)
      .maybeSingle();
    if (orgErr || !org) {
      return new Response(JSON.stringify({ error: 'org_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (org.subscription_status === 'active') {
      return new Response(JSON.stringify({
        error: 'already_active',
        message: 'Your practice is already subscribed. Use the manage-plan link to change seat count.',
      }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ensure Stripe customer
    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org.billing_email || org.contact_email || user.email || undefined,
        name: org.name,
        metadata: { organization_id: org.id, contact_name: org.contact_name || '' },
      });
      customerId = customer.id;
      await admin.from('organizations').update({ stripe_customer_id: customerId }).eq('id', org.id);
    }

    const monthlyCents = PER_SEAT_CENTS * seatCap;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: monthlyCents,
          recurring: { interval: 'month' },
          product_data: {
            name: `ConveLabs Practice Subscription — ${seatCap} patients`,
            description: `$${(PER_SEAT_CENTS / 100).toFixed(0)}/patient × ${seatCap} patients = $${(monthlyCents / 100).toFixed(0)}/month. Covers unlimited at-home draws for up to ${seatCap} enrolled patients.`,
          },
        },
        quantity: 1,
      }],
      subscription_data: {
        metadata: {
          type: 'org_subscription',
          organization_id: org.id,
          seat_cap: String(seatCap),
          per_seat_cents: String(PER_SEAT_CENTS),
        },
      },
      metadata: {
        type: 'org_subscription',
        organization_id: org.id,
        seat_cap: String(seatCap),
        per_seat_cents: String(PER_SEAT_CENTS),
      },
      success_url: `${PUBLIC_SITE_URL}/dashboard/provider?subscribed=1`,
      cancel_url: `${PUBLIC_SITE_URL}/dashboard/provider?subscribe=cancel`,
    });

    return new Response(JSON.stringify({
      ok: true,
      url: session.url,
      session_id: session.id,
      monthly_cents: monthlyCents,
      seat_cap: seatCap,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[create-org-subscription-checkout]', e?.message);
    return new Response(JSON.stringify({ error: 'unhandled', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
