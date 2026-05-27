// admin-fire-lab-invite-jj
// One-shot: send JJ Mandato's booking-invite SMS + email AS Lara from
// Littleton Concierge Medicine. Hardcoded payload (single-purpose) so
// the function can't be misused to spam other recipients.
//
// Auth: requires SMOKE_SECRET / CRON_SECRET in request body so only
// owner can fire it.
//
// Flow: server-side magic-link mint for Lara → verifyOtp → POST to
// create-lab-request with JJ's data. Returns the full delivery report.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SMOKE_SECRET = Deno.env.get('SMOKE_SECRET') || Deno.env.get('CRON_SECRET') || '';

// Hardcoded — this function can ONLY send to JJ.
const LARA_EMAIL = 'larak@jasonmd.com';
const LITTLETON_ORG_ID = 'a641125b-3343-43a3-9a17-ce47754e6ec8';
const PATIENT = {
  name: 'John Mandato',
  email: 'jjmandato@me.com',
  phone: '4073455555',
  // No DOB yet — Lara can update later. Function permits null.
  dob: null as string | null,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // PERMANENTLY DISABLED. This function fired its single-use invite to
    // JJ Mandato successfully at 2026-05-27 18:15 UTC (patient_lab_request
    // d133c9d8-3dc7-4677-8726-6279d90189e6). Kept in repo as historical
    // reference for the smoke-flow pattern. To re-enable, replace the
    // body of Deno.serve with the production version that gates on
    // SMOKE_SECRET/CRON_SECRET.
    return new Response(JSON.stringify({ error: 'one-shot function disabled — already fired' }), {
      status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    // @ts-ignore — remainder of original body is intentionally unreachable.
    const body = await req.json().catch(() => ({}));

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Mint Lara's session via magic-link generation (no password needed)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: LARA_EMAIL,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return new Response(JSON.stringify({ ok: false, step: 'generate_link', error: linkErr?.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: sessionData, error: verifyErr } = await userClient.auth.verifyOtp({
      type: 'magiclink',
      token_hash: linkData.properties.hashed_token,
    });
    if (verifyErr || !sessionData.session) {
      return new Response(JSON.stringify({ ok: false, step: 'verify_otp', error: verifyErr?.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 14 days out — Lara can adjust later. (Function accepts patient
    // self-pay billing since the PDF + actual lab orders will be
    // uploaded by Lara after JJ books his appointment.)
    const drawBy = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const clrResp = await fetch(`${SUPABASE_URL}/functions/v1/create-lab-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({
        organization_id: LITTLETON_ORG_ID,
        patient_name: PATIENT.name,
        patient_email: PATIENT.email,
        patient_phone: PATIENT.phone,
        patient_dob: PATIENT.dob,
        draw_by_date: drawBy,
        admin_notes: 'Lab order PDF will be uploaded after JJ schedules — please proceed to book.',
        billed_to: 'patient',
      }),
    });
    const clrJson = await clrResp.json().catch(() => ({}));

    return new Response(JSON.stringify({
      ok: clrResp.ok,
      http_status: clrResp.status,
      response: clrJson,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
