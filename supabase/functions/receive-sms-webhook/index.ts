import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  // Twilio sends form-encoded POST data
  if (req.method === 'POST') {
    try {
      const formData = await req.text();
      const params = new URLSearchParams(formData);

      const from = params.get('From') || '';
      const body = params.get('Body') || '';
      const messageSid = params.get('MessageSid') || '';

      console.log('Inbound SMS from:', from, 'Body:', body);

      if (!from || !body) {
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Find conversation by patient phone number
      const { data: conversation } = await supabase
        .from('sms_conversations')
        .select('id')
        .eq('patient_phone', from)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (conversation) {
        // Store inbound message
        await supabase.from('sms_messages').insert({
          conversation_id: conversation.id,
          direction: 'inbound',
          body: body,
          twilio_message_sid: messageSid,
          status: 'received',
        });

        // Update conversation timestamp
        await supabase
          .from('sms_conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversation.id);

        console.log('Inbound message stored in conversation:', conversation.id);
      } else {
        console.log('No conversation found for phone:', from);
      }

      // Return empty TwiML response
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    } catch (error) {
      console.error('Inbound SMS webhook error:', error);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
