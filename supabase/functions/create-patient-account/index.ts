import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email: rawEmail, password, firstName: rawFirstName, lastName: rawLastName } = await req.json();
    const email = String(rawEmail || '').trim().toLowerCase();
    const firstName = String(rawFirstName || '').trim();
    const lastName = String(rawLastName || '').trim();

    if (!email || !email.includes('@')) {
      return json(400, { ok: false, reason: 'bad_email' });
    }
    if (String(password || '').length < 8) {
      return json(400, { ok: false, reason: 'weak_password' });
    }
    if (!firstName || !lastName) {
      return json(400, { ok: false, reason: 'missing_name' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Patient-only path: block obvious org/provider emails so this flow can't
    // create confirmed patient accounts for practice identities.
    const { data: orgHit, error: orgErr } = await admin
      .from('organizations')
      .select('id')
      .or(`contact_email.ilike.${email},manager_email.ilike.${email},front_desk_email.ilike.${email},billing_email.ilike.${email}`)
      .limit(1)
      .maybeSingle();
    if (orgErr) {
      return json(500, { ok: false, reason: 'org_lookup_failed', detail: orgErr.message });
    }
    if (orgHit) {
      return json(409, {
        ok: false,
        reason: 'org_email_blocked',
        message: 'That email is already used for a provider or organization account.',
      });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        firstName,
        lastName,
        full_name: `${firstName} ${lastName}`.trim(),
        role: 'patient',
      },
    });

    if (createErr || !created?.user) {
      const msg = String(createErr?.message || '').toLowerCase();
      if (/already|registered|exists|duplicate/.test(msg)) {
        return json(409, { ok: false, reason: 'already_registered' });
      }
      return json(500, {
        ok: false,
        reason: 'create_failed',
        detail: createErr?.message || 'unknown createUser failure',
      });
    }

    return json(200, {
      ok: true,
      userId: created.user.id,
      email,
    });
  } catch (error: any) {
    console.error('[create-patient-account] error:', error);
    return json(500, {
      ok: false,
      reason: 'error',
      detail: error?.message || 'unknown error',
    });
  }
});
