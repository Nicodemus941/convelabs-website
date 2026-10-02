/**
 * ABANDONED-BOOKING-ADMIN
 *
 * Staff-only helper behind the Growth › Abandoned bookings list. Deployed
 * WITH JWT verification (default); the caller's session token must belong to
 * a super_admin / admin.
 *
 * POST { action: 'resume_link', id }  → { ok, url }
 * POST { action: 'stop', id }         → { ok }   (stop_reason = 'manual')
 *
 * Minting lives here (not in the browser) because the resume token is an
 * HMAC over a server secret — see _shared/booking-draft.ts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';
import { resumeLinkFor } from '../_shared/booking-draft.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOWED_ROLES = new Set(['super_admin', 'admin']);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  try {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
    const ok = (roles || []).some((r: any) => ALLOWED_ROLES.has(String(r.role)));
    if (!ok) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'id_required' }, 400);

    const { data: row } = await admin.from('abandoned_bookings').select('id, expires_at, stopped_at, recovered').eq('id', id).maybeSingle();
    if (!row) return json({ error: 'not_found' }, 404);

    if (body?.action === 'resume_link') {
      return json({ ok: true, url: await resumeLinkFor(id), expires_at: (row as any).expires_at });
    }
    if (body?.action === 'stop') {
      await admin.from('abandoned_bookings').update({
        stopped_at: new Date().toISOString(), stop_reason: 'manual', next_touch_at: null,
      }).eq('id', id);
      return json({ ok: true });
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (e: any) {
    console.error('[abandoned-booking-admin]', e?.message || e);
    return json({ error: 'failed', message: e?.message || String(e) }, 500);
  }
});
