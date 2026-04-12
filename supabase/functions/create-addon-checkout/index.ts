
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { stripe } from '../_shared/stripe.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const corsResponse = (status: number, body: any) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Create add-on checkout session function started');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Authorization is required for add-on purchases
    const authHeader = req.headers.get('Authorization')?.split(' ')[1];
    if (!authHeader) {
      return corsResponse(401, { error: 'Authentication required' });
    }

    // Verify the JWT token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader);

    if (authError || !user) {
      console.log('Auth token invalid:', authError);
      return corsResponse(401, { error: 'Invalid authentication' });
    }
    
    console.log('User authenticated:', user.id);

    // Parse the request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (error) {
      console.error('Failed to parse request body:', error);
      return corsResponse(400, { error: 'Invalid request body' });
    }
    
    const { 
      addOnId, 
      billingFrequency = 'monthly' // Default to monthly if not specified
    } = requestBody;
    
    if (!addOnId) {
      console.error('Missing addOnId');
      return corsResponse(400, { error: 'Add-on ID is required' });
    }

    // Fetch the add-on details
    const { data: addOn, error: addOnError } = await supabaseClient
      .from('add_on_prices')
      .select('*')
      .eq('id', addOnId)
      .single();
      
    if (addOnError || !addOn) {
      console.error('Invalid add-on ID:', addOnError);
      return corsResponse(400, { error: 'Invalid add-on ID' });
    }
    
    console.log('Found add-on:', addOn.name);
    
    // Find user's existing membership to match billing frequency
    const { data: userMembership, error: membershipError } = await supabaseClient
      .from('user_memberships')
      .select('billing_frequency, stripe_customer_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
      
    if (membershipError) {
      console.error('Error fetching user membership:', membershipError);
      // Continue anyway, we'll use the provided billing frequency
    }
    
    // Use the user's existing membership billing frequency if available
    const effectiveBillingFrequency = userMembership?.billing_frequency || billingFrequency;
    console.log('Using billing frequency:', effectiveBillingFrequency);
    
    // Find or create Stripe customer
    let stripeCustomerId = userMembership?.stripe_customer_id;
    
    if (!stripeCustomerId) {
      // Look up customer by user email
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1
      });
      
      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id;
        console.log('Found existing Stripe customer for email:', user.email);
      } else {
        // Create new customer for authenticated user
        const customerResponse = await stripe.customers.create({
          email: user.email,
          metadata: {
            supabase_user_id: user.id,
          }
        });
        stripeCustomerId = customerResponse.id;
        console.log('Created new Stripe customer for authenticated user');
      }
    }

    // Define interval based on billing frequency
    let amount = addOn.price;
    let interval = 'month';
    let intervalCount = 1;
    
    if (effectiveBillingFrequency === 'quarterly') {
      interval = 'month';
      intervalCount = 3;
      // Adjust price for quarterly billing (3x monthly price with small discount)
      amount = Math.floor(addOn.price * 2.9); // 3% discount for quarterly
    } else if (effectiveBillingFrequency === 'annual') {
      interval = 'year';
      // Adjust price for annual billing (12x monthly price with larger discount)
      amount = Math.floor(addOn.price * 10.8); // 10% discount for annual
    }

    // Define success and cancel URLs with origin or fallback
    const origin = req.headers.get('origin') || 'https://www.convelabs.com';
    const successUrl = `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&addon=true`;
    const cancelUrl = `${origin}/membership`;

    // Create a Stripe checkout session
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${addOn.name} (${effectiveBillingFrequency})`,
                description: addOn.description || `Add-on subscription: ${addOn.name}`,
              },
              unit_amount: amount,
              recurring: {
                interval,
                interval_count: intervalCount,
              }
            },
            quantity: 1,
          }
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: stripeCustomerId,
        metadata: {
          user_id: user.id,
          add_on_id: addOnId,
          billing_frequency: effectiveBillingFrequency,
          is_addon_purchase: 'true'
        },
      });

      console.log('Created add-on checkout session:', session.id);

      // Return both the session ID and the URL
      return corsResponse(200, { 
        sessionId: session.id, 
        url: session.url
      });

    } catch (error) {
      console.error('Error creating Stripe checkout session for add-on:', error);
      return corsResponse(500, { error: 'Failed to create checkout session' });
    }
  } catch (error) {
    console.error('Unexpected error in create-addon-checkout:', error);
    return corsResponse(500, { error: 'An unexpected error occurred' });
  }
});
