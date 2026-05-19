/**
 * TRACK-MEMBERSHIP-OFFER-CLICK
 *
 * Public endpoint (verify_jwt=false). Stamps clicked_at on a
 * membership_offers_sent row when the patient lands on /join. Frontend
 * (JoinTier.tsx) fires this on mount when ?invite=<token> is in the URL.
 *
 * Idempotent: stamps clicked_at only on first call; increments click_count
 * on subsequent calls + bumps last_clicked_at. No-ops cleanly on unknown
 * tokens (no leak about whether token exists).
 *
 * Body: { token, ua?, ref? }
 */

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
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    if (!token || token.length < 16) {
      // Always 200 so no token-existence leak.
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const ua = String(req.headers.get('user-agent') || body?.ua || '').substring(0, 250);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    const { data: existing } = await admin
      .from('membership_offers_sent')
      .select('id, clicked_at, click_count')
      .eq('tracking_token', token)
      .maybeSingle();
    if (!existing) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const isFirstClick = !(existing as any).clicked_at;
    const patch: any = {
      click_count: ((existing as any).click_count || 0) + 1,
      last_clicked_at: new Date().toISOString(),
      user_agent: ua,
      client_ip: ip,
    };
    if (isFirstClick) patch.clicked_at = patch.last_clicked_at;
    await admin.from('membership_offers_sent').update(patch).eq('id', (existing as any).id);

    return new Response(JSON.stringify({ ok: true, first_click: isFirstClick }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[track-membership-offer-click]', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
