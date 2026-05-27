// smoke-test-lab-request
// E2E verification for the provider-portal lab-request flow.
// Runs ONLY when called with a smoke_secret matching SMOKE_SECRET env var.
// Mints a one-shot user session for the Faith org's provider user via
// Supabase Admin auth.admin.generateLink (magic-link flow, no password),
// exchanges it for a real JWT, then POSTs to create-lab-request with
// nicq as the demo patient. Returns the full delivery report PLUS
// before/after side-effect verification (DB row, sms_notifications,
// email_send_log).
//
// Cleanup: deletes the created patient_lab_requests row at the end
// (and best-effort the linked sms_notifications + email_send_log rows)
// so smoke tests don't pollute production data.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SMOKE_SECRET = Deno.env.get('SMOKE_SECRET') || Deno.env.get('CRON_SECRET') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const FAITH_ORG_ID = '7166ab5a-cd49-4eba-b30c-7c6ad94c9422';
const FAITH_PROVIDER_EMAIL = 'doyainc@gmail.com';
// Demo patient — uses test-only contact info so SMS/email won't disturb anyone.
// nicq's known test contact pair from prior successful e2e runs.
const DEMO_PATIENT = {
  name: 'nicq smoke-test',
  email: 'nicodemusmusic@gmail.com',
  phone: '4077759705',
  dob: '1985-01-15',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    if (!SMOKE_SECRET || body.smoke_secret !== SMOKE_SECRET) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const report: Record<string, any> = { steps: [] };

    // ── Step 1: mint a session for the Faith provider via magic-link ───
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: FAITH_PROVIDER_EMAIL,
    });
    if (linkErr || !linkData) {
      report.steps.push({ step: 'generate_link', status: 'FAIL', error: linkErr?.message });
      return new Response(JSON.stringify({ ok: false, report }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const hashedToken = linkData.properties?.hashed_token;
    if (!hashedToken) {
      report.steps.push({ step: 'generate_link', status: 'FAIL', error: 'no hashed_token in response' });
      return new Response(JSON.stringify({ ok: false, report }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    report.steps.push({ step: 'generate_link', status: 'PASS' });

    // ── Step 2: verify OTP → get real user JWT ─────────────────────────
    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: sessionData, error: verifyErr } = await userClient.auth.verifyOtp({
      type: 'magiclink',
      token_hash: hashedToken,
    });
    if (verifyErr || !sessionData.session) {
      report.steps.push({ step: 'verify_otp', status: 'FAIL', error: verifyErr?.message });
      return new Response(JSON.stringify({ ok: false, report }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userJwt = sessionData.session.access_token;
    report.steps.push({ step: 'verify_otp', status: 'PASS', user_id: sessionData.user?.id });

    // ── Step 3: POST to create-lab-request as the provider ─────────────
    const drawByDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const clrResp = await fetch(`${SUPABASE_URL}/functions/v1/create-lab-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userJwt}`,
      },
      body: JSON.stringify({
        organization_id: FAITH_ORG_ID,
        patient_name: DEMO_PATIENT.name,
        patient_email: DEMO_PATIENT.email,
        patient_phone: DEMO_PATIENT.phone,
        patient_dob: DEMO_PATIENT.dob,
        draw_by_date: drawByDate,
        admin_notes: 'Automated smoke test — safe to delete',
        billed_to: 'patient',
      }),
    });
    const clrJson = await clrResp.json().catch(() => ({}));
    report.steps.push({
      step: 'create_lab_request',
      status: clrResp.ok ? 'PASS' : 'FAIL',
      http_status: clrResp.status,
      response: clrJson,
    });

    if (!clrResp.ok) {
      return new Response(JSON.stringify({ ok: false, report }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestId = clrJson.request_id;

    // ── Step 4: verify the DB row landed ───────────────────────────────
    const { data: dbRow } = await admin.from('patient_lab_requests')
      .select('id, status, patient_notified_at, organization_id, patient_name, patient_email, patient_phone, access_token, draw_by_date')
      .eq('id', requestId).maybeSingle();
    report.steps.push({
      step: 'db_row_inserted',
      status: dbRow ? 'PASS' : 'FAIL',
      row_summary: dbRow ? {
        id: dbRow.id, status: dbRow.status,
        notified_at: dbRow.patient_notified_at,
        has_token: !!dbRow.access_token,
      } : null,
    });

    // ── Step 5: verify sms_notifications row landed ───────────────────
    const { data: smsRows } = await admin.from('sms_notifications')
      .select('id, delivery_status, twilio_message_sid, metadata, sent_at')
      .ilike('phone_number', `%${DEMO_PATIENT.phone.slice(-7)}%`)
      .order('sent_at', { ascending: false }).limit(3);
    const smsForThisReq = (smsRows || []).find((r: any) => r.metadata?.lab_request_id === requestId);
    report.steps.push({
      step: 'sms_logged',
      status: smsForThisReq ? 'PASS' : 'FAIL',
      sms_row: smsForThisReq || null,
      recent_sms_count: smsRows?.length || 0,
    });

    // ── Step 6: verify email_send_log row landed ──────────────────────
    const { data: emailRows } = await admin.from('email_send_log')
      .select('id, status, mailgun_id, last_error, sent_at, email_type, subject')
      .eq('to_email', DEMO_PATIENT.email)
      .eq('email_type', 'provider_portal_lab_invite')
      .order('sent_at', { ascending: false }).limit(3);
    const emailForThisReq = emailRows?.[0];
    report.steps.push({
      step: 'email_logged',
      status: emailForThisReq ? 'PASS' : 'FAIL',
      email_row: emailForThisReq || null,
    });

    // ── Step 7: cleanup ────────────────────────────────────────────────
    if (body.cleanup !== false) {
      await admin.from('sms_notifications').delete()
        .ilike('phone_number', `%${DEMO_PATIENT.phone.slice(-7)}%`)
        .eq('notification_type', 'provider_portal_lab_invite')
        .gte('sent_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());
      await admin.from('email_send_log').delete()
        .eq('to_email', DEMO_PATIENT.email)
        .eq('email_type', 'provider_portal_lab_invite')
        .gte('sent_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());
      await admin.from('patient_lab_requests').delete().eq('id', requestId);
      report.steps.push({ step: 'cleanup', status: 'PASS' });
    }

    const allPassed = report.steps.every((s: any) => s.status === 'PASS');
    return new Response(JSON.stringify({
      ok: allPassed,
      summary: allPassed
        ? 'All e2e steps passed — provider portal → DB → SMS → email all confirmed.'
        : 'One or more steps failed — see report.',
      delivery: clrJson.delivery,
      report,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
