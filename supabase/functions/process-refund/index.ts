import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from "../_shared/stripe.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Process Refund Edge Function
 *
 * Accepts:
 *   appointmentId: string (required)
 *   refundType: 'full' | 'cancellation_fee' | 'no_show_fee' | 'custom' (required)
 *   customAmount?: number (only for 'custom' type, in dollars)
 *   reason?: string
 *
 * Refund logic:
 *   - full: refund 100% of stripe payment
 *   - cancellation_fee: refund 50% (patient cancelled <24h, keep 50% as fee)
 *   - no_show_fee: no refund — patient forfeits 50%, we keep 100% collected
 *   - custom: refund exact dollar amount specified
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { appointmentId, refundType, customAmount, reason } = await req.json();

    if (!appointmentId || !refundType) {
      return new Response(JSON.stringify({ error: 'appointmentId and refundType are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['full', 'cancellation_fee', 'no_show_fee', 'custom'].includes(refundType)) {
      return new Response(JSON.stringify({ error: 'Invalid refundType. Must be: full, cancellation_fee, no_show_fee, or custom' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch the appointment
    const { data: appt, error: apptError } = await supabaseClient
      .from('appointments')
      .select('id, stripe_payment_intent_id, total_amount, tip_amount, payment_status, refund_status, status, patient_name, patient_email')
      .eq('id', appointmentId)
      .single();

    if (apptError || !appt) {
      return new Response(JSON.stringify({ error: 'Appointment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Validate refund is possible
    if (appt.refund_status === 'refunded') {
      return new Response(JSON.stringify({ error: 'This appointment has already been fully refunded' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (appt.payment_status !== 'completed') {
      return new Response(JSON.stringify({ error: 'No completed payment found for this appointment' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!appt.stripe_payment_intent_id) {
      return new Response(JSON.stringify({ error: 'No Stripe payment intent found. Manual refund may be required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Calculate refund amount (in cents for Stripe)
    const totalPaid = (appt.total_amount || 0) + (appt.tip_amount || 0);
    let refundAmountDollars: number;
    let refundDescription: string;

    switch (refundType) {
      case 'full':
        refundAmountDollars = totalPaid;
        refundDescription = `Full refund for appointment ${appointmentId}`;
        break;

      case 'cancellation_fee':
        // Refund 50% — we keep 50% as cancellation fee
        refundAmountDollars = Math.round(totalPaid * 0.5 * 100) / 100;
        refundDescription = `50% refund (cancellation <24h) for appointment ${appointmentId}`;
        break;

      case 'no_show_fee':
        // No refund for no-shows — we keep 100%
        return new Response(JSON.stringify({
          success: true,
          message: 'No refund issued for no-show. 50% no-show fee retained.',
          refundAmount: 0,
          refundType: 'no_show_fee',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'custom':
        if (!customAmount || customAmount <= 0) {
          return new Response(JSON.stringify({ error: 'customAmount must be a positive number' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (customAmount > totalPaid) {
          return new Response(JSON.stringify({ error: `Custom amount ($${customAmount}) exceeds total paid ($${totalPaid})` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        refundAmountDollars = Math.round(customAmount * 100) / 100;
        refundDescription = reason || `Custom refund of $${refundAmountDollars} for appointment ${appointmentId}`;
        break;

      default:
        refundAmountDollars = 0;
        refundDescription = '';
    }

    if (refundAmountDollars <= 0) {
      return new Response(JSON.stringify({ error: 'Calculated refund amount is $0' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const refundAmountCents = Math.round(refundAmountDollars * 100);

    // 4. Issue the refund via Stripe
    console.log(`Processing ${refundType} refund: $${refundAmountDollars} for PI ${appt.stripe_payment_intent_id}`);

    let stripeRefund;
    try {
      stripeRefund = await stripe.refunds.create({
        payment_intent: appt.stripe_payment_intent_id,
        amount: refundAmountCents,
        reason: refundType === 'full' ? 'requested_by_customer' : 'requested_by_customer',
        metadata: {
          appointment_id: appointmentId,
          refund_type: refundType,
          patient_name: appt.patient_name || '',
          patient_email: appt.patient_email || '',
        },
      });
    } catch (stripeError: any) {
      console.error('Stripe refund failed:', stripeError.message);

      // Update appointment with failed refund status
      await supabaseClient.from('appointments').update({
        refund_status: 'failed',
      }).eq('id', appointmentId);

      return new Response(JSON.stringify({
        error: `Stripe refund failed: ${stripeError.message}`,
        stripeError: stripeError.type || 'unknown',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Update appointment record with refund details
    const isFullRefund = refundAmountDollars >= totalPaid;
    const { error: updateError } = await supabaseClient.from('appointments').update({
      refund_id: stripeRefund.id,
      refund_amount: refundAmountDollars,
      refund_status: isFullRefund ? 'refunded' : 'partial_refund',
      refunded_at: new Date().toISOString(),
      payment_status: isFullRefund ? 'refunded' : 'partial_refund',
    }).eq('id', appointmentId);

    if (updateError) {
      console.error('Failed to update appointment after refund:', updateError);
      // Refund was issued but DB update failed — log but don't fail
    }

    console.log(`Refund successful: ${stripeRefund.id} — $${refundAmountDollars} (${refundType})`);

    return new Response(JSON.stringify({
      success: true,
      refundId: stripeRefund.id,
      refundAmount: refundAmountDollars,
      refundType,
      refundStatus: stripeRefund.status,
      message: refundDescription,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('process-refund error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
