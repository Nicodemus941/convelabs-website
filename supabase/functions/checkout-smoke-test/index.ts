// checkout-smoke-test — Hormozi-mandated P0 protection layer.
//
// Fires every 15 minutes. For each revenue-critical Stripe checkout
// endpoint, does three asserts:
//
//   1. OPTIONS preflight returns 2xx (catches boot errors like the
//      503 that killed payments for hours before a patient reported it)
//   2. POST with a minimal valid payload returns 2xx + sessionId + url
//      (catches compile errors + missing env vars + Stripe key rotation)
//   3. For the membership endpoint: retrieve the created session from
//      Stripe + verify the line-item name/description DOES NOT contain
//      stale 2025-launch strings like "August 1" or "September 1"
//      (catches stale-copy regressions)
//
// On ANY failure: SMS Nico immediately (bypasses quiet hours — revenue
// loss outranks sleep). Logs every run to activity_alerts_log for audit.
//
// Test sessions expire unused in 24h (Stripe default) — zero side effect.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { stripe } from '../_shared/stripe.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';

// Known-good plan ID for VIP membership (stable since 2025). If this
// ever becomes null in the DB, the smoke test itself will fail — a
// different alert, but still a loud one.
const VIP_PLAN_ID = '74d53564-5011-4fa9-969d-127f2d473def';
const TEST_EMAIL = 'checkout-smoke-test@convelabs.com';

interface CheckResult {
  step: string;
  ok: boolean;
  error?: string;
  details?: any;
}

// ── Assert the created Stripe session's line-item copy is clean ──
async function verifyMembershipSessionCopy(sessionId: string): Promise<CheckResult> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items.data.price.product'],
    });
    const item = session.line_items?.data?.[0];
    if (!item) return { step: 'verify_copy', ok: false, error: 'no line_items' };
    const product: any = (item.price as any)?.product;
    const name: string = product?.name || '';
    const description: string = product?.description || '';
    const combined = `${name} ${description}`.toLowerCase();

    // Any match = STALE COPY REGRESSION
    const forbidden = ['august 1', 'september 1', 'begins august', 'service begins', 'launch date'];
    for (const phrase of forbidden) {
      if (combined.includes(phrase)) {
        return {
          step: 'verify_copy',
          ok: false,
          error: `stale copy detected: "${phrase}" in line-item — membership would appear delayed to patient`,
          details: { name, description },
        };
      }
    }
    return { step: 'verify_copy', ok: true, details: { name, description } };
  } catch (e: any) {
    return { step: 'verify_copy', ok: false, error: e?.message || 'stripe retrieve failed' };
  }
}

async function smokeTestMembershipCheckout(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. OPTIONS preflight — retry-with-hysteresis (single 503 ≠ outage).
  // Supabase edge fns cold-boot every ~15 min if no traffic; the boot can
  // exceed 5s and return 503 transiently. Retry twice with backoff before
  // declaring the function dead.
  async function tryOptions(timeoutMs: number): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://www.convelabs.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, content-type',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (resp.status >= 500) return { ok: false, status: resp.status };
      return { ok: true, status: resp.status };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'timeout' };
    }
  }
  // Attempt 1: 6s
  let r = await tryOptions(6000);
  if (!r.ok) {
    // Attempt 2: 3s wait, 9s timeout (covers cold-start)
    await new Promise(res => setTimeout(res, 3000));
    r = await tryOptions(9000);
  }
  if (!r.ok) {
    // Attempt 3: 5s wait, 12s timeout (last chance — Supabase outage threshold)
    await new Promise(res => setTimeout(res, 5000));
    r = await tryOptions(12000);
  }
  if (!r.ok) {
    results.push({
      step: 'options_preflight',
      ok: false,
      error: r.status ? `${r.status} after 3 retries (real outage)` : `${r.error} after 3 retries`,
    });
    return results;
  }
  results.push({ step: 'options_preflight', ok: true });

  // 2. POST — retry-with-hysteresis (3 attempts) for SUPABASE_EDGE_RUNTIME_ERROR
  //    transients on the POST handler too. v4: was previously single-shot and
  //    fired a false-alarm SMS at 04:30 UTC 2026-04-26 on a Supabase-platform
  //    503. Same hysteresis pattern as OPTIONS step above.
  async function tryPost(timeoutMs: number) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: VIP_PLAN_ID, billingFrequency: 'annually', guestCheckoutEmail: TEST_EMAIL }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        return { ok: false, status: resp.status, body: body.substring(0, 200) };
      }
      const data = await resp.json();
      if (!data.sessionId || !data.url) return { ok: false, status: 200, body: 'response missing sessionId or url' };
      return { ok: true, sessionId: data.sessionId };
    } catch (e: any) { return { ok: false, error: e?.message || 'timeout' }; }
  }
  let p: any = await tryPost(15000);
  if (!p.ok && (p.status === 503 || p.error || (p.status && p.status >= 500))) {
    await new Promise(res => setTimeout(res, 4000)); p = await tryPost(18000);
  }
  if (!p.ok && (p.status === 503 || p.error || (p.status && p.status >= 500))) {
    await new Promise(res => setTimeout(res, 6000)); p = await tryPost(20000);
  }
  if (!p.ok) {
    results.push({ step: 'post_checkout', ok: false, error: p.status ? `HTTP ${p.status} after 3 retries: ${p.body || ''}` : `${p.error} after 3 retries` });
    return results;
  }
  results.push({ step: 'post_checkout', ok: true, details: { sessionId: p.sessionId } });

  if (p.sessionId) {
    results.push(await verifyMembershipSessionCopy(p.sessionId));
  }

  return results;
}

async function sendSMS(body: string): Promise<{ ok: boolean; sid: string | null }> {
  if (!TWILIO_SID || !TWILIO_TOKEN) return { ok: false, sid: null };
  const to = OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`;
  const params = new URLSearchParams();
  params.append('To', to);
  params.append('Body', body.substring(0, 1500));
  params.append('From', TWILIO_FROM);
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  );
  if (!resp.ok) return { ok: false, sid: null };
  const json = await resp.json().catch(() => ({}));
  return { ok: true, sid: (json as any)?.sid || null };
}

// ── Worst-case appointment-checkout smoke (Westphal-class metadata cap) ──
// Sends a payload with EVERY conditional that adds metadata fired at once
// so we'd catch a future "51 keys" regression before any patient does.
async function smokeTestAppointmentCheckout(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const url = `${SUPABASE_URL}/functions/v1/create-appointment-checkout`;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const payload = {
    serviceType: 'specialty-kit',
    serviceName: 'Specialty Collection Kit (smoke)',
    amount: 18500, // $185 base
    tipAmount: 0,
    appointmentDate: tomorrow,
    appointmentTime: '10:00 AM',
    memberTier: 'none',
    patientDetails: {
      firstName: 'SmokeTest', lastName: 'Patient',
      email: 'checkout-smoke-test@convelabs.com',
      phone: '+15555550100',
    },
    locationDetails: {
      address: '123 Smoke Test Ln', city: 'Orlando', state: 'FL',
      zipCode: '32801', locationType: 'home',
      instructions: 'smoke test', aptUnit: '1A', gateCode: '#0000',
    },
    serviceDetails: { sameDay: false, weekend: false, additionalNotes: 'smoke test run' },
    pricingBreakdown: { service: { type: 'specialty-kit', label: 'Specialty Kit', price: 185 } },
    labOrderFilePaths: [], insuranceCardPath: null,
    labDestination: 'ups', labDestinationPending: false,
    specialtyKitBundle: { patients: [{ kits: 1 }], isGenova: false },
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Origin': 'https://www.convelabs.com' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const body = await resp.text().catch(() => '');
    if (!resp.ok) {
      // Specifically detect the Stripe metadata cap error
      const isMetadataCap = body.includes('up to 50 keys');
      results.push({
        step: 'appointment_checkout_post',
        ok: false,
        error: isMetadataCap
          ? `STRIPE METADATA CAP HIT: ${body.substring(0, 200)}`
          : `HTTP ${resp.status}: ${body.substring(0, 200)}`,
      });
      return results;
    }
    const data = JSON.parse(body || '{}');
    if (!data.sessionId) {
      results.push({ step: 'appointment_checkout_post', ok: false, error: 'no sessionId returned' });
      return results;
    }
    results.push({ step: 'appointment_checkout_post', ok: true, details: { sessionId: data.sessionId } });

    // Verify metadata key count by retrieving the actual session
    try {
      const sess: any = await stripe.checkout.sessions.retrieve(data.sessionId);
      const keyCount = Object.keys(sess.metadata || {}).length;
      if (keyCount > 48) {
        results.push({ step: 'appointment_metadata_keys', ok: false, error: `${keyCount}/50 keys (over safety threshold)` });
      } else {
        results.push({ step: 'appointment_metadata_keys', ok: true, details: { keyCount } });
      }
    } catch (e: any) {
      results.push({ step: 'appointment_metadata_keys', ok: false, error: `verify failed: ${e?.message || e}` });
    }
  } catch (e: any) {
    results.push({ step: 'appointment_checkout_post', ok: false, error: e?.message || 'timeout' });
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAt = new Date().toISOString();
  const results = await smokeTestMembershipCheckout();
  // Append appointment-checkout coverage so the 15-min cron also catches
  // any future patient-facing booking regression (Westphal-class cap, etc.)
  const apptResults = await smokeTestAppointmentCheckout();
  results.push(...apptResults);
  const failures = results.filter((r) => !r.ok);
  const success = failures.length === 0;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Log every run to activity_alerts_log — both success and failure
  await supabase
    .from('activity_alerts_log')
    .insert({
      alert_type: success ? 'heartbeat' : 'error',
      summary: success
        ? 'Checkout smoke test passed'
        : `🚨 CHECKOUT SMOKE FAIL: ${failures.map((f) => `${f.step}:${f.error}`).join(' | ')}`,
      channel: success ? 'none' : 'sms',
      details: {
        probe: 'checkout_smoke_test',
        started_at: startedAt,
        results,
      },
    })
    .then(() => {}, (e: any) => console.warn('log insert failed:', e?.message));

  // SMS on failure — overrides quiet hours (this is money)
  if (!success) {
    const msg = `🚨 CHECKOUT SMOKE FAILED 🚨\n${failures
      .map((f) => `${f.step}: ${f.error}`)
      .join('\n')}\n\nPatients may not be able to pay. Check Supabase fn logs now.`;
    await sendSMS(msg);
  }

  return new Response(
    JSON.stringify({
      success,
      started_at: startedAt,
      duration_ms: Date.now() - new Date(startedAt).getTime(),
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
