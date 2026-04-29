import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { password, accessToken } = await req.json();

    if (!password || password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Access token required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Verify the access token to get the user ID
    const { data: { user }, error: verifyErr } = await supabase.auth.getUser(accessToken);

    if (verifyErr || !user) {
      console.error('Token verification failed:', verifyErr);
      return new Response(JSON.stringify({ error: 'Invalid or expired session. Please request a new reset link.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update password using admin API (no client lock, no timeout issues)
    const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
      password: password,
    });

    if (updateErr) {
      console.error('Password update failed:', updateErr);
      // Map Supabase auth errors to friendly, actionable messages.
      // Return 200 (not 5xx) so the client's `data.error` path receives them
      // rather than them getting swallowed by FunctionsHttpError.
      const raw = (updateErr.message || '').toLowerCase();
      let friendly = updateErr.message || 'Failed to update password';
      let code = 'unknown';
      if (raw.includes('different from the old') || raw.includes('same as') || raw.includes('same_password') || raw.includes('new password should')) {
        friendly = "That password matches one you've used before. For your security, please choose a new password you haven't used on this account.";
        code = 'same_password';
      } else if (raw.includes('weak') || raw.includes('pwned') || raw.includes('compromised') || raw.includes('breach')) {
        friendly = 'That password has shown up in a known data breach. Please choose a different one.';
        code = 'weak_password';
      } else if (raw.includes('at least') || raw.includes('length') || raw.includes('characters')) {
        friendly = updateErr.message || 'Password does not meet the minimum length requirement.';
        code = 'too_short';
      }
      return new Response(JSON.stringify({ error: friendly, code }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Password updated for ${user.email} (${user.id})`);

    return new Response(JSON.stringify({ success: true, email: user.email }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Password update error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
