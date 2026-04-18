/**
 * CREATE SUBSCRIPTION CHECKOUT — Tier 3 of Sprint 4
 *
 * Starts a Stripe Subscription for a patient who wants recurring labs.
 * Creates a draft recurring_bookings row (is_active=false until Stripe
 * confirms the subscription via the stripe-webhook handler).
 *
 * Hormozi pattern: this is the "subscribe & forget" offer — patient picks
 * their frequency at booking (or from the /visit page), gets 15% off every
 * visit in perpetuity, and a phleb shows up automatically on schedule.
 *
 * POST body:
 *   {
 *     patientEmail, patientName, patientPhone?,
 *     serviceType, serviceName,
 *     frequencyWeeks: 4 | 8 | 12,     // 4=monthly, 8=biweekly-ish, 12=quarterly
 *     preferredDayOfWeek?: 0-6,
 *     preferredTime?: '9:00 AM',
 *     preferredAddress?, preferredCity?, preferredState?, preferredZip?,
 *     perVisitPriceCents,              // list price before discount
 *     discountPercent: 15,
 *     startDate: 'YYYY-MM-DD',         // first visit
 *   }
 *
 * Returns: { url: Stripe checkout URL, subscriptionDraftId }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { stripe } from '../_shared/stripe.ts';
import { corsHeaders } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

function frequencyToInterval(weeks: number): { interval: 'day' | 'week' | 'month'; count: number } {
  if (weeks >= 12) return { interval: 'month', count: 3 };  // quarterly
  if (weeks >= 4)  return { interval: 'month', count: 1 };  // monthly
  return { interval: 'week', count: weeks };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      patientEmail, patientName, patientPhone,
      serviceType, serviceName,
      frequencyWeeks,
      preferredDayOfWeek, preferredTime,
      preferredAddress, preferredCity, preferredState, preferredZip,
      perVisitPriceCents,
      discountPercent = 15,
      startDate,
      userId = null,
    } = body;

    if (!patientEmail || !serviceType || !frequencyWeeks || !perVisitPriceCents || !startDate) {
      return new Response(JSON.stringify({
        error: 'patientEmail, serviceType, frequencyWeeks, perVisitPriceCents, startDate required',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Calculate discounted per-visit price
    const discountedCents = Math.round(perVisitPriceCents * (1 - discountPercent / 100));

    // ── Find or create Stripe customer ─────────────────────────
    let customerId: string;
    const existing = await stripe.customers.list({ email: patientEmail, limit: 1 });
    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else {
      const c = await stripe.customers.create({
        email: patientEmail,
        name: patientName,
        phone: patientPhone,
      });
      customerId = c.id;
    }

    // ── Create the recurring_bookings DRAFT (is_active=false until sub confirms) ──
    const { data: draft, error: draftErr } = await supabase
      .from('recurring_bookings' as any)
      .insert({
        patient_id: userId,
        patient_email: patientEmail.toLowerCase(),
        patient_name: patientName || null,
        patient_phone: patientPhone || null,
        service_type: serviceType,
        service_name: serviceName,
        frequency_weeks: frequencyWeeks,
        preferred_day_of_week: preferredDayOfWeek ?? null,
        preferred_time: preferredTime || null,
        preferred_address: preferredAddress || null,
        preferred_city: preferredCity || null,
        preferred_state: preferredState || null,
        preferred_zip: preferredZip || null,
        next_booking_date: startDate,
        is_active: false,  // flipped to true by stripe-webhook after checkout completes
        stripe_customer_id: customerId,
        per_visit_price_cents: discountedCents,
        discount_percent: discountPercent,
      })
      .select()
      .single();

    if (draftErr || !draft) {
      console.error('[create-subscription-checkout] draft insert failed', draftErr);
      return new Response(JSON.stringify({ error: 'Failed to create subscription draft' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Create Stripe subscription Checkout session ─────────────
    const { interval, count } = frequencyToInterval(frequencyWeeks);

    const origin = req.headers.get('origin') || 'https://www.convelabs.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'usd',
          recurring: { interval, interval_count: count },
          product_data: {
            name: `ConveLabs ${serviceName || 'Lab Visit'} — Recurring ${frequencyWeeks}w`,
            description: `Auto-scheduled every ${frequencyWeeks} weeks. ${discountPercent}% off every visit vs one-off booking.`,
          },
          unit_amount: discountedCents,
        },
        quantity: 1,
      }],
      metadata: {
        type: 'subscription_payment',
        recurring_booking_id: (draft as any).id,
        patient_email: patientEmail,
        patient_name: patientName || '',
        service_type: serviceType,
        frequency_weeks: String(frequencyWeeks),
      },
      subscription_data: {
        metadata: {
          type: 'subscription_payment',
          recurring_booking_id: (draft as any).id,
        },
      },
      success_url: `${origin}/dashboard/patient?subscription=active`,
      cancel_url: `${origin}/dashboard/patient?subscription=cancel`,
    });

    // Stash session id on the draft row for reconciliation
    try {
      await supabase.from('recurring_bookings' as any)
        .update({ stripe_price_id: session.id })
        .eq('id', (draft as any).id);
    } catch { /* non-blocking */ }

    return new Response(JSON.stringify({
      url: session.url,
      subscriptionDraftId: (draft as any).id,
      discountedCents,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[create-subscription-checkout] error', err);
    return new Response(JSON.stringify({ error: err?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
