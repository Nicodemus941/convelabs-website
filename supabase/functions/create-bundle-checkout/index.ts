/**
 * CREATE BUNDLE CHECKOUT
 *
 * Sprint 4: produce a single Stripe Checkout session for a prepaid visit_bundle
 * series so the patient pays upfront for N appointments at a discount. Much
 * better cash flow + show-up rate vs. invoicing each appointment individually.
 *
 * Expected flow:
 *   1. Admin creates recurring series in AdminCalendar with paymentMode=prepaid_bundle
 *   2. Client inserts visit_bundles row (unpaid) + N appointments all linked via
 *      recurrence_group_id + visit_bundle_id
 *   3. Client invokes this fn with { bundleId, patientEmail, ... }
 *   4. This fn creates Stripe Checkout for the total amount, stashes
 *      stripe_checkout_session_id on the visit_bundles row
 *   5. Returns the Stripe URL for the admin to open/send
 *
 * stripe-webhook should be updated to mark the bundle paid when
 * type=bundle_payment metadata is seen.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { stripe } from '../_shared/stripe.ts';
import { corsHeaders } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const {
      bundleId,
      patientEmail,
      patientName,
      serviceName,
      amountCents,
      occurrences,
      startDate,
    } = await req.json();

    if (!bundleId || !patientEmail || !amountCents) {
      return new Response(
        JSON.stringify({ error: 'bundleId, patientEmail, amountCents required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify bundle exists + not already paid
    const { data: bundle, error: fetchErr } = await supabase
      .from('visit_bundles')
      .select('*')
      .eq('id', bundleId)
      .maybeSingle();
    if (fetchErr || !bundle) {
      return new Response(JSON.stringify({ error: 'Bundle not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if ((bundle as any).stripe_checkout_session_id) {
      return new Response(JSON.stringify({ error: 'Bundle already has a checkout session' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find/create Stripe customer
    let customerId: string | undefined;
    const existing = await stripe.customers.list({ email: patientEmail, limit: 1 });
    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: patientEmail,
        name: patientName || undefined,
      });
      customerId = customer.id;
    }

    const origin = req.headers.get('origin') || 'https://www.convelabs.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: serviceName || `ConveLabs ${occurrences || 'Multi'}-Visit Bundle`,
            description: `Prepaid series${startDate ? ` starting ${startDate}` : ''} — ${occurrences || 'N'} visits.`,
          },
          unit_amount: Math.round(amountCents),
        },
        quantity: 1,
      }],
      metadata: {
        type: 'bundle_payment',
        bundle_id: bundleId,
        patient_email: patientEmail,
        patient_name: patientName || '',
        occurrences: String(occurrences || 0),
        start_date: startDate || '',
      },
      payment_intent_data: {
        metadata: {
          type: 'bundle_payment',
          bundle_id: bundleId,
        },
      },
      success_url: `${origin}/dashboard?bundle=paid`,
      cancel_url: `${origin}/dashboard?bundle=cancel`,
    });

    // Stash the checkout session on the bundle so webhooks + admin view can find it
    await supabase.from('visit_bundles')
      .update({ stripe_checkout_session_id: session.id } as any)
      .eq('id', bundleId);

    return new Response(JSON.stringify({
      url: session.url,
      sessionId: session.id,
      bundleId,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[create-bundle-checkout] error', err);
    return new Response(JSON.stringify({ error: err?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
