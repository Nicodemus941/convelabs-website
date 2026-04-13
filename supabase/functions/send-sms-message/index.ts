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
    const { conversationId, phoneNumber, message, staffProfileId, patientId } = await req.json();

    if (!phoneNumber || !message) {
      return new Response(
        JSON.stringify({ error: 'phoneNumber and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      throw new Error('Missing Twilio configuration');
    }

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

    const formData = new URLSearchParams();
    formData.append('To', phoneNumber);
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

    // Store message in sms_messages if conversation exists
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let convId = conversationId;

    // Create conversation if it doesn't exist
    if (!convId && staffProfileId && patientId) {
      const { data: existing } = await supabase
        .from('sms_conversations')
        .select('id')
        .eq('staff_profile_id', staffProfileId)
        .eq('patient_id', patientId)
        .maybeSingle();

      if (existing) {
        convId = existing.id;
      } else {
        const { data: newConv } = await supabase
          .from('sms_conversations')
          .insert({
            staff_profile_id: staffProfileId,
            patient_id: patientId,
            patient_phone: phoneNumber,
          })
          .select()
          .single();

        if (newConv) convId = newConv.id;
      }
    }

    if (convId) {
      await supabase.from('sms_messages').insert({
        conversation_id: convId,
        direction: 'outbound',
        body: message,
        twilio_message_sid: twilioResponse.sid,
        status: 'sent',
      });

      // Update last_message_at
      await supabase
        .from('sms_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', convId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageSid: twilioResponse.sid,
        conversationId: convId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Send SMS message error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
