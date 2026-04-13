import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { appointmentId, phlebotomistId } = await req.json();

    if (!appointmentId || !phlebotomistId) {
      return new Response(
        JSON.stringify({ error: 'appointmentId and phlebotomistId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get phlebotomist phone from staff_profiles
    const { data: staff, error: staffError } = await supabase
      .from('staff_profiles')
      .select('phone, user_id')
      .eq('id', phlebotomistId)
      .single();

    if (staffError || !staff?.phone) {
      console.log('No phone number for phlebotomist:', phlebotomistId);
      return new Response(
        JSON.stringify({ success: false, reason: 'No phone number on file for phlebotomist' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get appointment details
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();

    if (apptError || !appointment) {
      throw new Error('Appointment not found');
    }

    // Parse patient name from notes if needed
    let patientName = 'a patient';
    if (appointment.notes) {
      const match = appointment.notes.match(/Patient:\s*([^|]+)/);
      if (match) patientName = match[1].trim();
    }

    // Build message
    const message = `New ConveLabs appointment assigned: ${patientName} on ${appointment.appointment_date}${appointment.appointment_time ? ' at ' + appointment.appointment_time : ''}. Location: ${appointment.address || 'TBD'}. Open your dashboard for details.`;

    // Send via Twilio
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      throw new Error('Missing Twilio configuration');
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

    const formData = new URLSearchParams();
    formData.append('To', staff.phone);
    formData.append('From', TWILIO_PHONE_NUMBER);
    formData.append('Body', message);

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    const twilioResponse = await response.json();

    if (!response.ok) {
      throw new Error(`Twilio error: ${twilioResponse.message}`);
    }

    console.log('Phlebotomist notification sent:', twilioResponse.sid);

    return new Response(
      JSON.stringify({
        success: true,
        messageSid: twilioResponse.sid,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Phlebotomist notification error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
