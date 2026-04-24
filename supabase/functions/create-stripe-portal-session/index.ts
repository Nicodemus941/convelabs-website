/**
 * CREATE-STRIPE-PORTAL-SESSION
 *
 * Returns a Stripe Customer Portal URL for the authenticated provider's
 * org. Used by "Manage subscription" in the provider dashboard to let
 * the org change seat count, update card, download invoices, or cancel.
 *
 * Stripe Customer Portal handles all subscription self-serve actions:
 * upgrade/downgrade plan, update payment method, view invoices, cancel.
 * Zero work for us — just mint the session with the org's stripe_customer_id.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from '../_shared/stripe.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

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
      return new Response(JSON.stringify({ error: 'no_org_scope' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: org } = await admin.from('organizations')
      .select('stripe_customer_id')
      .eq('id', orgId)
      .maybeSingle();

    if (!org?.stripe_customer_id) {
      return new Response(JSON.stringify({
        error: 'no_customer',
        message: 'Your practice does not have a Stripe customer yet. Subscribe first.',
      }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${PUBLIC_SITE_URL}/dashboard/provider`,
    });

    return new Response(JSON.stringify({ ok: true, url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[create-stripe-portal-session]', e?.message);
    return new Response(JSON.stringify({ error: 'unhandled', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
