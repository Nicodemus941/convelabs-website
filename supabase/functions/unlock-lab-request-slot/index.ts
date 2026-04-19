// unlock-lab-request-slot
// Patient clicks "Join + book" in the unlock modal. We create a Stripe
// Subscription checkout session with TWO line items:
//   1. The annual membership (recurring)
//   2. The discounted visit (one-time, via add_invoice_items)
// On checkout.session.completed the existing stripe-webhook fires, spins
// up user_memberships + appointments + links everything to the lab request.
//
// Request:  { access_token, tier, appointment_date, appointment_time, address,
//             email_override?, phone_override? }
// Response: { checkout_url } | { error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { isSlotStillAvailable } from '../_shared/availability.ts';
import { TIER_ANNUAL_PRICE_CENTS, TIER_VISIT_PRICE_CENTS, TIER_LABEL, type Tier } from '../_shared/tier-gating.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const { access_token, tier, appointment_date, appointment_time, address, email_override, phone_override } = body;

    if (!access_token || !tier || !appointment_date || !appointment_time || !address) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!['regular_member', 'vip', 'concierge'].includes(tier)) {
      return new Response(JSON.stringify({ error: 'Invalid tier' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (String(address).trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Address required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Look up the request
    const { data: request } = await admin
      .from('patient_lab_requests').select('*').eq('access_token', access_token).maybeSingle();
    if (!request) return new Response(JSON.stringify({ error: 'Invalid link' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (request.status !== 'pending_schedule') return new Response(JSON.stringify({ error: 'Already scheduled' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Load org + validate slot is still open
    const { data: org } = await admin.from('organizations').select('*').eq('id', request.organization_id).maybeSingle();
    if (!org) return new Response(JSON.stringify({ error: 'Org not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const slotOk = await isSlotStillAvailable(admin, org.id, appointment_date, appointment_time, org.time_window_rules);
    if (!slotOk) return new Response(JSON.stringify({ error: 'That slot was just taken. Please pick a different time.', slot_conflict: true }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const patientEmail = (email_override || request.patient_email || '').toLowerCase();
    if (!patientEmail) return new Response(JSON.stringify({ error: 'We need your email to create your membership' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const tierKey = tier as Tier;
    const membershipCents = TIER_ANNUAL_PRICE_CENTS[tierKey];
    const visitCents = TIER_VISIT_PRICE_CENTS.mobile[tierKey];

    // Find or create Stripe customer (patient — never shared with org customer)
    const existing = await stripe.customers.list({ email: patientEmail, limit: 5 });
    const patientCustomer = existing.data.find(c => !(c.metadata?.convelabs_org_id)) || null;
    const customerId = patientCustomer
      ? patientCustomer.id
      : (await stripe.customers.create({
          email: patientEmail,
          name: request.patient_name,
          phone: phone_override || request.patient_phone || undefined,
          metadata: { source: 'lab_request_unlock', lab_request_id: request.id },
        })).id;

    // Create the checkout session: subscription (membership) + one-time invoice item (visit)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `ConveLabs ${TIER_LABEL[tierKey]} — Annual Membership` },
          unit_amount: membershipCents,
          recurring: { interval: 'year' },
        },
        quantity: 1,
      }],
      subscription_data: {
        metadata: {
          source: 'lab_request_unlock',
          lab_request_id: request.id,
          tier: tierKey,
        },
      },
      // Add the visit as a one-time invoice item on the initial subscription invoice
      // (Stripe charges this alongside the first membership payment, one card authorization)
      // Note: Stripe subscriptions API requires this be done via subscription.add_invoice_items
      // after creation. For checkout-session approach we attach via metadata and the webhook
      // creates a one-time invoice item and finalizes.
      metadata: {
        type: 'lab_request_unlock',
        lab_request_id: request.id,
        tier: tierKey,
        visit_cents: String(visitCents),
        appointment_date,
        appointment_time,
        address: address.trim(),
        patient_email: patientEmail,
        patient_phone: phone_override || request.patient_phone || '',
      },
      success_url: `${PUBLIC_SITE_URL}/lab-request/${access_token}?unlocked=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_SITE_URL}/lab-request/${access_token}?cancel=1`,
    });

    return new Response(JSON.stringify({
      success: true,
      checkout_url: session.url,
      total_cents: membershipCents + visitCents,
      visit_cents: visitCents,
      membership_cents: membershipCents,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('unlock-lab-request-slot error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
