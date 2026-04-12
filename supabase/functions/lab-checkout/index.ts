
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')?.split(' ')[1];
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify the JWT token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization token' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse the request body
    const { orderId, tests } = await req.json();

    if (!orderId || !tests || tests.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid request data' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify that the order belongs to the user
    const { data: order, error: orderError } = await supabaseClient
      .from('lab_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Invalid order or unauthorized' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create a Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: tests.map(test => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: test.name,
            description: `Lab test: ${test.name}`,
          },
          unit_amount: test.price,
        },
        quantity: 1,
      })),
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/dashboard/lab-order-success?order_id=${orderId}`,
      cancel_url: `${req.headers.get('origin')}/lab-store`,
      customer_email: user.email,
      metadata: {
        order_id: orderId,
        user_id: user.id,
      },
    });

    // Update order with payment intent ID
    if (session.payment_intent) {
      await supabaseClient
        .from('lab_orders')
        .update({ payment_intent_id: session.payment_intent.toString() })
        .eq('id', orderId);
    }

    // Send notification email to orders@convelabs.com
    await sendOrderNotificationEmail(user, tests, orderId);

    // Return both the session ID and URL to the client
    return new Response(JSON.stringify({ 
      sessionId: session.id,
      url: session.url 
    }), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing lab test checkout:', error);
    return new Response(JSON.stringify({ error: 'Failed to process lab test checkout' }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function sendOrderNotificationEmail(user, tests, orderId) {
  // This is a placeholder for sending an email notification
  // In a production environment, you would integrate with an email service
  console.log(`
    New lab order ${orderId} from ${user.email}:
    Tests ordered:
    ${tests.map(test => `- ${test.name}: $${(test.price / 100).toFixed(2)}`).join('\n')}
    Total: $${(tests.reduce((total, test) => total + test.price, 0) / 100).toFixed(2)}
  `);

  // In production, replace with actual email sending code
  return true;
}
