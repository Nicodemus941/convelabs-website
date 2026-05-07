// SIGN-BAA — record a provider's HIPAA Business Associate Agreement
// signature into baa_signatures. Idempotent: if the same user already
// has an unrevoked signature on the same baa_version, returns that one
// instead of inserting a duplicate.
//
// Body: { signer_full_name, signer_title?, baa_version, baa_text, scroll_completed }
// Returns: { signature_id, already_signed }
//
// Auth: requires a valid JWT (provider, office_manager, or super_admin).
// The signer's user_id, email, organization_id, IP, and user-agent are
// captured server-side so the client can't fake them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const role = String(user.user_metadata?.role || '').toLowerCase();
    if (!['provider', 'office_manager', 'super_admin', 'admin', 'owner'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Only provider/staff accounts can sign the BAA' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const signer_full_name = String(body?.signer_full_name || '').trim();
    const signer_title = body?.signer_title ? String(body.signer_title).trim() : null;
    const baa_version = String(body?.baa_version || '').trim();
    const baa_text = String(body?.baa_text || '');
    const scroll_completed = body?.scroll_completed === true;

    if (signer_full_name.length < 3) {
      return new Response(JSON.stringify({ error: 'signer_full_name is required (min 3 chars)' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (!baa_version) {
      return new Response(JSON.stringify({ error: 'baa_version is required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (baa_text.length < 100) {
      return new Response(JSON.stringify({ error: 'baa_text is required (must be the full agreement)' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (!scroll_completed) {
      return new Response(JSON.stringify({ error: 'scroll_completed must be true' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Idempotent: return existing unrevoked signature for this user + version
    const { data: existing } = await supabase
      .from('baa_signatures')
      .select('id')
      .eq('user_id', user.id)
      .eq('baa_version', baa_version)
      .is('revoked_at', null)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return new Response(JSON.stringify({ signature_id: existing.id, already_signed: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const ip_address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || null;
    const user_agent = req.headers.get('user-agent') || null;
    const organization_id = user.user_metadata?.organization_id || user.user_metadata?.org_id || null;

    const { data: inserted, error: insErr } = await supabase
      .from('baa_signatures')
      .insert({
        user_id: user.id,
        organization_id,
        signer_full_name,
        signer_email: user.email,
        signer_title,
        signed_at: new Date().toISOString(),
        ip_address,
        user_agent,
        scroll_completed,
        baa_version,
        baa_text,
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      console.error('[sign-baa] insert failed:', insErr);
      return new Response(JSON.stringify({ error: insErr?.message || 'Insert failed' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ signature_id: inserted.id, already_signed: false }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[sign-baa] error:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
