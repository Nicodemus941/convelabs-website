/**
 * AUDIT-PHLEB-PAYOUTS-V4-NIGHTLY
 *
 * Runs once at 03:45 ET. Calls audit_phleb_payouts_v4_digest(1) for the
 * previous calendar day. If net business drift exceeds tolerance OR any
 * single appointment is off by more than $20, SMSes the owner with the
 * top 5 worst offenders.
 *
 * Why nightly: the v4 rule changes (per-body floor + fee-waived gate)
 * mean any code path that bypasses compute_phleb_take_v2 will drift.
 * This is the cheap watchdog that catches drift inside 24 hours instead
 * of waiting for the monthly P&L to surface it.
 *
 * Tolerance:
 *   • Net business drift > $25 in a single day → SMS
 *   • Any single appointment delta > $20 → SMS (listed in body)
 *   • 0 drift → silent (success log only)
 *
 * Auth: cron_secret (header X-Cron-Secret or body.cron_secret).
 * verify_jwt=false.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendOwnerAlert } from '../_shared/alert-recipients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const DAILY_DRIFT_TOLERANCE_USD = 25;
const PER_APPT_TOLERANCE_USD = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ ok: true, suspended: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET') || '';
    const body = await req.json().catch(() => ({} as any));
    const headerSecret = req.headers.get('x-cron-secret') || '';
    const provided = body?.cron_secret || headerSecret;
    if (cronSecret && provided !== cronSecret) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Window: yesterday + today so we catch same-day-completed late-evening visits
    const days = Number(body?.days || 2);
    const dryRun = body?.dry_run === true;

    const { data: digest, error: digestErr } = await supabase.rpc('audit_phleb_payouts_v4_digest', { p_days: days });
    if (digestErr) throw digestErr;

    const summary = digest?.summary || {};
    const offenders: any[] = digest?.worst_offenders || [];

    const netDrift = Math.abs(Number(summary.net_business_drift || 0));
    const noPayoutCount = Number(summary.no_payout_count || 0);
    const overpaidCount = Number(summary.overpaid_count || 0);
    const underpaidCount = Number(summary.underpaid_count || 0);
    const overpaidTotal = Number(summary.overpaid_total || 0);
    const underpaidTotal = Number(summary.underpaid_total || 0);
    const noPayoutTotal = Number(summary.no_payout_total || 0);

    const bigSingles = offenders.filter(o => Math.abs(Number(o.delta || 0)) > PER_APPT_TOLERANCE_USD);
    const shouldAlert = netDrift > DAILY_DRIFT_TOLERANCE_USD || bigSingles.length > 0 || noPayoutCount > 0;

    if (!shouldAlert) {
      return new Response(JSON.stringify({
        ok: true, alerted: false,
        message: 'No drift outside tolerance.',
        summary,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const lines: string[] = [];
    lines.push(`ConveLabs v4 Audit (last ${days}d):`);
    lines.push(`Drift $${netDrift.toFixed(2)} | Over: ${overpaidCount}/$${overpaidTotal.toFixed(0)} | Under: ${underpaidCount}/$${underpaidTotal.toFixed(0)} | NoPayout: ${noPayoutCount}/$${noPayoutTotal.toFixed(0)}`);
    if (bigSingles.length > 0) {
      lines.push(`Top issues:`);
      for (const o of bigSingles.slice(0, 5)) {
        const delta = Number(o.delta || 0);
        const sign = delta >= 0 ? '+' : '';
        lines.push(`• ${o.patient_name} ${o.appointment_date} ${o.status} ${sign}$${delta.toFixed(0)}`);
      }
    }
    const sms = lines.join('\n');

    if (!dryRun) {
      await sendOwnerAlert(supabase, sms, { reason: 'audit_phleb_payouts_v4', urgency: 'normal' });
    }

    return new Response(JSON.stringify({
      ok: true, alerted: true, dry_run: dryRun,
      sms_body: sms, summary, big_singles: bigSingles,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[audit-phleb-payouts-v4-nightly]', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error', stack: e?.stack }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
