
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')?.split(' ')[1];
    if (!authHeader) {
      return corsResponse(401, { error: 'Missing authorization header' });
    }

    // Verify the JWT token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader);

    if (authError || !user) {
      return corsResponse(401, { error: 'Invalid authorization token' });
    }

    // Parse the request body
    const { appointmentId, addOns } = await req.json();

    if (!appointmentId || !addOns || !addOns.length) {
      return corsResponse(400, { error: 'Missing required fields' });
    }

    // Fetch appointment to ensure it exists and belongs to the user
    const { data: appointment, error: appointmentError } = await supabaseClient
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .eq('patient_id', user.id)
      .single();

    if (appointmentError || !appointment) {
      return corsResponse(400, { error: 'Invalid appointment ID or unauthorized access' });
    }

    // Create a Stripe checkout session for the add-ons
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: addOns.map(addOn => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: addOn.name,
            description: 'ConveLabs appointment add-on service',
          },
          unit_amount: addOn.price,
        },
        quantity: 1,
      })),
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/dashboard/appointment-details?id=${appointmentId}&payment_success=true`,
      cancel_url: `${req.headers.get('origin')}/dashboard/appointment-details?id=${appointmentId}`,
      metadata: {
        appointment_id: appointmentId,
        user_id: user.id,
      },
    });

    // Return the session ID to the client
    return corsResponse(200, { sessionId: session.id });

  } catch (error) {
    console.error('Error creating add-on checkout session:', error);
    return corsResponse(500, { error: 'Failed to create add-on checkout session' });
  }
});
