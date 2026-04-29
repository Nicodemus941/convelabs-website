import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifyRecipientPhone } from "../_shared/verify-recipient.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Global notification kill switch
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ success: true, suspended: true, message: 'Notifications suspended' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json()

    // Support BOTH calling conventions:
    // 1. New simple format: { to, message }
    // 2. Legacy format: { phoneNumber, notificationType, customMessage, ... }
    const phoneNumber = body.to || body.phoneNumber
    const appointmentId = body.appointmentId
    const notificationType = body.notificationType
    const eta = body.eta
    const labName = body.labName
    const trackingId = body.trackingId
    const customMessage = body.message || body.customMessage

    console.log('SMS notification request:', { phoneNumber, notificationType, hasCustomMessage: !!customMessage })

    if (!phoneNumber) {
      throw new Error('Phone number is required (pass as "to" or "phoneNumber")')
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')
    const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || (!TWILIO_PHONE_NUMBER && !TWILIO_MESSAGING_SERVICE_SID)) {
      throw new Error('Missing Twilio configuration')
    }

    // If a direct message was provided, use it. Otherwise build from notificationType.
    let message = ''
    if (customMessage) {
      message = customMessage
    } else {
      switch (notificationType) {
        case 'on_the_way_custom':
          message = customMessage || `Great news! Your ConveLabs phlebotomist is on the way and will arrive in approximately ${eta} minutes. Please have a designated sterile, well-lit area where we can perform the collection. We're looking forward to serving you. See you soon!`
          break
        case 'on_the_way':
          message = `Great news! Your ConveLabs phlebotomist is on the way and will arrive in approximately ${eta} minutes. Please have a designated sterile, well-lit area where we can perform the collection. We're looking forward to serving you. See you soon!`
          break
        case 'sample_delivered':
          message = `Your specimens have been successfully delivered to ${labName || 'the lab'}. Your lab-generated tracking ID is: ${trackingId || 'pending'}. You will receive your results directly from your lab's patient portal. Thank you for choosing ConveLabs!`
          break
        case 'completed':
          message = `Your ConveLabs appointment is complete! Your specimens are on their way to the lab. We will send you a confirmation once they have been successfully delivered along with your lab-generated ID. Thank you for choosing ConveLabs!`
          break
        default:
          message = 'ConveLabs appointment update'
      }
    }

    // Normalize phone number — ensure it starts with +1
    let normalizedPhone = phoneNumber.replace(/\D/g, '')
    if (normalizedPhone.length === 10) normalizedPhone = `+1${normalizedPhone}`
    else if (!normalizedPhone.startsWith('+')) normalizedPhone = `+${normalizedPhone}`

    // HIPAA verification guard: verify recipient before sending
    const patientName = body.patientName || 'Unknown';
    const phoneCheck = await verifyRecipientPhone(appointmentId || 'unknown', normalizedPhone, patientName);
    if (!phoneCheck.safe) {
      console.warn('HIPAA guard blocked SMS to ' + normalizedPhone + ': ' + phoneCheck.reason);
      return new Response(
        JSON.stringify({
          success: false,
          blocked: true,
          reason: phoneCheck.reason,
          message: 'HIPAA verification failed - SMS not sent'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`

    const formData = new URLSearchParams()
    formData.append('To', normalizedPhone)
    // Use Messaging Service if available, otherwise use phone number
    if (TWILIO_MESSAGING_SERVICE_SID) {
      formData.append('MessagingServiceSid', TWILIO_MESSAGING_SERVICE_SID)
    } else {
      formData.append('From', TWILIO_PHONE_NUMBER!)
    }
    formData.append('Body', message)

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    })

    const twilioResponse = await response.json()

    if (!response.ok) {
      throw new Error(`Twilio error: ${twilioResponse.message}`)
    }

    // ─── TWO-WAY SMS THREADING ─────────────────────────────────────
    // Mirror outbound message into sms_messages so the admin Messages
    // tab shows the full thread. Best-effort — never fail the send on
    // logging issues. Inbound replies get logged by twilio-inbound-sms.
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.38.4');
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
      const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      // Try to resolve patient_id for prettier conversation linkage
      const phoneDigits = normalizedPhone.replace(/\D/g, '').slice(-10);
      let patientId: string | null = null;
      try {
        const { data: tp } = await admin
          .from('tenant_patients')
          .select('id')
          .filter('phone', 'ilike', `%${phoneDigits}%`)
          .limit(1)
          .maybeSingle();
        patientId = (tp as any)?.id || null;
      } catch { /* keep null */ }
      const { data: convId } = await admin.rpc('get_or_create_sms_conversation' as any, {
        p_patient_phone: normalizedPhone,
        p_patient_id: patientId,
      });
      if (convId) {
        await admin.from('sms_messages').insert({
          conversation_id: convId,
          direction: 'outbound',
          body: String(message).substring(0, 1500),
          twilio_message_sid: twilioResponse.sid || null,
          status: 'sent',
        } as any);
      }
    } catch (logErr) {
      console.warn('[send-sms] thread log failed (non-blocking):', logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageSid: twilioResponse.sid,
        message: 'SMS sent successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('SMS notification error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
