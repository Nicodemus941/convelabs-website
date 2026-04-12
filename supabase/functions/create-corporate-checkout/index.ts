import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/*
  create-corporate-checkout
  - Creates a Stripe Checkout session (mode: subscription) for corporate seat-based billing
  - Base seat: $99/employee/month (annual: 10% off -> 12 months * 0.9)
  - Executive upgrade add-on: $29/seat/month (annual: 10% off)
  - Overage per service (not billed here): $150/service — stored as metadata
  - Seat additions should be prorated (Stripe handles proration on subsequent subscription updates)
*/

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey || !stripeKey) {
    return new Response(
      JSON.stringify({ error: "Missing required server configuration" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
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
      return new Response(JSON.stringify({ error: "User authentication failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const body = await req.json();
    const {
      tenantId,
      seats = 0,
      executiveSeats = 0,
      billingFrequency = "monthly", // 'monthly' | 'annual'
      returnUrl,
    } = body || {};

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenantId is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Verify requester belongs to the tenant (admin/billing/owner recommended)
    const { data: membership, error: membershipErr } = await supabase
      .from("user_tenants")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (membershipErr || !membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // Fetch tenant to get stripe_customer_id and contact email
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, name, contact_email, stripe_customer_id, corporate_overage_price")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Ensure a Stripe customer exists for this tenant
    let customerId = tenant.stripe_customer_id || undefined;
    if (!customerId) {
      // Try to locate by email first
      let email = tenant.contact_email || userData.user.email || undefined;
      if (email) {
        const existing = await stripe.customers.list({ email, limit: 1 });
        if (existing.data.length > 0) {
          customerId = existing.data[0].id;
        }
      }
      if (!customerId) {
        const created = await stripe.customers.create({
          email: tenant.contact_email || userData.user.email || undefined,
          name: tenant.name || undefined,
          metadata: { tenantId },
        });
        customerId = created.id;
      }
      // Persist customer id
      await supabase.from("tenants").update({ stripe_customer_id: customerId }).eq("id", tenantId);
    }

    // Use your specific Stripe price IDs
    const isAnnual = billingFrequency === "annual";
    
    // Your price IDs for Corporate Seat (monthly & annual)
    const corporateSeatPriceId = "price_1RvLuEPkqQlqZwYPjP5VsSHl";
    // Your price ID for Executive Upgrade (monthly & annual)  
    const executiveUpgradePriceId = "price_1RvLwHPkqQlqZwYPP0BMoPzi";

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    if (seats > 0) {
      line_items.push({
        price: corporateSeatPriceId,
        quantity: seats,
      });
    }

    if (executiveSeats > 0) {
      line_items.push({
        price: executiveUpgradePriceId,
        quantity: executiveSeats,
      });
    }

    if (line_items.length === 0) {
      return new Response(JSON.stringify({ error: "At least one seat is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const origin = req.headers.get("origin") || "https://yluyonhrxxtyuiyrdixl.supabase.co";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items,
      success_url: (returnUrl || `${origin}/tenant/billing/success`) + `?tenantId=${tenantId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: (returnUrl || `${origin}/tenant/billing/canceled`) + `?tenantId=${tenantId}`,
      allow_promotion_codes: true,
      metadata: {
        tenantId,
        plan_type: "corporate",
        seats: String(seats),
        executive_seats: String(executiveSeats),
        billing_frequency: billingFrequency,
        overage_price_cents: String(tenant.corporate_overage_price || 15000),
      },
      subscription_data: {
        metadata: {
          tenantId,
          plan_type: "corporate",
          overage_price_cents: String(tenant.corporate_overage_price || 15000),
        },
        proration_behavior: "create_prorations", // future quantity changes will prorate by default via API
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[create-corporate-checkout] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
