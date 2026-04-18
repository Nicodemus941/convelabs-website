// verify-sms-otp
// Verifies a 6-digit code against the most recent active code for `email`.
// On success: marks the code used, returns a short-lived single-use reset_token
// (random UUID, stored with expiry) that the client then passes to
// reset-password-with-sms-token to actually change the password.
//
// Request:  { email, code }
// Response: 200 { success: true, reset_token: string }
//           400 { error: string, remaining_attempts?: number }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string compare (prevents timing attacks on the code check)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, code } = await req.json();
    if (!email || !code) return new Response(JSON.stringify({ error: 'email and code required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!/^\d{6}$/.test(String(code).trim())) return new Response(JSON.stringify({ error: 'Invalid code format' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const normalizedEmail = String(email).trim().toLowerCase();

    // Load the most recent active code
    const { data: row } = await supabase
      .from('sms_otp_codes')
      .select('id, code_hash, expires_at, attempts, max_attempts, phone')
      .eq('email', normalizedEmail)
      .eq('purpose', 'password_reset')
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ error: 'No active code. Please request a new one.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabase.from('sms_otp_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
      return new Response(JSON.stringify({ error: 'Code expired. Please request a new one.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (row.attempts >= row.max_attempts) {
      await supabase.from('sms_otp_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
      return new Response(JSON.stringify({ error: 'Too many attempts. Please request a new code.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const submittedHash = await sha256(String(code).trim());
    if (!timingSafeEqual(submittedHash, row.code_hash)) {
      const newAttempts = row.attempts + 1;
      await supabase.from('sms_otp_codes').update({ attempts: newAttempts }).eq('id', row.id);
      const remaining = Math.max(0, row.max_attempts - newAttempts);
      return new Response(JSON.stringify({ error: 'Incorrect code', remaining_attempts: remaining }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── VERIFIED — burn the code and issue a reset_token ────────────────────
    const resetToken = crypto.randomUUID();
    const resetTokenHash = await sha256(resetToken);
    const resetExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await supabase.from('sms_otp_codes').update({
      used_at: new Date().toISOString(),
    }).eq('id', row.id);

    // Insert a marker row for the reset_token (purpose = 'reset_token_issued')
    await supabase.from('sms_otp_codes').insert({
      email: normalizedEmail,
      phone: row.phone,
      code_hash: resetTokenHash,
      purpose: 'reset_token_issued',
      expires_at: resetExpiry,
      max_attempts: 1,
    });

    return new Response(JSON.stringify({ success: true, reset_token: resetToken }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('verify-sms-otp error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
