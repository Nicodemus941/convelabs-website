// provider-otp-verify
// Partner enters the 6-digit code they received via SMS. We look up their
// phone from organizations (server-side — client never sees it), then call
// Supabase's native verifyOtp. Supabase returns a full session, which we
// hand back to the client. Client calls supabase.auth.setSession(...) and
// is now signed in.
//
// Request:  { email, code }
// Response: { success: true, access_token, refresh_token, user_id } | { error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'email and code required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!/^\d{6}$/.test(String(code).trim())) {
      return new Response(JSON.stringify({ error: 'Invalid code format' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const normalizedEmail = String(email).trim().toLowerCase();

    // Phone lookup — never exposed to client
    const { data: org } = await admin
      .from('organizations')
      .select('contact_phone')
      .or(`contact_email.eq.${normalizedEmail},billing_email.eq.${normalizedEmail}`)
      .eq('portal_enabled', true)
      .eq('is_active', true)
      .maybeSingle();

    if (!org?.contact_phone) {
      return new Response(JSON.stringify({ error: 'Invalid or expired code' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const phone = normalizePhone(org.contact_phone);

    // Verify via Supabase native phone auth
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await client.auth.verifyOtp({
      phone,
      token: String(code).trim(),
      type: 'sms',
    });

    if (error || !data?.session) {
      console.error('verifyOtp failed:', error);
      return new Response(JSON.stringify({ error: 'Invalid or expired code' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user_id: data.user?.id,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('provider-otp-verify error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
