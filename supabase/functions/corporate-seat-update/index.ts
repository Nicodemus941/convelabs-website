import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/*
  corporate-seat-update (REFACTORED for ConveLabs only)
  - Authenticated admins can set exact seat counts for ConveLabs
  - Updates the Stripe subscription quantities for:
    • Corporate Seat (base)
    • Executive Upgrade (add-on)
  - Proration is enabled so mid-cycle changes are billed fairly
*/

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey || !stripeKey) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { totalSeats, executiveSeats } = await req.json();

    if (typeof totalSeats !== "number" || totalSeats < 0 || typeof executiveSeats !== "number" || executiveSeats < 0) {
      return new Response(JSON.stringify({ error: "totalSeats and executiveSeats are required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Check if user has admin role
    const userRole = userData.user.user_metadata?.role;
    const allowedRoles = ["super_admin", "admin", "office_manager", "billing"];
    if (!allowedRoles.includes(userRole)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // ConveLabs master subscription details (from environment)
    const stripeCustomerId = Deno.env.get("CONVELABS_STRIPE_CUSTOMER_ID");
    const stripeSubscriptionId = Deno.env.get("CONVELABS_STRIPE_SUBSCRIPTION_ID");

    if (!stripeCustomerId || !stripeSubscriptionId) {
      return new Response(JSON.stringify({ error: "ConveLabs Stripe configuration not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Your specific price IDs
    const corporateSeatPriceId = "price_1RvLuEPkqQlqZwYPjP5VsSHl";
    const executiveUpgradePriceId = "price_1RvLwHPkqQlqZwYPP0BMoPzi";

    // Retrieve subscription with expanded prices to find existing items
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["items.data.price"],
    });

    // Helper to find existing items by price ID
    const findItemByPrice = (priceId: string) =>
      subscription.items.data.find((item) => item.price.id === priceId);

    const seatItem = findItemByPrice(corporateSeatPriceId);
    const execItem = findItemByPrice(executiveUpgradePriceId);

    const items: Stripe.SubscriptionUpdateParams.Item[] = [];

    // Update Corporate Seat quantity
    if (seatItem) {
      items.push({ id: seatItem.id, quantity: totalSeats });
    } else if (totalSeats > 0) {
      items.push({
        price: corporateSeatPriceId,
        quantity: totalSeats,
      });
    }

    // Update Executive Upgrade quantity  
    if (execItem) {
      items.push({ id: execItem.id, quantity: executiveSeats });
    } else if (executiveSeats > 0) {
      items.push({
        price: executiveUpgradePriceId,
        quantity: executiveSeats,
      });
    }

    if (items.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No changes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
      items,
      proration_behavior: "create_prorations",
      metadata: { organization: "ConveLabs" },
    });

    return new Response(
      JSON.stringify({ success: true, subscriptionId: updated.id, current_period_end: updated.current_period_end }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[corporate-seat-update] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});