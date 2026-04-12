
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0';
import Stripe from 'https://esm.sh/stripe@12.4.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Get the request body
    const { tierId, userId, organizationName, returnUrl } = await req.json();
    
    if (!tierId || !userId) {
      return new Response(
        JSON.stringify({ error: 'Tier ID and user ID are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Get the subscription tier details
    const { data: tier, error: tierError } = await supabaseClient
      .from('tenant_subscription_tiers')
      .select('*')
      .eq('id', tierId)
      .single();

    if (tierError || !tier) {
      return new Response(
        JSON.stringify({ error: 'Subscription tier not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user details
    const { data: userData, error: userError } = await supabaseClient.auth.admin.getUserById(userId);
    
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if the customer already exists
    let customerId: string | undefined = undefined;
    const { data: customers } = await stripe.customers.search({
      query: `email:'${userData.user.email}'`,
    });

    if (customers && customers.length > 0) {
      customerId = customers[0].id;
    } else {
      // Create a new customer in Stripe
      const customer = await stripe.customers.create({
        email: userData.user.email,
        name: userData.user.user_metadata?.full_name || organizationName,
        metadata: {
          user_id: userId,
          organization_name: organizationName
        }
      });
      customerId = customer.id;
    }

    // Create a subscription price in Stripe
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: tier.monthly_price,
      recurring: { interval: 'month' },
      product_data: {
        name: `${tier.name} Subscription`,
        description: tier.description || `${tier.name} tier subscription for ConveLabs`,
      },
      metadata: {
        tier_id: tier.id
      }
    });

    // Create a checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${returnUrl || req.headers.get('origin')}/tenant-onboarding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/tenant-signup`,
      subscription_data: {
        trial_period_days: 14, // 14-day trial
        metadata: {
          user_id: userId,
          tier_id: tier.id,
          organization_name: organizationName
        }
      },
      metadata: {
        user_id: userId,
        tier_id: tier.id
      }
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating subscription:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
