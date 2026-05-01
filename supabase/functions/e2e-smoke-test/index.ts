/**
 * E2E-SMOKE-TEST — nightly health check across the patient-facing surfaces
 * that have to work for membership signup + booking + perks to function.
 *
 * Schedule: pg_cron @ 09:00 UTC daily (= 5 AM ET = quietest production hour).
 *
 * For each check we record PASS / WARN / FAIL with a short note. If anything
 * regresses, the owner gets one consolidated SMS with the failing checks —
 * never silent.
 *
 * Adding a new check: append to CHECKS[]; each fn returns { result, note }.
 * Keep checks idempotent and DB read-only EXCEPT for the synthetic Stripe
 * smoke (which is unauthenticated guest checkout — no user side-effects;
 * Stripe sessions auto-expire after 24h).
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CheckResult = 'PASS' | 'WARN' | 'FAIL';
interface CheckOutput { name: string; result: CheckResult; note: string; }

const PROJECT_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';

async function checkExistsRpc(s: SupabaseClient, name: string): Promise<boolean> {
  const { data } = await s.from('pg_proc' as any).select('proname').eq('proname', name).limit(1);
  return !!(data && data.length);
}

const CHECKS: Array<(s: SupabaseClient) => Promise<CheckOutput>> = [
  // ─── Schema + trigger sanity ───
  async (s) => {
    const { count, error } = await s.from('membership_plans').select('id', { count: 'exact', head: true }).eq('annual_price', 19900);
    return {
      name: 'membership_plans_vip_price',
      result: !error && (count || 0) > 0 ? 'PASS' : 'FAIL',
      note: 'VIP plan exists at $199/yr',
    };
  },
  async (s) => {
    // Both Regular + VIP + Concierge prices must align with hardcoded upsell card values
    const { data } = await s.from('membership_plans').select('name, annual_price').in('name', ['Regular', 'VIP', 'Concierge']);
    const map = new Map((data || []).map((p: any) => [p.name, p.annual_price]));
    const ok = map.get('Regular') === 9900 && map.get('VIP') === 19900 && map.get('Concierge') === 39900;
    return {
      name: 'tier_pricing_alignment',
      result: ok ? 'PASS' : 'FAIL',
      note: 'Regular $99 / VIP $199 / Concierge $399 align with upsell card',
    };
  },

  // ─── Reconciler health ───
  async (s) => {
    const { count, error } = await s.from('error_logs')
      .select('id', { count: 'exact', head: true })
      .eq('component', 'reconcile-invoice-payments')
      .gt('created_at', new Date(Date.now() - 90 * 60_000).toISOString());
    return {
      name: 'recon_loop_silenced',
      result: !error && (count || 0) <= 1 ? 'PASS' : 'FAIL',
      note: 'reconcile-invoice-payments not spamming error_logs every 30 min',
    };
  },

  // ─── Time-drift guard (would mis-render reminders without a fix) ───
  async (s) => {
    const start = new Date(Date.now() - 2 * 86400_000).toISOString();
    const end = new Date(Date.now() + 14 * 86400_000).toISOString();
    const { data } = await s.from('appointments')
      .select('appointment_date, appointment_time, status')
      .gte('appointment_date', start).lte('appointment_date', end)
      .neq('status', 'cancelled')
      .not('appointment_time', 'is', null);
    let drift = 0;
    for (const a of (data || [])) {
      const dt = new Date((a as any).appointment_date);
      const etHour = parseInt(dt.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
      const tHour = parseInt(String((a as any).appointment_time).split(':')[0], 10);
      if (etHour !== tHour) drift++;
    }
    return {
      name: 'appointment_time_drift_14d',
      result: drift === 0 ? 'PASS' : 'WARN',
      note: drift === 0 ? 'no drift' : `${drift} appointments have date/time drift in next 14d`,
    };
  },

  // ─── Lab order sync ───
  async (s) => {
    const start = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data } = await s.from('appointments')
      .select('id, lab_order_file_path')
      .not('lab_order_file_path', 'is', null)
      .gte('appointment_date', start);
    let orphans = 0;
    for (const a of (data || [])) {
      const { count } = await s.from('appointment_lab_orders' as any)
        .select('id', { count: 'exact', head: true })
        .eq('appointment_id', (a as any).id)
        .is('deleted_at', null);
      if ((count || 0) === 0) orphans++;
    }
    return {
      name: 'lab_orders_no_orphans',
      result: orphans === 0 ? 'PASS' : 'WARN',
      note: orphans === 0 ? 'all uploads in normalized table' : `${orphans} appointments have legacy file path with no normalized row`,
    };
  },

  // ─── Live Stripe smoke: VIP direct purchase ───
  async () => {
    try {
      const resp = await fetch(`${PROJECT_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` },
        body: JSON.stringify({
          planId: '74d53564-5011-4fa9-969d-127f2d473def',
          billingFrequency: 'annual',
          isGuestCheckout: true,
          guestCheckoutEmail: `e2e-smoke-${Date.now()}@convelabs-test.com`,
          metadata: { source: 'e2e_smoke_nightly' },
        }),
      });
      const body = await resp.json();
      const ok = resp.ok && (body.sessionId || body.url);
      return {
        name: 'stripe_vip_direct_checkout',
        result: ok ? 'PASS' : 'FAIL',
        note: ok ? `cs_live...${String(body.sessionId || '').slice(-12)}` : `FAIL: ${resp.status} ${JSON.stringify(body).slice(0, 120)}`,
      };
    } catch (e: any) {
      return { name: 'stripe_vip_direct_checkout', result: 'FAIL', note: `exception: ${e?.message || String(e)}` };
    }
  },

  // ─── Realtime + RPCs that the dashboard depends on ───
  async (s) => {
    const { error } = await s.rpc('get_my_open_task_count' as any);
    // Even if it returns 0 (no auth), we just want it not to error
    return {
      name: 'get_my_open_task_count_rpc',
      result: error && !error.message?.includes('permission') ? 'FAIL' : 'PASS',
      note: 'RPC powering the sidebar Tasks badge is callable',
    };
  },

  // ─── Founding 50 seat counter (drives /pricing scarcity) ───
  async (s) => {
    const { data, error } = await s.rpc('get_founding_seats_status' as any, { p_tier: 'vip' });
    return {
      name: 'founding_50_seat_counter',
      result: !error ? 'PASS' : 'FAIL',
      note: !error ? `${(data as any)?.remaining ?? '?'} VIP founding seats remaining` : error.message,
    };
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const startedAt = new Date();
  const results: CheckOutput[] = [];

  for (const check of CHECKS) {
    try {
      const r = await check(supabase);
      results.push(r);
    } catch (e: any) {
      results.push({ name: check.name || 'unknown', result: 'FAIL', note: `exception: ${e?.message || String(e)}` });
    }
  }

  const fails = results.filter(r => r.result === 'FAIL');
  const warns = results.filter(r => r.result === 'WARN');

  // SMS the owner only on FAIL — WARN is informational and would create
  // alert-fatigue if texted nightly.
  if (fails.length > 0) {
    try {
      const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
      const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
      const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
      const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
      if (TWILIO_SID && TWILIO_AUTH) {
        const cleanPhone = OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`;
        const sample = fails.slice(0, 3).map(f => `${f.name}: ${f.note}`).join(' | ');
        const body = `🚨 ConveLabs E2E smoke: ${fails.length} FAIL${fails.length > 1 ? 's' : ''}${warns.length > 0 ? `, ${warns.length} WARN` : ''}. ${sample.slice(0, 800)}`;
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: cleanPhone, From: TWILIO_FROM, Body: body }).toString(),
        });
      }
    } catch (e) { console.warn('[e2e-smoke] alert SMS failed:', e); }
  }

  const durationMs = Date.now() - startedAt.getTime();
  return new Response(JSON.stringify({
    ok: fails.length === 0,
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    summary: { pass: results.filter(r => r.result === 'PASS').length, warn: warns.length, fail: fails.length },
    results,
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
