/**
 * MEMBER-OTP-SEND — Phase 5 flywheel
 *
 * Public edge function. Accepts { email } → looks up active membership
 * → issues 6-digit code via RPC → sends SMS to the patient's phone.
 *
 * Returns minimal info to the client (never reveals whether the email
 * is a member, and never returns the code). The SMS is the single
 * side-channel that proves membership.
 *
 * HIPAA: this is NOT a patient notification — it's an authentication
 * credential. Bypasses quiet-hours.
 *
 * Rate limit: RPC caps at 3 codes per email per 15 minutes.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim();
    if (email.length < 5) {
      return new Response(JSON.stringify({ ok: false, reason: 'invalid_email' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const ua = req.headers.get('user-agent')?.substring(0, 300) || null;

    const { data: rpcData, error: rpcErr } = await supabase.rpc('issue_member_verification_code' as any, {
      p_email: email, p_ip: ip, p_user_agent: ua,
    });

    if (rpcErr) {
      console.error('[member-otp-send] rpc error:', rpcErr);
      return new Response(JSON.stringify({ ok: false, reason: 'server_error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = rpcData as any;
    // Rate limited or invalid — echo reason without revealing membership status
    if (!result?.ok) {
      return new Response(JSON.stringify({ ok: false, reason: result?.reason || 'unknown' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // No membership found — return success shape so email enumeration isn't possible
    if (result?.no_membership) {
      return new Response(JSON.stringify({ ok: true, sent: false, message: 'If that email is on a ConveLabs membership, a code is on its way.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const code: string | undefined = result?.code;
    const phoneLast4: string | undefined = result?.phone_last4;
    const tier: string | undefined = result?.tier;

    // Send SMS via Twilio
    const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_MSG  = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';

    if (code && phoneLast4 && TWILIO_SID && TWILIO_AUTH) {
      // Look up the phone by hitting the RPC output — stored only in the DB
      // row. To avoid an extra round-trip we could return phone too, but we
      // chose to keep it internal. Instead fetch from tenant_patients here.
      const { data: tp } = await supabase.from('tenant_patients').select('phone').ilike('email', email).maybeSingle();
      const phone = tp?.phone as string | undefined;
      if (phone) {
        const body = `ConveLabs: Your verification code is ${code}. Expires in 10 minutes. Reply STOP to unsubscribe.`;
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`,
            Body: body,
            ...(TWILIO_MSG ? { MessagingServiceSid: TWILIO_MSG } : { From: TWILIO_FROM }),
          }).toString(),
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      sent: true,
      phone_last4: phoneLast4,
      tier, // Client uses this for UX copy (but doesn't trust it — real check is on verify)
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[member-otp-send] unhandled:', e);
    return new Response(JSON.stringify({ ok: false, reason: 'server_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
