/**
 * MEMBER-OTP-VERIFY — Phase 5 flywheel
 *
 * Public edge function. Accepts { email, code } → verifies via RPC.
 * On success, returns { ok: true, tier } plus a short-lived verification
 * token the client can put in sessionStorage to unlock member-only slots.
 *
 * Token is a signed payload so DateTimeSelectionStep can trust it
 * without round-tripping on every render.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Simple HMAC token: base64(payload) + '.' + hex(hmac-sha256)
async function signToken(payload: Record<string, any>): Promise<string> {
  const secret = Deno.env.get('MEMBER_OTP_SIGNING_KEY') || SUPABASE_SERVICE_KEY;
  const encoder = new TextEncoder();
  const data = btoa(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${data}.${hex}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim();
    const code = String(body?.code || '').trim();

    if (email.length < 5 || !/^\d{6}$/.test(code)) {
      return new Response(JSON.stringify({ ok: false, reason: 'invalid_input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase.rpc('verify_member_code' as any, {
      p_email: email, p_code: code,
    });

    if (error) {
      console.error('[member-otp-verify] rpc error:', error);
      return new Response(JSON.stringify({ ok: false, reason: 'server_error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = data as any;
    if (!result?.ok) {
      return new Response(JSON.stringify(result), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Issue a 30-minute signed token
    const token = await signToken({
      email: result.email,
      tier: result.tier,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    return new Response(JSON.stringify({
      ok: true,
      tier: result.tier,
      token,
      expires_in: 30 * 60,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[member-otp-verify] unhandled:', e);
    return new Response(JSON.stringify({ ok: false, reason: 'server_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
