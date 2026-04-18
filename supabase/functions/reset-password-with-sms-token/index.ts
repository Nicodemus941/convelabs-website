// reset-password-with-sms-token
// Consumes a reset_token issued by verify-sms-otp, updates the user's password
// via Supabase Auth admin API, and returns a freshly-generated magic link that
// the client redeems to log in immediately (no second login step).
//
// Request:  { email, reset_token, new_password }
// Response: { success: true, redirect_url: string }  (client does window.location.href = redirect_url)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, reset_token, new_password } = await req.json();
    if (!email || !reset_token || !new_password) return new Response(JSON.stringify({ error: 'email, reset_token, new_password required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (String(new_password).length < 8) return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const normalizedEmail = String(email).trim().toLowerCase();

    // ── VALIDATE RESET TOKEN ────────────────────────────────────────────────
    const tokenHash = await sha256(String(reset_token));
    const { data: tok } = await supabase
      .from('sms_otp_codes')
      .select('id, expires_at, used_at')
      .eq('email', normalizedEmail)
      .eq('purpose', 'reset_token_issued')
      .eq('code_hash', tokenHash)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tok) return new Response(JSON.stringify({ error: 'Invalid or already-used reset token' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (new Date(tok.expires_at).getTime() < Date.now()) {
      await supabase.from('sms_otp_codes').update({ used_at: new Date().toISOString() }).eq('id', tok.id);
      return new Response(JSON.stringify({ error: 'Reset token expired. Please start over.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Burn the token immediately so it can't be reused even if the rest fails below
    await supabase.from('sms_otp_codes').update({ used_at: new Date().toISOString() }).eq('id', tok.id);

    // ── FIND OR CREATE THE AUTH USER ────────────────────────────────────────
    const { data: usersList } = await supabase.auth.admin.listUsers();
    const existingUser = usersList?.users?.find((u: any) => u.email?.toLowerCase() === normalizedEmail);

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      // Update password + confirm email if not yet confirmed
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
        password: new_password,
        email_confirm: true,
      });
      if (updErr) {
        console.error('updateUserById failed:', updErr);
        return new Response(JSON.stringify({ error: 'Failed to update password' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else {
      // Partner who hasn't logged in before — create the auth user
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: new_password,
        email_confirm: true,
      });
      if (createErr || !created?.user) {
        console.error('createUser failed:', createErr);
        return new Response(JSON.stringify({ error: 'Failed to create account' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = created.user.id;
    }

    // ── ISSUE MAGIC LINK FOR IMMEDIATE LOGIN ────────────────────────────────
    // The client will navigate to this URL; supabase-js auto-detects and
    // creates a session. No separate password-based login needed.
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: { redirectTo: `${PUBLIC_SITE_URL}/dashboard` },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error('generateLink failed:', linkErr);
      // Not fatal — the password is set. Tell client to go to login page.
      return new Response(JSON.stringify({ success: true, redirect_url: `${PUBLIC_SITE_URL}/provider?email=${encodeURIComponent(normalizedEmail)}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      redirect_url: linkData.properties.action_link,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('reset-password-with-sms-token error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
