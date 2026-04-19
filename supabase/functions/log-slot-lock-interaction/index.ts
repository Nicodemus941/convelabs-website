// log-slot-lock-interaction
// Anonymous telemetry endpoint. Patient clicks a 🔒 locked slot on the
// lab-request page → we log the click so product ops can measure real
// demand for each tier/slot combo. Fire-and-forget from the client; we
// never block the UI on this.
//
// Request:  { access_token, slot_date, slot_time, required_tier, current_tier?, unlock_price_cents?, visit_savings_cents? }
// Response: { ok: true } always (200 even on internal error — telemetry must never break UX)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const body = await req.json().catch(() => ({}));
    const {
      access_token,
      slot_date,
      slot_time,
      required_tier,
      current_tier,
      unlock_price_cents,
      visit_savings_cents,
    } = body || {};

    if (!access_token || !slot_date || !slot_time || !required_tier) return ok();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve the request + patient_email via the token (service role bypasses RLS).
    // Also validates the token — we don't want random writes from off-site scripts.
    const { data: request } = await admin
      .from('patient_lab_requests')
      .select('id, patient_email, access_token_expires_at')
      .eq('access_token', access_token)
      .maybeSingle();
    if (!request) return ok();
    if (new Date(request.access_token_expires_at) < new Date()) return ok();

    await admin.from('slot_lock_interactions').insert({
      lab_request_id: request.id,
      patient_email: request.patient_email,
      slot_date,
      slot_time,
      required_tier,
      current_tier: current_tier || 'none',
      unlock_price_cents: unlock_price_cents ?? null,
      visit_savings_cents: visit_savings_cents ?? null,
      user_agent: req.headers.get('user-agent')?.substring(0, 500) || null,
    });

    return ok();
  } catch (error: any) {
    console.error('log-slot-lock-interaction error:', error);
    return ok();
  }
});
