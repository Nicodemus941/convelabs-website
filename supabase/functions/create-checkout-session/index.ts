
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { stripe } from '../_shared/stripe.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const corsResponse = (status: number, body: any) => {
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
    console.log('Create checkout session function started');
    
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
      return corsResponse(400, { error: 'Invalid request body' });
    }
    
    // ── BOOT-ERROR FIX (Hormozi P0) ─────────────────────────────
    // Old code used `const { billingFrequency, amount }` destructure
    // but later reassigned billingFrequency to 'annual' (line 158) and
    // redeclared `amount` with `let amount, interval` (line 172). Two
    // TS errors that caused Deno to refuse to boot the module. Every
    // Stripe checkout request returned 503. Checkout has been dead
    // since this code was deployed.
    //
    // Fix: split out mutables, drop unused `amount` destructure.
    const {
      planId,
      customerId,
      isConciergePlan,
      patientCount,
      guestCheckoutEmail,
      isSupernovaMember,
      supernovaAddOnId,
      isUpgrade,
      couponCode,
      isGiftPurchase,
      metadata,
    } = requestBody;
    // These get reassigned below (Essential Care forces annual) — must be let
    let billingFrequency: string = requestBody.billingFrequency;
    
    if (!planId) {
      console.error('Missing planId');
      return corsResponse(400, { error: 'Plan ID is required' });
    }
    
    if (!billingFrequency) {
      console.error('Missing billingFrequency');
      return corsResponse(400, { error: 'Billing frequency is required' });
    }

    // For guest checkout, ensure we have an email
    if (isGuestCheckout && guestCheckoutEmail) {
      guestEmail = guestCheckoutEmail;
      console.log('Using provided guest email:', guestEmail);
    } else if (isGuestCheckout) {
      // If no guest email provided, we'll generate a temporary one 
      // This allows us to proceed without an account but still create a checkout
      const tempId = crypto.randomUUID().substring(0, 8);
      guestEmail = `guest_${tempId}@example.com`;
      console.log('Generated temporary guest email:', guestEmail);
    }

    console.log('Request parameters:', { 
      planId, 
      billingFrequency, 
      isConciergePlan, 
      patientCount, 
      isGuestCheckout,
      isSupernovaMember,
      supernovaAddOnId,
      isUpgrade
    });

    // Fetch the membership plan
    let { data: plan, error: planError } = await supabaseClient
      .from('membership_plans')
      .select('id, name, monthly_price, quarterly_price, annual_price, credits_per_year')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      console.error('Invalid plan ID:', planError);
      return corsResponse(400, { error: 'Invalid plan ID' });
    }

    console.log('Found plan:', plan.name);

    // If this is a concierge plan, calculate the price based on patient count
    if (isConciergePlan && patientCount) {
      const { data: pricingData, error: pricingError } = await supabaseClient.rpc(
        'calculate_concierge_pricing',
        { patient_count: patientCount }
      );

      if (pricingError || !pricingData?.[0]) {
        console.error('Failed to calculate concierge pricing:', pricingError);
        return corsResponse(400, { error: 'Failed to calculate concierge pricing' });
      }

      plan.monthly_price = pricingData[0].monthly_price;
      plan.quarterly_price = pricingData[0].quarterly_price;
      plan.annual_price = pricingData[0].annual_price;
      plan.credits_per_year = pricingData[0].credits_per_year;
      
      console.log('Calculated concierge pricing for', patientCount, 'patients');
    }

    // Check if the Supernova deal is still active
    const isSupernovaDealActive = () => {
      const now = new Date();
      const expirationDate = new Date('2025-06-01T00:00:00');
      return now < expirationDate;
    };

    // Check if this is the Essential Care plan - if so, force annual billing.
    // NOTE: billingFrequency is a `let` (see top of fn) specifically so this
    // reassignment compiles. Don't convert it back to const.
    const isEssentialCare = plan.name === 'Essential Care';
    if (isEssentialCare) {
      billingFrequency = 'annually';
      console.log('Essential Care plan selected, forcing annual billing');
    }

    // Apply Supernova discount for annual plans if eligible (not for Essential Care)
    let bonusCredits = 0;
    if (isSupernovaMember && billingFrequency === 'annual' && isSupernovaDealActive() && !isEssentialCare) {
      // Apply 10% extra discount for Supernova members
      plan.annual_price = Math.round(plan.annual_price * 0.9);
      bonusCredits = 1; // Add 1 bonus credit
      console.log('Applied Supernova discount and bonus credit');
    }

    // Determine the price based on billing frequency
    let amount, interval;
    if (billingFrequency === 'monthly') {
      amount = plan.monthly_price;
      interval = 'month';
    } else if (billingFrequency === 'quarterly') {
      amount = plan.quarterly_price;
      interval = 'quarter';
    } else {
      amount = plan.annual_price;
      interval = 'year';
    }

    console.log('Determined price:', amount, 'for interval:', interval);

    // Create or retrieve the Stripe customer
    let stripeCustomer;
    try {
      if (customerId) {
        stripeCustomer = customerId;
      } else if (user) {
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
      return corsResponse(500, { error: 'Failed to create customer' });
    }
    
    // NOTE (2026-04-19): removed the pre-Aug-1-2025 launch-window check.
    // "Founding Member" status is now determined server-side via the
    // Founding 50 seat-claim RPC in stripe-webhook (claim_founding_seat),
    // not a date window. Membership begins the moment payment clears —
    // no more "begins August 1st" messaging anywhere.
    const isFoundingMember = false; // kept only to satisfy downstream references; stale concept
    console.log('Legacy isFoundingMember flag (unused — real check now in webhook):', isFoundingMember);

    // Define success and cancel URLs with origin or fallback
    const origin = req.headers.get('origin') || 'https://www.convelabs.com';
    const successUrl = `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&upgrade=${isUpgrade ? 'true' : 'false'}`;
    const cancelUrl = `${origin}/pricing`;
    
    console.log('Redirect URLs:', { successUrl, cancelUrl });

    // All plans are now subscription-based
    const mode = 'subscription';
    console.log('Using payment mode:', mode);

    // Fetch the selected add-on details if an add-on ID was provided
    let selectedAddOn = null;
    if (supernovaAddOnId) {
      const { data: addOn, error: addOnError } = await supabaseClient
        .from('add_on_prices')
        .select('*')
        .eq('id', supernovaAddOnId)
        .single();
        
      if (!addOnError && addOn) {
        selectedAddOn = addOn;
        console.log('Found selected add-on:', addOn.name, 'with price:', addOn.price);
      }
    }

    // Create a Stripe checkout session
    try {
      // Prepare line items starting with the main membership plan
      const lineItems = [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${isEssentialCare ? 'Essential Care: ' : (isSupernovaMember && billingFrequency === 'annual' && !isEssentialCare) ? 'Supernova: ' : ''}${isUpgrade ? 'Upgrade to ' : ''}${plan.name} Membership (${billingFrequency})`,
              description: isConciergePlan
                ? `Concierge plan with ${patientCount} patients, ${plan.credits_per_year} credits/year`
                : `${plan.name} membership · ${plan.credits_per_year}${bonusCredits > 0 ? ' + ' + bonusCredits + ' bonus' : ''} credits/year · active immediately upon payment`,
            },
            unit_amount: amount,
            recurring: {
              interval: interval === 'quarter' ? 'month' : interval,
              interval_count: interval === 'quarter' ? 3 : 1,
            },
          },
          quantity: 1,
        },
      ];

      // Add selected add-on as a separate line item if present
      if (selectedAddOn) {
        // Determine if add-on is free (for Supernova members with annual billing) or paid
        const addOnPrice = (isSupernovaMember && billingFrequency === 'annual' && isSupernovaDealActive() && !isEssentialCare) 
          ? 0  // Free for eligible Supernova members
          : selectedAddOn.price;  // Regular price otherwise

        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: selectedAddOn.name,
              description: `Add-on: ${selectedAddOn.description || selectedAddOn.name}`,
            },
            unit_amount: addOnPrice,
            recurring: {
              interval: interval === 'quarter' ? 'month' : interval,
              interval_count: interval === 'quarter' ? 3 : 1,
            },
          },
          quantity: 1,
        });

        console.log(`Added ${selectedAddOn.name} add-on to checkout with price: ${addOnPrice}`);
      }

      // Create the session configuration with our line items
      let sessionConfig = {
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: mode,
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: stripeCustomer,
        metadata: {
          user_id: user?.id || 'guest',
          plan_id: planId,
          billing_frequency: billingFrequency,
          is_concierge_plan: isConciergePlan ? 'true' : 'false',
          patient_count: patientCount?.toString() || '0',
          founding_member: isFoundingMember ? 'true' : 'false',
          is_guest_checkout: isGuestCheckout ? 'true' : 'false',
          guest_email: isGuestCheckout ? guestEmail : null,
          is_supernova_member: isSupernovaMember && billingFrequency === 'annual' && !isEssentialCare ? 'true' : 'false',
          bonus_credits: bonusCredits.toString(),
          promotion_locked_price: isSupernovaMember && billingFrequency === 'annual' && !isEssentialCare ? amount.toString() : null,
          selected_add_on_id: selectedAddOn?.id || null,
          is_upgrade: isUpgrade ? 'true' : 'false',
          is_essential_care: isEssentialCare ? 'true' : 'false',
          // Signed membership_agreements row id — stripe-webhook uses this to
          // link the agreement to the activated membership after checkout.
          agreement_id: (requestBody?.metadata?.agreement_id as string) || null,
          agreement_version: (requestBody?.metadata?.agreement_version as string) || null
        },
      };

      const session = await stripe.checkout.sessions.create(sessionConfig);

      console.log('Created checkout session:', session.id);

      // Return both the session ID and the URL to give the client options
      return corsResponse(200, { 
        sessionId: session.id, 
        url: session.url,
        isGuestCheckout 
      });

    } catch (error) {
      console.error('Error creating Stripe checkout session:', error);
      return corsResponse(500, { error: 'Failed to create checkout session' });
    }
  } catch (error) {
    console.error('Unexpected error in create-checkout-session:', error);
    return corsResponse(500, { error: 'An unexpected error occurred' });
  }
});
