import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifyRecipientPhone } from "../_shared/verify-recipient.ts"
import { shouldSendNow, logDeferral, NotificationCategory } from "../_shared/quiet-hours.ts"

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

    // ─── QUIET-HOURS GATE ──────────────────────────────────────────
    // Centralized 9pm-8am ET silence. Callers can pass `category` to opt
    // their send into a specific class; if absent, we infer from
    // notificationType. Transactional categories (otp/booking_confirmation/
    // payment_confirmation/admin_alert/password_reset) always allow. Anything
    // else (reminder/dunning/marketing/post_visit) is deferred and logged.
    const inferCategory = (): NotificationCategory => {
      if (body.category) return body.category as NotificationCategory;
      const t = (notificationType || '').toLowerCase();
      if (t.includes('otp') || t.includes('verification')) return 'otp';
      if (t.includes('confirmation') || t === 'booking_confirmed') return 'booking_confirmation';
      if (t === 'payment_confirmation' || t === 'payment_success') return 'payment_confirmation';
      if (t === 'password_reset') return 'password_reset';
      if (t === 'on_the_way' || t === 'on_the_way_custom' || t === 'sample_delivered' || t === 'completed') return 'booking_confirmation';
      if (t.includes('reminder') || t.includes('fasting')) return 'reminder';
      if (t.includes('dunning') || t.includes('invoice') || t.includes('past_due')) return 'dunning';
      if (t.includes('post_visit') || t.includes('review')) return 'post_visit';
      if (t.includes('marketing') || t.includes('campaign') || t.includes('promo')) return 'marketing';
      // Default: treat unknown ad-hoc SMS as transactional admin_alert so
      // existing internal callers (admin notify, status updates) don't break.
      return 'admin_alert';
    };
    const category = inferCategory();
    const gate = shouldSendNow(category);
    if (!gate.allow) {
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.38.4');
        const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
        await logDeferral(sb, {
          category,
          recipient: normalizedPhone,
          channel: 'sms',
          payload_summary: `[${notificationType || 'custom'}] ${(message || '').substring(0, 160)}`,
          next_allowed_at: gate.nextAllowedAt,
          origin_function: 'send-sms-notification',
        });
      } catch { /* telemetry never breaks the path */ }
      console.log(`[quiet-hours] SMS deferred to ${gate.nextAllowedAt} (category=${category})`);
      return new Response(
        JSON.stringify({ success: false, deferred: true, category, next_allowed_at: gate.nextAllowedAt, reason: gate.reason }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // ─── ANTI-ABUSE GATE ───────────────────────────────────────────
    // The public anon key is embedded in the website JS, so a bot can call
    // this function directly. Without a gate it could text ANY phone number
    // (toll fraud / smishing under our brand). Rule: an anonymous caller
    // (anon-key only) may ONLY text a number already in the patient registry.
    // Logged-in users (staff/patient JWT) and trusted internal services may
    // text anyone. A bot has the anon key but cannot forge a real user JWT.
    if (phoneCheck.inRegistry === false) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
      const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') || ''
      const authHeader = req.headers.get('Authorization') || ''
      const bearer = authHeader.replace(/^Bearer\s+/i, '').trim()
      const providedSecret = req.headers.get('x-internal-secret') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

      let trusted = false
      // 1) Trusted internal service via shared secret
      if (internalSecret && providedSecret === internalSecret) trusted = true
      // 2) Server-to-server call carrying the service-role key
      if (!trusted && bearer && serviceKey && bearer === serviceKey) trusted = true
      // 3) A genuinely logged-in user (staff/patient) — the anon key alone fails this
      if (!trusted && bearer && bearer !== anonKey) {
        try {
          const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.38.4')
          const authClient = createClient(Deno.env.get('SUPABASE_URL') || '', anonKey)
          const { data: { user } } = await authClient.auth.getUser(bearer)
          if (user) trusted = true
        } catch { /* not a valid user token */ }
      }

      if (!trusted) {
        console.warn('[abuse-guard] Blocked SMS to non-registry number from untrusted caller: ' + normalizedPhone)
        try {
          const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.38.4')
          const sb = createClient(Deno.env.get('SUPABASE_URL') || '', serviceKey)
          await sb.from('webhook_logs').insert({
            id: crypto.randomUUID(),
            event_type: 'sms_abuse_blocked',
            status: 'blocked',
            payload_summary: {
              recipient_phone: normalizedPhone,
              reason: 'Non-registry recipient from untrusted (anon-key) caller',
              origin_function: 'send-sms-notification',
            },
          }).then(() => {}, () => {})
        } catch { /* never break on logging */ }
        return new Response(
          JSON.stringify({ success: false, blocked: true, reason: 'Recipient not permitted' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
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
    // Delivery-status callback → real carrier outcome surfaces (catches A2P 30034 bounces)
    const statusCallback = `${Deno.env.get('SUPABASE_URL') || ''}/functions/v1/twilio-status-callback`
    if (statusCallback.startsWith('http')) formData.append('StatusCallback', statusCallback)

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
      // Structured notification log — record EVERY SMS sent through the shared
      // sender (on_the_way, etc.) so the SMS audit is complete.
      await admin.from('sms_notifications').insert({
        appointment_id: appointmentId || null,
        notification_type: notificationType || 'custom',
        phone_number: normalizedPhone,
        message_content: String(message).substring(0, 1500),
        sent_at: new Date().toISOString(),
        delivery_status: 'sent',
        twilio_message_sid: twilioResponse.sid || null,
        metadata: { source: 'send-sms-notification' },
      });
    } catch (logErr) {
      console.warn('[send-sms] log failed (non-blocking):', logErr);
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
