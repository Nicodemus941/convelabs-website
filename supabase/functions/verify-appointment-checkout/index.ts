import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from '../_shared/stripe.ts';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: 'session_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First check if the appointment has been created by the webhook
    const { data: appointment, error: appointmentError } = await supabaseClient
      .from('appointments')
      .select('*')
      .eq('stripe_checkout_session_id', session_id)
      .maybeSingle();

    if (appointment) {
      return new Response(
        JSON.stringify({
          status: 'completed',
          appointment,
          bookingId: appointment.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no appointment yet, check the Stripe session status
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid' || session.status === 'complete') {
      // Give webhook 3 seconds to process first (race condition guard)
      await new Promise(r => setTimeout(r, 3000));

      // Re-check if webhook created the appointment during the wait
      const { data: lateAppointment } = await supabaseClient
        .from('appointments')
        .select('*')
        .eq('stripe_checkout_session_id', session_id)
        .maybeSingle();

      if (lateAppointment) {
        return new Response(
          JSON.stringify({ status: 'completed', appointment: lateAppointment, bookingId: lateAppointment.id }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Payment confirmed — create appointment (webhook didn't handle it)
      const metadata = session.metadata || {};
      const fullAddress = [metadata.address, metadata.city, metadata.state, metadata.zip_code].filter(Boolean).join(', ');
      const patientName = `${metadata.patient_first_name || ''} ${metadata.patient_last_name || ''}`.trim();

      const { data: newAppt, error: insertError } = await supabaseClient
        .from('appointments')
        .insert([{
          appointment_date: metadata.appointment_date || new Date().toISOString(),
          appointment_time: metadata.appointment_time || null,
          patient_id: metadata.user_id || null,
          patient_name: patientName || null,
          patient_email: metadata.patient_email || null,
          patient_phone: metadata.patient_phone || null,
          service_type: metadata.service_type || 'mobile',
          service_name: metadata.service_name || 'Blood Draw',
          status: 'scheduled',
          payment_status: 'completed',
          total_amount: (session.amount_total || 0) / 100,
          tip_amount: parseInt(metadata.tip_amount || '0') / 100,
          service_price: parseInt(metadata.service_price || '0') / 100,
          address: fullAddress || 'Pending',
          zipcode: metadata.zip_code || '32801',
          stripe_checkout_session_id: session_id,
          stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          booking_source: 'online',
          notes: metadata.additional_notes || null,
          weekend_service: metadata.weekend === 'true',
        }])
        .select()
        .single();

      if (insertError) {
        // Might be duplicate — try fetching again
        const { data: existing } = await supabaseClient
          .from('appointments')
          .select('*')
          .eq('stripe_checkout_session_id', session_id)
          .maybeSingle();

        if (existing) {
          return new Response(
            JSON.stringify({ status: 'completed', appointment: existing, bookingId: existing.id }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ status: 'processing' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Send confirmation notifications (non-blocking)
      try {
        await supabaseClient.functions.invoke('send-appointment-confirmation', {
          body: { appointmentId: newAppt.id },
        });
      } catch (notifErr) {
        console.error('Notification error (non-blocking):', notifErr);
      }

      return new Response(
        JSON.stringify({ status: 'completed', appointment: newAppt, bookingId: newAppt.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (session.status === 'expired') {
      return new Response(
        JSON.stringify({ status: 'expired' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ status: 'pending' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error verifying appointment checkout:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
