import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from '../_shared/stripe.ts';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      serviceType,
      serviceName,
      amount, // in cents
      tipAmount = 0, // in cents
      appointmentDate,
      appointmentTime,
      patientDetails,
      locationDetails,
      serviceDetails,
      userId,
    } = await req.json();

    if (!amount || !appointmentDate || !patientDetails) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine the origin for success/cancel URLs
    const origin = req.headers.get('origin') || 'https://convelabs-website.vercel.app';

    // Create or find Stripe customer
    const customerEmail = patientDetails.email;
    const customerName = `${patientDetails.firstName} ${patientDetails.lastName}`;

    let customerId: string | undefined;

    if (customerEmail) {
      // Search for existing customer
      const existingCustomers = await stripe.customers.list({
        email: customerEmail,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email: customerEmail,
          name: customerName,
          phone: patientDetails.phone || undefined,
          metadata: {
            supabase_user_id: userId || '',
            source: 'appointment_booking',
          },
        });
        customerId = customer.id;
      }
    }

    // Build line items
    const lineItems: any[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: serviceName || 'Blood Draw Service',
            description: `Appointment on ${appointmentDate}`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ];

    // Add tip as separate line item if provided
    if (tipAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Gratuity',
            description: 'Tip for your phlebotomist',
          },
          unit_amount: tipAmount,
        },
        quantity: 1,
      });
    }

    // Store all appointment data in metadata for the webhook
    const metadata: Record<string, string> = {
      type: 'appointment_payment',
      service_type: serviceType || '',
      service_name: serviceName || '',
      service_price: String(amount),
      tip_amount: String(tipAmount),
      appointment_date: appointmentDate,
      appointment_time: appointmentTime || '',
      patient_first_name: patientDetails.firstName || '',
      patient_last_name: patientDetails.lastName || '',
      patient_email: patientDetails.email || '',
      patient_phone: patientDetails.phone || '',
      address: locationDetails?.address || '',
      city: locationDetails?.city || '',
      state: locationDetails?.state || '',
      zip_code: locationDetails?.zipCode || '',
      location_type: locationDetails?.locationType || '',
      apt_unit: locationDetails?.aptUnit || '',
      gate_code: locationDetails?.gateCode || '',
      instructions: (locationDetails?.instructions || '').substring(0, 500),
      same_day: String(serviceDetails?.sameDay || false),
      weekend: String(serviceDetails?.weekend || false),
      additional_notes: (serviceDetails?.additionalNotes || '').substring(0, 500),
      user_id: userId || '',
    };

    // Create the checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: lineItems,
      metadata,
      payment_intent_data: {
        metadata,
      },
      success_url: `${origin}/book-now?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/book-now?status=cancel`,
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error creating appointment checkout:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
