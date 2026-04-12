
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

    if (!user) {
      throw new Error("No authenticated user found");
    }

    // Parse request body
    const { sessionId } = await req.json();
    
    if (!sessionId) {
      throw new Error("Missing sessionId parameter");
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    // Retrieve checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    if (session.payment_status !== "paid") {
      throw new Error("Payment not completed");
    }

    // Extract payment information
    const paymentInfo = {
      customer_id: session.customer?.id,
      amount_total: session.amount_total,
      practice_name: session.metadata?.practiceId,
      num_patients: session.metadata?.numPatients,
      subscription_id: session.subscription?.id,
    };

    // Update enrollment status in database
    await supabaseClient.from("concierge_enrollments").update({
      status: "active",
      stripe_subscription_id: session.subscription?.id,
    }).eq("stripe_session_id", sessionId);

    // Create user roles entry for concierge doctor
    await supabaseClient.from("user_roles").insert({
      user_id: user.id,
      role: "concierge_doctor"
    }).select();

    // Return success response with payment details
    return new Response(
      JSON.stringify({
        success: true,
        paymentInfo,
        message: "Payment successfully verified",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Verification error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Payment verification failed",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
