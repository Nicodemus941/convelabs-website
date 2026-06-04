/**
 * GET-APPOINTMENT-PAY-DETAILS
 *
 * Token-only (appointment_pay_tokens.access_token). Powers the branded
 * /pay/:token checkout page. Returns the visit summary + pre-tip subtotal +
 * status so the page can render review → tip → pay. No PHI in the URL; the
 * token is the bearer credential. Read-only.
 *
 * GET  ?token=...   OR   POST { token }
 * → { ok, status, appointment:{...}, subtotal_cents, terms_url, privacy_url }
 *   status ∈ 'unpaid' | 'paid' | 'expired' | 'voided'
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    let token = '';
    if (req.method === 'GET') token = new URL(req.url).searchParams.get('token') || '';
    else token = (await req.json().catch(() => ({})))?.token || '';
    if (!token) return json({ error: 'token_required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tok } = await admin
      .from('appointment_pay_tokens')
      .select('id, appointment_id, expires_at, revoked_at, paid_at')
      .eq('access_token', token)
      .maybeSingle();
    if (!tok) return json({ error: 'token_not_found' }, 404);

    if (tok.revoked_at) return json({ ok: true, status: 'voided' });
    if (tok.paid_at) return json({ ok: true, status: 'paid' });
    if (new Date(tok.expires_at) < new Date()) return json({ ok: true, status: 'expired' });

    const { data: a } = await admin
      .from('appointments')
      .select('id, patient_name, appointment_date, appointment_time, address, service_type, service_name, total_amount, surcharge_amount, tip_amount, payment_status, status, phlebotomist_id')
      .eq('id', tok.appointment_id)
      .maybeSingle();
    if (!a) return json({ error: 'appointment_not_found' }, 404);

    // Already paid / cancelled elsewhere?
    if (['completed', 'paid'].includes(String(a.payment_status))) return json({ ok: true, status: 'paid' });
    if (['cancelled', 'no_show'].includes(String(a.status))) return json({ ok: true, status: 'voided' });

    // Pre-tip subtotal = grand total minus any tip already on the row
    // (total_amount convention = service + surcharge + tip; for an unpaid
    // invoice tip is 0, so this is the service+surcharge amount due).
    const subtotalCents = Math.max(0, Math.round((Number(a.total_amount || 0) - Number(a.tip_amount || 0)) * 100));

    let phlebName: string | null = null;
    if (a.phlebotomist_id) {
      const { data: sp } = await admin.from('staff_profiles').select('first_name').eq('user_id', a.phlebotomist_id).maybeSingle();
      phlebName = (sp as any)?.first_name || null;
    }

    return json({
      ok: true,
      status: 'unpaid',
      subtotal_cents: subtotalCents,
      terms_url: `${SITE}/terms-of-service`,
      privacy_url: `${SITE}/privacy-policy`,
      appointment: {
        patient_first_name: String(a.patient_name || 'there').split(' ')[0],
        appointment_date: a.appointment_date,
        appointment_time: a.appointment_time,
        address: a.address,
        service_name: a.service_name || a.service_type || 'Mobile Blood Draw',
        phleb_first_name: phlebName,
      },
    });
  } catch (e: any) {
    console.error('[get-appointment-pay-details] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
