/**
 * RESOLVE-BOOKING-PREFILL
 *
 * Public, no-auth: takes a `token` query param, returns the booking prefill
 * payload so the patient lands on /book-now with service + identity already
 * populated. Stamps opened_at on first read, increments open_count on every
 * read.
 *
 * GET /resolve-booking-prefill?token=...
 *
 * Returns:
 *   { ok, expired, consumed, prefill: {...} }
 *
 * verify_jwt=false (public — token IS the auth).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || '';
    if (!token || token.length < 8) {
      return new Response(JSON.stringify({ error: 'token_required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: row } = await admin
      .from('booking_prefill_tokens')
      .select('id, token, patient_id, patient_first_name, patient_last_name, patient_email, patient_phone, service_type, service_name, service_price_cents, organization_id, billed_to, expires_at, consumed_at, open_count')
      .eq('token', token)
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ ok: false, error: 'token_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hormozi "make it simple": also pull the patient's last-known address
    // + insurance from tenant_patients so the booking flow can skip the
    // Location and Insurance steps entirely when the data is on file.
    let addressData: any = null;
    let insuranceData: any = null;
    if ((row as any).patient_id) {
      const { data: tp } = await admin
        .from('tenant_patients')
        .select('address, city, state, zipcode, gate_code, date_of_birth, insurance_provider, insurance_member_id, insurance_group_number')
        .eq('id', (row as any).patient_id)
        .maybeSingle();
      if (tp) {
        addressData = {
          address: (tp as any).address || null,
          city: (tp as any).city || null,
          state: (tp as any).state || null,
          zip_code: (tp as any).zipcode || null,
          gate_code: (tp as any).gate_code || null,
        };
        insuranceData = {
          provider: (tp as any).insurance_provider || null,
          member_id: (tp as any).insurance_member_id || null,
          group_number: (tp as any).insurance_group_number || null,
          date_of_birth: (tp as any).date_of_birth || null,
        };
      }
    }

    const expired = new Date((row as any).expires_at).getTime() < Date.now();
    const consumed = !!((row as any).consumed_at);

    // Stamp opened_at + bump open_count even if expired/consumed (audit signal)
    await admin.from('booking_prefill_tokens')
      .update({
        opened_at: (row as any).open_count === 0 ? new Date().toISOString() : undefined,
        open_count: ((row as any).open_count || 0) + 1,
      })
      .eq('id', (row as any).id);

    if (expired) {
      return new Response(JSON.stringify({ ok: false, expired: true, message: 'This booking link has expired. Please ask for a fresh one.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (consumed) {
      return new Response(JSON.stringify({ ok: false, consumed: true, message: 'This booking link has already been used.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      prefill: {
        token_id: (row as any).id,
        patient_id: (row as any).patient_id,
        first_name: (row as any).patient_first_name,
        last_name: (row as any).patient_last_name,
        email: (row as any).patient_email,
        phone: (row as any).patient_phone,
        service_type: (row as any).service_type,
        service_name: (row as any).service_name,
        service_price_cents: (row as any).service_price_cents,
        organization_id: (row as any).organization_id,
        billed_to: (row as any).billed_to,
        // Hormozi "make it simple" — patient's last-known address +
        // insurance so the booking flow can skip those steps when data
        // is on file.
        address: addressData?.address || null,
        city: addressData?.city || null,
        state: addressData?.state || null,
        zip_code: addressData?.zip_code || null,
        gate_code: addressData?.gate_code || null,
        date_of_birth: insuranceData?.date_of_birth || null,
        insurance_provider: insuranceData?.provider || null,
        insurance_member_id: insuranceData?.member_id || null,
        insurance_group_number: insuranceData?.group_number || null,
      },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[resolve-booking-prefill] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
