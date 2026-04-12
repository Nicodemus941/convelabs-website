
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Define CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey) {
      throw new Error("Missing environment variables");
    }

    // Initialize Supabase client with authorization from request
    const authHeader = req.headers.get("Authorization");
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader || "" } },
      auth: { persistSession: false },
    });

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError) {
      throw new Error(`Authentication error: ${userError.message}`);
    }

    // Parse request body
    const { practiceName, fullName, email, phone, numPatients, additionalInfo } = await req.json();
    
    if (!practiceName || !fullName || !email || !numPatients) {
      throw new Error("Missing required fields");
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    // Calculate price based on number of patients
    const monthlyRate = 80; // $80 per patient per month
    const unitAmount = monthlyRate * 100; // Convert to cents
    const monthlyTotal = monthlyRate * numPatients;

    // Create or retrieve Stripe customer
    let customerId: string;
    const customers = await stripe.customers.list({ email, limit: 1 });
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      // Update customer data
      await stripe.customers.update(customerId, {
        name: fullName,
        phone: phone || undefined,
        metadata: {
          practice_name: practiceName,
          num_patients: numPatients.toString(),
        },
      });
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        email,
        name: fullName,
        phone: phone || undefined,
        metadata: {
          practice_name: practiceName,
          num_patients: numPatients.toString(),
          user_id: user?.id || "guest",
          additional_info: additionalInfo || "",
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Concierge Doctor Membership",
              description: `${numPatients} patients with 12 lab services each per year`,
            },
            unit_amount: unitAmount,
            recurring: {
              interval: "month",
            },
          },
          quantity: numPatients,
        },
      ],
      mode: "subscription",
      success_url: `${req.headers.get("origin")}/concierge-onboarding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/pricing#pricing-tabs`,
      metadata: {
        practiceId: practiceName,
        physicianName: fullName,
        numPatients: numPatients.toString(),
        user_id: user?.id || "pending",
        monthly_total: monthlyTotal.toString(),
      },
    });

    // Store enrollment information in Supabase
    if (user) {
      await supabaseClient.from("concierge_enrollments").insert({
        user_id: user.id,
        practice_name: practiceName,
        physician_name: fullName,
        email,
        phone,
        num_patients: numPatients,
        monthly_rate: monthlyRate,
        total_monthly: monthlyTotal,
        stripe_customer_id: customerId,
        stripe_session_id: session.id,
        additional_info: additionalInfo,
        status: "pending",
      });

      // Update user metadata
      await supabaseClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          practice_name: practiceName,
          user_type: "concierge_doctor",
          num_patients: numPatients,
        },
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
