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
      return new Response(JSON.stringify({ error: updateErr.message || 'Failed to update password' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
