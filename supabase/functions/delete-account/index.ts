/**
 * DELETE-ACCOUNT
 *
 * Self-service account deletion — required by the Apple App Store (and Google
 * Play) for any app that supports account creation. The signed-in user calls
 * this; we verify their JWT, scrub their personal data, delete their auth
 * login so they can no longer sign in, and write an audit row.
 *
 * Note on PHI: clinical/lab records carry legal retention obligations, so we
 * do NOT hard-delete medical history here — we remove the login + profile PII
 * and anonymize billing contact info. That is a disclosed, compliant approach.
 *
 * verify_jwt=true — only the authenticated account holder can delete it.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  try {
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

    // Identify the caller from their JWT.
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Not authenticated' }, 401);

    const userId = user.id;
    const email = user.email ?? null;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const steps: Record<string, string> = {};

    // Audit FIRST so we have a record even if a later step fails.
    try {
      await admin.from('account_deletion_requests').insert({
        user_id: userId,
        email,
        status: 'processing',
      });
      steps.audit = 'ok';
    } catch (e) {
      steps.audit = `skip: ${String((e as Error).message)}`;
    }

    // Scrub profile PII (no FK to auth.users, so we remove it explicitly).
    try {
      const { error } = await admin.from('profiles').delete().eq('id', userId);
      steps.profiles = error ? `skip: ${error.message}` : 'deleted';
    } catch (e) {
      steps.profiles = `skip: ${String((e as Error).message)}`;
    }

    // Anonymize billing contact on any memberships (retain the financial row).
    try {
      const { error } = await admin
        .from('user_memberships')
        .update({ billing_email: null, billing_name: null })
        .eq('user_id', userId);
      steps.memberships = error ? `skip: ${error.message}` : 'anonymized';
    } catch (e) {
      steps.memberships = `skip: ${String((e as Error).message)}`;
    }

    // Delete the auth login — the core "account deletion" action.
    let deleted = false;
    try {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        // Fall back to a permanent ban so the login is unusable even if the
        // hard delete is blocked.
        steps.auth = `delete failed: ${error.message}; banning instead`;
        await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
      } else {
        deleted = true;
        steps.auth = 'deleted';
      }
    } catch (e) {
      steps.auth = `error: ${String((e as Error).message)}`;
    }

    // Finalize the audit row.
    try {
      await admin
        .from('account_deletion_requests')
        .update({ status: deleted ? 'completed' : 'login_disabled', details: steps })
        .eq('user_id', userId)
        .eq('status', 'processing');
    } catch (_) {
      /* non-fatal */
    }

    return json({ ok: true, deleted, steps });
  } catch (err) {
    console.error('[delete-account] error:', err);
    return json({ ok: false, error: String((err as Error).message) }, 500);
  }
});
