
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { stripe } from '../_shared/stripe.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Create partnership checkout session function started');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let user = null;
    let isGuestCheckout = false;
    let guestEmail = null;

    // Try to get the authorization header from the request
    const authHeader = req.headers.get('Authorization')?.split(' ')[1];
    if (authHeader) {
      // If we have an auth header, verify the JWT token
      const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser(authHeader);

      if (!authError && authUser) {
        console.log('User authenticated:', authUser.id);
        user = authUser;
      } else {
        console.log('Auth token provided but invalid:', authError);
        isGuestCheckout = true;
      }
    } else {
      console.log('No authorization header, proceeding as guest checkout');
      isGuestCheckout = true;
    }

    // Parse the request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (error) {
      console.error('Failed to parse request body:', error);
      return new Response(JSON.stringify({ error: 'Invalid request body' }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    
    const { 
      planId, 
      billingFrequency,
      amount,
      metadata,
      guestCheckoutEmail
    } = requestBody;
    
    if (!planId) {
      console.error('Missing planId');
      return new Response(JSON.stringify({ error: 'Plan ID is required' }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    
    // For guest checkout, ensure we have an email
    if (isGuestCheckout) {
      guestEmail = guestCheckoutEmail || 'guest@placeholder.com';
      console.log('Using guest email:', guestEmail);
    }

    console.log('Request parameters:', { planId, billingFrequency, amount, isGuestCheckout });

    // Partnership plans are fixed and not in the database
    const partnershipPlans = {
      'standard-package': {
        name: 'Standard Package',
        price: 5000,
        maintenance_fee: 400,
      },
      'express-package': {
        name: 'Express Package',
        price: 10000,
        maintenance_fee: 400,
      },
    };

    const plan = partnershipPlans[planId];
    if (!plan) {
      console.error('Invalid partnership plan ID:', planId);
      return new Response(JSON.stringify({ error: 'Invalid partnership plan ID' }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    console.log('Found plan:', plan.name);

    // Create or retrieve the Stripe customer
    let stripeCustomer;
    try {
      if (user) {
        // Look up customer by user email
        const customers = await stripe.customers.list({
          email: user.email,
          limit: 1
        });
        
        if (customers.data.length > 0) {
          stripeCustomer = customers.data[0].id;
          console.log('Found existing Stripe customer for email:', user.email);
        } else {
          // Create new customer for authenticated user
          const customerResponse = await stripe.customers.create({
            email: user.email,
            metadata: {
              supabase_user_id: user.id,
            }
          });
          stripeCustomer = customerResponse.id;
          console.log('Created new Stripe customer for authenticated user');
        }
      } else if (isGuestCheckout && guestEmail) {
        // Create a guest customer with the provided/generated email
        const customerResponse = await stripe.customers.create({
          email: guestEmail,
          metadata: {
            is_guest: 'true'
          }
        });
        stripeCustomer = customerResponse.id;
        console.log('Created guest Stripe customer with email:', guestEmail);
      }
      
      console.log('Using Stripe customer:', stripeCustomer);
    } catch (error) {
      console.error('Error creating/retrieving Stripe customer:', error);
      return new Response(JSON.stringify({ error: 'Failed to create customer' }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    // Define success and cancel URLs with origin or fallback
    const origin = req.headers.get('origin') || 'https://www.convelabs.com';
    const successUrl = `${origin}/partnership-success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/partnerships`;
    
    console.log('Redirect URLs:', { successUrl, cancelUrl });

    // Create a Stripe checkout session for partnership
    try {
      // Use the amount provided in the request or fallback to the plan price
      const finalAmount = amount || plan.price;
      
      let sessionConfig = {
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${plan.name} - One-time Setup Fee`,
                description: `Initial setup fee for ${plan.name} partnership software`,
              },
              unit_amount: finalAmount,
            },
            quantity: 1,
          },
          // Include maintenance fee as a subscription
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Monthly Maintenance Fee',
                description: 'Ongoing support and maintenance for your software platform',
              },
              unit_amount: plan.maintenance_fee,
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: stripeCustomer,
        metadata: {
          ...metadata,
          partnership_plan: planId,
          user_id: user?.id || 'guest',
          is_guest_checkout: isGuestCheckout ? 'true' : 'false',
          guest_email: isGuestCheckout ? guestEmail : null,
        },
      };

      const session = await stripe.checkout.sessions.create(sessionConfig);

      console.log('Created partnership checkout session:', session.id);

      // Return both the session ID and the URL to give the client options
      return new Response(JSON.stringify({ 
        sessionId: session.id, 
        url: session.url,
        isGuestCheckout 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } catch (error) {
      console.error('Error creating Stripe checkout session:', error);
      return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }
  } catch (error) {
    console.error('Unexpected error in create-partnership-checkout:', error);
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
