import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { appointmentId, notificationType, phoneNumber, eta, labName, trackingId, customMessage } = await req.json()

    console.log('SMS notification request:', { appointmentId, notificationType, phoneNumber })

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      throw new Error('Missing Twilio configuration')
    }

    let message = ''
    switch (notificationType) {
      case 'on_the_way_custom':
        // Custom message from the phlebotomist dashboard (includes ETA + urine sample info)
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
        message = customMessage || 'ConveLabs appointment update'
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`

    const formData = new URLSearchParams()
    formData.append('To', phoneNumber)
    formData.append('From', TWILIO_PHONE_NUMBER)
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
