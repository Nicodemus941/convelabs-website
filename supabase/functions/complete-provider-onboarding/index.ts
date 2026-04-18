// complete-provider-onboarding
// One server-side entry point for finishing provider first-login onboarding
// AND for the post-onboarding "set a password later" nudge. Uses admin API
// so it bypasses Supabase's "Secure password change" reauth requirement —
// which rejects client-side updateUser() with 422 when the session was
// created via SMS OTP / magic link. Server-side JWT verification is enough
// proof of identity.
//
// Request:  { full_name?, title?, password?, mark_onboarded?: boolean }
// Response: { success: true }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userResp } = await admin.auth.getUser(token);
    const user = userResp?.user;
    if (!user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Only providers can hit this endpoint
    if (user.user_metadata?.role !== 'provider') {
      return new Response(JSON.stringify({ error: 'Not a provider account' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { full_name, title, password, mark_onboarded } = body || {};

    // Password validation
    if (password !== undefined && password !== null) {
      if (typeof password !== 'string' || password.length < 8) {
        return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Merge metadata — never blow away existing keys
    const nextMetadata: Record<string, any> = { ...user.user_metadata };
    if (typeof full_name === 'string' && full_name.trim()) nextMetadata.full_name = full_name.trim();
    if (typeof title === 'string') nextMetadata.title = title.trim() || null;
    if (mark_onboarded) nextMetadata.onboarded_at = new Date().toISOString();
    if (password) nextMetadata.password_set = true;

    const updatePayload: any = { user_metadata: nextMetadata };
    if (password) updatePayload.password = password;

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, updatePayload);
    if (updErr) {
      console.error('updateUserById failed:', updErr);
      return new Response(JSON.stringify({ error: updErr.message || 'Failed to save' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('complete-provider-onboarding error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
