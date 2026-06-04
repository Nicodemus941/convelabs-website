/**
 * SUBMIT-REFERRING-PROVIDER
 *
 * Token-based "keep my doctor in the loop" capture for the branded
 * /pay/:token success screen (V2 embedded checkout stays on our page, so the
 * patient never reaches /welcome where the modal normally lives).
 *
 * Resolves the appointment + patient from the pay token server-side (no PHI
 * to the client), then calls capture_referring_provider — same path the
 * /welcome modal uses, which feeds the consented delivery-receipt + outreach.
 *
 * Body: { token, provider_name?, practice_name?, practice_phone?,
 *         practice_email?, practice_city?, consent? }
 * → { ok }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const b = await req.json().catch(() => ({}));
    const token: string = b?.token || '';
    if (!token) return json({ error: 'token_required' }, 400);
    if (!String(b?.provider_name || '').trim() && !String(b?.practice_name || '').trim()) {
      return json({ error: 'provider_or_practice_required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve appointment + patient from the pay token (server-side; no PHI client-side).
    const { data: tok } = await admin
      .from('appointment_pay_tokens')
      .select('appointment_id')
      .eq('access_token', token)
      .maybeSingle();
    if (!tok) return json({ error: 'token_not_found' }, 404);

    const { data: appt } = await admin
      .from('appointments')
      .select('id, patient_email, patient_name')
      .eq('id', tok.appointment_id)
      .maybeSingle();
    if (!appt) return json({ error: 'appointment_not_found' }, 404);

    const { data: refId, error } = await admin.rpc('capture_referring_provider' as any, {
      p_appointment_id: appt.id,
      p_patient_email: String(appt.patient_email || '').toLowerCase(),
      p_patient_name: appt.patient_name || '',
      p_provider_name: String(b?.provider_name || '').trim() || null,
      p_practice_name: String(b?.practice_name || '').trim() || null,
      p_practice_phone: String(b?.practice_phone || '').trim() || null,
      p_practice_email: String(b?.practice_email || '').trim().toLowerCase() || null,
      p_practice_city: String(b?.practice_city || '').trim() || null,
      p_consent: b?.consent === true,
    });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, referral_id: refId || null });
  } catch (e: any) {
    console.error('[submit-referring-provider] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
