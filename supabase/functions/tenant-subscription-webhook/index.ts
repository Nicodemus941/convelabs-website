
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0';
import Stripe from 'https://esm.sh/stripe@12.4.0?target=deno';

// This endpoint doesn't need CORS headers because it's not called from the browser

serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Get the signature from the headers
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature header' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the raw request body
    const body = await req.text();
    
    // Verify the event
    let event;
    const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (endpointSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
      } catch (err) {
        return new Response(
          JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else {
      event = JSON.parse(body);
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Get metadata from the session
        const userId = session.metadata?.user_id;
        const tierId = session.metadata?.tier_id;
        
        if (!userId || !tierId) {
          return new Response(
            JSON.stringify({ error: 'Missing metadata in checkout session' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Get the subscription from the session
        const subscriptionId = session.subscription;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // Find the tenant associated with this user
        const { data: tenants, error: tenantsError } = await supabaseClient
          .from('tenants')
          .select('*')
          .eq('owner_id', userId);

        if (tenantsError || !tenants || tenants.length === 0) {
          return new Response(
            JSON.stringify({ error: 'No tenant found for this user' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Update the tenant with subscription information
        const { error: updateError } = await supabaseClient
          .from('tenants')
          .update({
            subscription_tier_id: tierId,
            stripe_customer_id: session.customer,
            stripe_subscription_id: subscriptionId,
            subscription_start_date: new Date().toISOString(),
            trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
            subscription_status: subscription.status,
            status: 'active',
          })
          .eq('owner_id', userId);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: `Failed to update tenant: ${updateError.message}` }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find the tenant associated with this customer
        const { data: tenants, error: tenantsError } = await supabaseClient
          .from('tenants')
          .select('*')
          .eq('stripe_customer_id', customerId);

        if (tenantsError || !tenants || tenants.length === 0) {
          return new Response(
            JSON.stringify({ error: 'No tenant found for this customer' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Update the tenant with subscription information
        const { error: updateError } = await supabaseClient
          .from('tenants')
          .update({
            subscription_status: subscription.status,
            trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
          })
          .eq('stripe_customer_id', customerId);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: `Failed to update tenant: ${updateError.message}` }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find the tenant associated with this customer
        const { data: tenants, error: tenantsError } = await supabaseClient
          .from('tenants')
          .select('*')
          .eq('stripe_customer_id', customerId);

        if (tenantsError || !tenants || tenants.length === 0) {
          return new Response(
            JSON.stringify({ error: 'No tenant found for this customer' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Update the tenant with subscription information
        const { error: updateError } = await supabaseClient
          .from('tenants')
          .update({
            subscription_status: 'canceled',
            stripe_subscription_id: null,
          })
          .eq('stripe_customer_id', customerId);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: `Failed to update tenant: ${updateError.message}` }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }

        break;
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error handling webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
