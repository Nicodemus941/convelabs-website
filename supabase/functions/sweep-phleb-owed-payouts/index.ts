/**
 * SWEEP-PHLEB-OWED-PAYOUTS
 *
 * One-click "pay me what I'm owed" — finds every staff_payouts row with
 * status='manual_owed' for the caller's connected staff account, fires
 * a single Stripe Connect transfer for the total, then marks all rows
 * succeeded with the transfer_id stamped for audit.
 *
 * WHAT COUNTS AS OWED (2026-10-02): a manual_owed row is swept only when
 * `v_sweep_eligibility.sweep_eligible` is true — the patient's money has
 * actually landed (Stripe net > 0 or a paid org invoice), the visit is not
 * comp/prepaid, and the row has no transfer yet — AND the visit date has
 * passed. This is the same gate the phleb's earnings ledger shows as
 * "cleared" (get_sweep_summary_for_staff). Before this, the sweep summed
 * EVERY manual_owed row: on 2026-10-02 that was 228 rows / $23,410.76, of
 * which 62 rows / $11,324.36 had no payment yet (8 voided invoices worth
 * $866.41 among them) and 19 rows / $3,838.00 were visits still in the
 * future. Negative manual_owed rows (refund clawbacks) are always included
 * so they net against what is paid.
 *
 * Auth: requires bearer token of an authenticated user. We look up that
 * user's staff_profiles row, ensure they have a Stripe Connect account,
 * and only sweep payouts that belong to them. Admins can additionally
 * pass { p_staff_id } to sweep on behalf of another phleb. The daily cron
 * (jobid 69, 06:00 UTC) passes { cron_secret, all_staff: true }.
 *
 * Idempotent at the row level (rows flip to 'succeeded' once swept, so
 * a re-run is a no-op). Idempotent at the transfer level via an
 * idempotency key derived from the exact row set + total.
 *
 * Failures are LOGGED (console + error_logs). The cron loop used to swallow
 * the Stripe error into the JSON body, so a transfer that failed every day
 * since 2026-08-11 only ever surfaced as "swept 1 phlebs, total $0.00".
 *
 * verify_jwt=false (we manually parse the token via supabase.auth.getUser).
 */

import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { getTrustedRole } from '../_shared/authz.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

interface PayoutRow {
  id: string;
  appointment_id: string | null;
  amount_cents: number;
  stripe_destination_account_id: string | null;
  notes: string | null;
  created_at: string;
}

interface SweepResult {
  ok: boolean;
  swept_count: number;
  total_cents: number;
  stripe_transfer_id?: string;
  transfer_group?: string;
  message?: string;
  error?: string;
  warning?: string;
  row_ids?: string[];
  skipped?: { not_yet_paid: number; not_yet_paid_cents: number; future_visit: number; future_visit_cents: number };
  wrong_count?: number;
}

/** Today's calendar date in Eastern time (visit dates are ET days). */
function todayEt(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

async function logSweepError(admin: any, staffId: string, message: string, payload: Record<string, unknown>) {
  console.error(`[sweep] ${message}`, JSON.stringify(payload));
  try {
    await admin.from('error_logs').insert({
      error_type: 'phleb_sweep_failed',
      component: 'sweep-phleb-owed-payouts',
      action: 'sweepForStaff',
      error_message: message,
      payload: { staff_id: staffId, ...payload },
      resolved: false,
    });
  } catch { /* never block on logging */ }
}

/**
 * Reusable sweep core — shared between user-auth path and cron mode.
 * Throws on query/Stripe failure so callers can log it.
 */
async function sweepForStaff(admin: any, staffId: string, stripeAcct: string): Promise<SweepResult> {
  const { data: owed, error: owedErr } = await admin
    .from('staff_payouts')
    .select('id, appointment_id, amount_cents, stripe_destination_account_id, notes, created_at')
    .eq('staff_id', staffId)
    .eq('status', 'manual_owed')
    .order('created_at', { ascending: true });
  if (owedErr) throw new Error(`owed query failed: ${owedErr.message}`);
  const allOwed = (owed as PayoutRow[]) || [];
  if (allOwed.length === 0) return { ok: true, swept_count: 0, total_cents: 0, message: 'nothing_owed' };

  // Payment gate — the DB view is the single definition of "the money is in".
  const { data: elig, error: eligErr } = await admin
    .from('v_sweep_eligibility')
    .select('payout_id, appointment_date, payment_gate, sweep_eligible')
    .eq('staff_id', staffId);
  if (eligErr) throw new Error(`eligibility query failed: ${eligErr.message}`);
  const today = todayEt();
  const eligibleIds = new Set<string>();
  const skipped = { not_yet_paid: 0, not_yet_paid_cents: 0, future_visit: 0, future_visit_cents: 0 };
  const amountById = new Map(allOwed.map((r) => [r.id, r.amount_cents || 0]));
  for (const e of (elig || []) as Array<{ payout_id: string; appointment_date: string | null; sweep_eligible: boolean }>) {
    if (!amountById.has(e.payout_id)) continue;
    const amt = amountById.get(e.payout_id) || 0;
    if (!e.sweep_eligible) { if (amt > 0) { skipped.not_yet_paid++; skipped.not_yet_paid_cents += amt; } continue; }
    if (e.appointment_date && String(e.appointment_date).substring(0, 10) > today) {
      skipped.future_visit++; skipped.future_visit_cents += amt; continue;
    }
    eligibleIds.add(e.payout_id);
  }
  // Positive rows must pass the gate; negative rows (clawbacks) always net.
  const rows = allOwed.filter((r) => (r.amount_cents || 0) < 0 || eligibleIds.has(r.id));
  if (rows.length === 0) return { ok: true, swept_count: 0, total_cents: 0, message: 'nothing_cleared', skipped };

  const wrongDest = rows.filter(r => r.stripe_destination_account_id && r.stripe_destination_account_id !== stripeAcct);
  if (wrongDest.length > 0) return { ok: false, swept_count: 0, total_cents: 0, error: 'destination_mismatch', wrong_count: wrongDest.length, skipped };
  const totalCents = rows.reduce((s, r) => s + (r.amount_cents || 0), 0);
  if (totalCents <= 0) return { ok: true, swept_count: 0, total_cents: 0, message: 'net_zero_or_negative', skipped };

  const sweepDay = new Date().toISOString().substring(0, 10);
  // transfer_group stays date-scoped so reconciliation can group a day's
  // sweeps (reconcile-phleb-payouts-from-stripe relies on this).
  const transferGroup = `phleb_sweep_${staffId}_${sweepDay}`;
  // Idempotency key reflects the EXACT set of owed rows + total being paid (not
  // just staff+date). A date-only key broke when a second sweep ran the same
  // day for a different amount (new owed visits) — Stripe rejects key reuse
  // with different params. Same-set retry stays idempotent; double-pay of the
  // same rows is already prevented by the manual_owed → succeeded flip below.
  const sortedIds = rows.map(r => r.id).slice().sort();
  let idemHash = 5381;
  for (const ch of sortedIds.join(',')) idemHash = ((idemHash << 5) + idemHash + ch.charCodeAt(0)) >>> 0;
  const idempotencyKey = `phleb_sweep_${staffId}_${sweepDay}_${totalCents}_${idemHash.toString(16)}`;
  const transfer = await stripe.transfers.create({
    amount: totalCents,
    currency: 'usd',
    destination: stripeAcct,
    transfer_group: transferGroup,
    description: `Phleb sweep: ${rows.length} owed visits, ${sweepDay}`,
    metadata: { staff_id: staffId, row_count: String(rows.length), sweep_date: sweepDay, source: 'sweep-phleb-owed-payouts' },
  }, { idempotencyKey });
  const { error: updateErr } = await admin.from('staff_payouts').update({
    status: 'succeeded',
    stripe_transfer_id: transfer.id,
    transferred_at: new Date().toISOString(),
    notes: rows[0].notes ? `${rows[0].notes} · swept ${sweepDay}` : `swept ${sweepDay}`,
  }).in('id', rows.map(r => r.id));
  if (updateErr) {
    // Transfer succeeded but DB write failed — surface the transfer_id so
    // the admin can manually mark the rows. Logged loudly: this is the one
    // state that can double-pay on the next run.
    await logSweepError(admin, staffId, `Stripe transfer ${transfer.id} sent ($${(totalCents / 100).toFixed(2)}) but staff_payouts update failed: ${updateErr.message}. Mark these rows succeeded by hand before the next sweep.`, { stripe_transfer_id: transfer.id, row_ids: rows.map(r => r.id), total_cents: totalCents });
    return { ok: false, warning: 'stripe_transferred_but_db_failed', stripe_transfer_id: transfer.id, total_cents: totalCents, swept_count: 0, row_ids: rows.map(r => r.id), error: updateErr.message };
  }
  return { ok: true, swept_count: rows.length, total_cents: totalCents, stripe_transfer_id: transfer.id, transfer_group: transferGroup, skipped };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({} as any));
    const adminRequestedStaffId: string | undefined = body?.p_staff_id;
    const isCronMode = body?.cron_secret && body.cron_secret === Deno.env.get('CRON_SECRET');

    // Resolve which staff_profile we're sweeping for
    let staffId: string | null = null;
    let stripeAcct: string | null = null;

    // ─── CRON MODE ──────────────────────────────────────────────────
    // Daily cron passes { cron_secret, all_staff: true } to sweep every
    // Connect-enabled phleb in one invocation. Each phleb is processed
    // independently — one bad transfer doesn't stop the rest. Returns
    // an aggregate report. Note: system_settings.phleb_connect_payouts_
    // disabled gates INSTANT per-visit transfers only; this daily sweep is
    // the designated payout path while that switch is on.
    if (isCronMode && body?.all_staff === true) {
      const { data: phlebs } = await admin
        .from('staff_profiles')
        .select('id, stripe_connect_account_id')
        .not('stripe_connect_account_id', 'is', null)
        .eq('stripe_connect_charges_enabled', true)
        .eq('stripe_connect_payouts_enabled', true);
      const results: any[] = [];
      for (const p of (phlebs || []) as any[]) {
        try {
          const result = await sweepForStaff(admin, p.id, p.stripe_connect_account_id);
          if (!result.ok) await logSweepError(admin, p.id, `cron sweep not ok: ${result.error || result.warning}`, { result });
          results.push({ staff_id: p.id, ...result });
        } catch (e: any) {
          await logSweepError(admin, p.id, `cron sweep threw: ${e?.message || 'sweep_failed'}`, { code: e?.code, type: e?.type });
          results.push({ staff_id: p.id, ok: false, error: e?.message || 'sweep_failed' });
        }
      }
      const totalSweptCents = results.reduce((s, r) => s + (r.ok ? (r.total_cents || 0) : 0), 0);
      const failed = results.filter(r => !r.ok).length;
      console.log(`[sweep:cron] processed ${results.length} phlebs, total $${(totalSweptCents/100).toFixed(2)}, failed ${failed}`);
      return new Response(JSON.stringify({
        ok: failed === 0,
        mode: 'cron_all_staff',
        phlebs_processed: results.length,
        total_swept_cents: totalSweptCents,
        results,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── USER-AUTH PATH ─────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'auth_required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (adminRequestedStaffId) {
      // Admin override path
      const role = getTrustedRole(user);
      if (role !== 'super_admin' && role !== 'office_manager' && role !== 'admin') {
        return new Response(JSON.stringify({ error: 'admin_only' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data: sp } = await admin
        .from('staff_profiles')
        .select('id, stripe_connect_account_id, stripe_connect_payouts_enabled')
        .eq('id', adminRequestedStaffId).maybeSingle();
      staffId = (sp as any)?.id || null;
      stripeAcct = (sp as any)?.stripe_connect_account_id || null;
    } else {
      // Self-serve path
      const { data: sp } = await admin
        .from('staff_profiles')
        .select('id, stripe_connect_account_id, stripe_connect_payouts_enabled')
        .eq('user_id', user.id).maybeSingle();
      staffId = (sp as any)?.id || null;
      stripeAcct = (sp as any)?.stripe_connect_account_id || null;
      if (!(sp as any)?.stripe_connect_payouts_enabled) {
        return new Response(JSON.stringify({
          error: 'stripe_connect_not_ready',
          message: 'Finish Stripe Connect onboarding before sweeping.'
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (!staffId) {
      return new Response(JSON.stringify({ error: 'no_staff_profile' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!stripeAcct) {
      return new Response(JSON.stringify({ error: 'no_stripe_connect_account' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let result: SweepResult;
    try {
      result = await sweepForStaff(admin, staffId, stripeAcct);
    } catch (e: any) {
      await logSweepError(admin, staffId, `manual sweep threw: ${e?.message || 'sweep_failed'}`, { code: e?.code, type: e?.type, requested_by: user.id });
      return new Response(JSON.stringify({
        error: 'stripe_transfer_failed',
        message: e?.message || 'Stripe rejected the transfer',
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (result.warning === 'stripe_transferred_but_db_failed') {
      return new Response(JSON.stringify(result), { status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!result.ok) {
      return new Response(JSON.stringify({
        error: result.error,
        details: result.error === 'destination_mismatch' ? `${result.wrong_count} rows point at a different Connect account.` : undefined,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      ...result,
      message: result.swept_count === 0 ? (result.message === 'nothing_owed' ? 'Nothing owed.' : 'Nothing cleared yet — owed visits are waiting on patient payment or the visit date.') : undefined,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[sweep] uncaught:', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
