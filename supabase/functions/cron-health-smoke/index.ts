/**
 * CRON-HEALTH-SMOKE
 *
 * Hourly safety net that asks two questions about every active cron job:
 *
 *   1. "Is it firing?"
 *      Compare `cron.job_run_details.last_run` against the schedule's
 *      expected interval. If `now() - last_run > expected_interval * 2`,
 *      the cron has gone silent.
 *
 *   2. "Is the HTTP target actually accepting the call?"
 *      Most crons here are `SELECT net.http_post(...)` to an edge function.
 *      pg_cron reports `succeeded` the moment the SQL finishes — even if
 *      the HTTP target returned 401/500. Cross-reference `net._http_response`
 *      for any 4xx/5xx in the last hour against any /functions/v1/ URL.
 *
 * Owner SMS only fires when something is broken. Quiet on healthy state.
 *
 * This was built after we discovered (2026-04-28) that
 * `detect-double-bookings`, `activity-monitor`, and
 * `provider-outreach-scheduler` had been silently 401-ing on every cron
 * run — pg_cron reported success because the SQL completed, but the edge
 * function body never executed. With this smoke in place, the same class
 * of silent failure now pages the owner within an hour.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Convert a 5-field cron schedule into a maximum expected gap between runs,
// in milliseconds. We're conservative — if the cron is "every 15 min" we
// expect a run every 15 min, so flag silence after 30 min (2× cushion).
function expectedIntervalMs(schedule: string): number {
  const m = (schedule || '').trim().split(/\s+/);
  if (m.length < 5) return 60 * 60 * 1000; // unknown → 1h
  const minute = m[0];
  const hour = m[1];
  const dom = m[2];
  const dow = m[4];

  // monthly (specific day of month) → 31 days
  if (dom !== '*' && /^\d+$/.test(dom)) return 31 * 24 * 60 * 60 * 1000;
  // weekly (specific day of week) → 7 days
  if (dow !== '*' && /^\d+$/.test(dow)) return 7 * 24 * 60 * 60 * 1000;
  // daily (specific hour, * minute) → 24h
  if (hour !== '*' && minute === '0') return 24 * 60 * 60 * 1000;
  if (hour !== '*' && /^\d+$/.test(minute)) return 24 * 60 * 60 * 1000;
  // every-N-hours: "0 */6 * * *"
  const everyN = /^\*\/(\d+)$/.exec(hour);
  if (everyN) return parseInt(everyN[1], 10) * 60 * 60 * 1000;
  // every-N-minutes: "*/15 * * * *"
  const everyMin = /^\*\/(\d+)$/.exec(minute);
  if (everyMin) return parseInt(everyMin[1], 10) * 60 * 1000;
  // hourly fallback: "0 * * * *"
  if (minute === '0' && hour === '*') return 60 * 60 * 1000;
  // anything we don't parse → treat as hourly
  return 60 * 60 * 1000;
}

async function sendOwnerSMS(message: string): Promise<void> {
  if (!TWILIO_SID || !TWILIO_AUTH) {
    console.warn('[cron-health] Twilio not configured — would have sent:', message);
    return;
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const cleanPhone = OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`;
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: cleanPhone, Body: message.substring(0, 1500), From: TWILIO_FROM,
      }).toString(),
    });
  } catch (e) {
    console.error('[cron-health] SMS send failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const issues: { kind: string; detail: string }[] = [];

    // 1. CRON FIRING CHECK — every active cron should have run within
    //    its expected_interval × 2. Backed by SECURITY DEFINER RPC
    //    public.get_cron_health() which reads cron.job + job_run_details.
    const { data: cronHealth, error: cronErr } = await (supabase as any).rpc('get_cron_health');
    if (cronErr) {
      console.warn('[cron-health] get_cron_health RPC error:', cronErr.message);
    }
    const rows: any[] = (cronHealth as any[]) || [];

    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    for (const r of rows) {
      const interval = expectedIntervalMs(r.schedule);
      const lastRunMs = r.last_run ? new Date(r.last_run).getTime() : 0;
      const gap = lastRunMs ? now - lastRunMs : Infinity;
      const isNeverRun = !lastRunMs;

      // Suppress "never run" alerts for monthly/weekly crons — they
      // legitimately won't have a last_run until their first scheduled
      // trigger lands. A monthly cron added on the 28th of the month
      // shouldn't page until after the 1st of next month + 1 day cushion.
      if (isNeverRun && interval > ONE_DAY_MS) {
        continue;
      }

      if (gap > interval * 2) {
        const gapHrs = lastRunMs ? Math.round(gap / 3_600_000) : null;
        issues.push({
          kind: 'silent_cron',
          detail: `${r.jobname} (${r.schedule}) — ${gapHrs !== null ? `last run ${gapHrs}h ago` : 'never run'}`,
        });
      }
      if (r.recent_failures && r.recent_failures > 3) {
        issues.push({
          kind: 'failing_cron',
          detail: `${r.jobname} — ${r.recent_failures} failures in last 24h`,
        });
      }
    }

    // 2. HTTP-RESPONSE CHECK — pg_net stores every http_post response.
    //    Any 4xx/5xx in the last hour signals a silent failure (cron
    //    fires SQL successfully, but the edge function rejects the call).
    //    pg_net deletes the request queue after dispatch, so we can only
    //    report aggregate counts by status code — owner cross-references
    //    the edge-function dashboard to find the specific function.
    const { data: badResponses } = await (supabase as any).rpc('get_recent_http_failures');
    const failures: any[] = (badResponses as any[]) || [];
    for (const f of failures) {
      // Only escalate when the count is non-trivial (one-off 401 / 503
      // can be a transient cold-start; 5+ in an hour is a real failure)
      if (f.fail_count >= 5) {
        issues.push({
          kind: 'http_failure',
          detail: `${f.fail_count} × HTTP ${f.status_code} responses in last hour (check edge-function logs)`,
        });
      }
    }

    // 3. Compose owner SMS only if there's something to report
    if (issues.length > 0) {
      const summary = issues.slice(0, 8).map(i => `• ${i.detail}`).join('\n');
      const more = issues.length > 8 ? `\n+${issues.length - 8} more` : '';
      await sendOwnerSMS(
        `⚠️ Cron health check — ${issues.length} issue${issues.length > 1 ? 's' : ''}:\n${summary}${more}\nDashboard: ${SUPABASE_URL.replace('.supabase.co', '')}`
      );
    }

    return new Response(JSON.stringify({
      ok: true,
      checked_at: new Date().toISOString(),
      crons_checked: rows.length,
      http_failures_seen: failures.length,
      issues_found: issues.length,
      issues,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[cron-health] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
