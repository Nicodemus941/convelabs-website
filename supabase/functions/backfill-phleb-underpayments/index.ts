/**
 * BACKFILL-PHLEB-UNDERPAYMENTS
 *
 * Settles the historical gap where phleb was underpaid because the v1
 * `compute_phleb_take_cents` RPC was active or the admin-manual-modal
 * code path bypassed the floor logic entirely.
 *
 * Scope (decided 2026-05-19 by owner):
 *   - Only Stripe-paid appointments (excludes check / cash / out-of-band)
 *   - Created on/after 2026-05-14 18:05 UTC (v2 RPC commit)
 *   - Family bundles: aggregate by family_group_id, $87 floor applied ONCE
 *
 * Strategy:
 *   - Compute the v2 expected take for each appointment / bundle
 *   - Compare against staff_payouts.amount_cents (sum across bundle)
 *   - Where expected > actual, INSERT a supplemental staff_payouts row with
 *     status='manual_owed' and the delta. The daily 02:00 EDT sweep cron
 *     transfers it. No double-pay because the existing succeeded row is
 *     untouched + idempotency on the supplemental row's notes prevents
 *     re-running.
 *
 * Body:
 *   { dry_run: true|false, cron_secret?: string }
 * Auth: admin OR cron_secret.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const V2_COMMIT_UTC = '2026-05-14T18:05:00+00:00';
const BACKFILL_NOTE_TAG = 'backfill_underpayment_2026_05_19';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const isCron = body?.cron_secret && body.cron_secret === Deno.env.get('CRON_SECRET');
    const dryRun = body?.dry_run !== false; // default DRY RUN

    if (!isCron) {
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) return new Response(JSON.stringify({ error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const role = (user.user_metadata?.role || user.app_metadata?.role || '').toString();
      if (!['super_admin', 'admin', 'office_manager'].includes(role)) {
        return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Resolve the single Connect-enabled phleb (multi-phleb dispatch not yet supported by backfill)
    const { data: connected } = await admin
      .from('staff_profiles')
      .select('id, stripe_connect_account_id')
      .not('stripe_connect_account_id', 'is', null)
      .eq('stripe_connect_charges_enabled', true)
      .eq('stripe_connect_payouts_enabled', true);
    if (!connected || connected.length === 0) {
      return new Response(JSON.stringify({ error: 'no_connect_phleb' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const staffId = (connected[0] as any).id;
    const stripeAcct = (connected[0] as any).stripe_connect_account_id;

    // Pull every paid non-cancelled appointment in scope. The qb_sync_log
    // EXISTS check filters out check/cash/out-of-band paid rows.
    const { data: appts } = await admin
      .from('appointments')
      .select('id, patient_name, appointment_date, service_type, total_amount, tip_amount, family_group_id, payment_status, status')
      .gte('created_at', V2_COMMIT_UTC)
      .in('payment_status', ['paid', 'completed', 'succeeded'])
      .not('status', 'eq', 'cancelled');

    const rows = (appts || []) as any[];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: 'No in-scope appointments.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pre-fetch Stripe activity to filter to Stripe-paid only.
    const apptIds = rows.map(r => r.id);
    const { data: qbLogs } = await admin
      .from('stripe_qb_sync_log')
      .select('appointment_id')
      .in('appointment_id', apptIds)
      .gt('amount_net_cents', 0);
    const stripePaid = new Set(((qbLogs || []) as any[]).map(l => l.appointment_id));

    // Pre-fetch existing payouts. The DB has historical DUPLICATE rows for
    // the same stripe_transfer_id (initial webhook + reconciler back-fill
    // both insert) — sum naively and we double-count. Dedupe by
    // (appointment_id, stripe_transfer_id) keeping the LARGEST amount as
    // the authoritative payout. Null-transfer-id rows (admin manual /
    // pre-Connect) sum as-is.
    const { data: existingPayouts } = await admin
      .from('staff_payouts')
      .select('appointment_id, amount_cents, status, notes, stripe_transfer_id')
      .in('appointment_id', apptIds);
    const alreadyBackfilled = new Set<string>();
    // First: dedupe by transfer_id, keep largest amount per (appt, transfer)
    const dedupeKey = (apptId: string, transferId: string | null) => `${apptId}::${transferId || 'NULL'}`;
    const bestByKey = new Map<string, number>();
    for (const p of (existingPayouts || []) as any[]) {
      if (p.notes && p.notes.includes(BACKFILL_NOTE_TAG)) alreadyBackfilled.add(p.appointment_id);
      if (!['succeeded', 'manual_owed', 'manual_settled', 'pending'].includes(p.status)) continue;
      const k = dedupeKey(p.appointment_id, p.stripe_transfer_id);
      const cur = bestByKey.get(k) || 0;
      const amt = p.amount_cents || 0;
      // For deduped transfer rows, keep the largest amount.
      // For NULL-transfer rows (multiple admin manual entries), sum them.
      if (p.stripe_transfer_id) {
        if (amt > cur) bestByKey.set(k, amt);
      } else {
        bestByKey.set(k, cur + amt);
      }
    }
    const paidByAppt = new Map<string, number>();
    for (const [k, amt] of bestByKey.entries()) {
      const apptId = k.split('::')[0];
      paidByAppt.set(apptId, (paidByAppt.get(apptId) || 0) + amt);
    }

    // Group by family bundle. Primary = row whose id === family_group_id.
    // Non-bundle rows are their own "bundle of one".
    type Bundle = { primary_id: string; row_ids: string[]; total_cents: number; tip_cents: number; service_type: string; has_companion: boolean; patient_name: string };
    const bundles = new Map<string, Bundle>();
    for (const r of rows) {
      if (!stripePaid.has(r.id)) continue;  // skip out-of-band paid rows
      const bundleKey = r.family_group_id || r.id;
      const isPrimary = !r.family_group_id || r.family_group_id === r.id;
      const cents = Math.round((r.total_amount || 0) * 100);
      const tipCents = Math.round((r.tip_amount || 0) * 100);
      const existing = bundles.get(bundleKey);
      if (!existing) {
        bundles.set(bundleKey, {
          primary_id: isPrimary ? r.id : '',
          row_ids: [r.id],
          total_cents: cents,
          tip_cents: tipCents,
          service_type: r.service_type || 'mobile',
          has_companion: !!r.family_group_id,
          patient_name: r.patient_name || '',
        });
      } else {
        existing.row_ids.push(r.id);
        existing.total_cents += cents;
        existing.tip_cents += tipCents;
        if (isPrimary) existing.primary_id = r.id;
        if (isPrimary && r.patient_name) existing.patient_name = r.patient_name;
        if (isPrimary && r.service_type) existing.service_type = r.service_type;
      }
    }
    // Defense: any bundle without a primary picks the first row as primary
    for (const b of bundles.values()) {
      if (!b.primary_id) b.primary_id = b.row_ids[0];
    }

    const deltas: any[] = [];
    let totalDeltaCents = 0;
    for (const b of bundles.values()) {
      if (alreadyBackfilled.has(b.primary_id)) continue;
      // Sum what's been paid across the bundle
      let actualPaid = 0;
      for (const rid of b.row_ids) actualPaid += (paidByAppt.get(rid) || 0);
      // Compute expected with v2 RPC
      const { data: v2 } = await admin.rpc('compute_phleb_take_v2_inline' as any, {
        p_staff_id: staffId,
        p_service_type: b.service_type,
        p_total_paid_cents: b.total_cents,
        p_surcharge_cents: 0,
        p_tip_cents: b.tip_cents,
        p_has_companion: b.has_companion,
      });
      const expected = Number(((Array.isArray(v2) ? v2[0] : v2) as any)?.take_cents) || 0;
      const delta = expected - actualPaid;
      deltas.push({
        primary_id: b.primary_id,
        patient_name: b.patient_name,
        service_type: b.service_type,
        bundle_rows: b.row_ids.length,
        bundle_total_dollars: b.total_cents / 100,
        actual_paid_dollars: actualPaid / 100,
        expected_dollars: expected / 100,
        delta_dollars: delta / 100,
        action: delta > 0 ? 'insert_manual_owed' : 'skip',
      });
      if (delta > 0) totalDeltaCents += delta;
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true, dry_run: true,
        bundles_examined: bundles.size,
        bundles_underpaid: deltas.filter(d => d.delta_dollars > 0).length,
        total_owed_dollars: totalDeltaCents / 100,
        deltas,
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // LIVE: insert manual_owed rows for each underpaid bundle
    const inserts: any[] = [];
    for (const d of deltas) {
      if (d.delta_dollars <= 0) continue;
      const deltaCents = Math.round(d.delta_dollars * 100);
      inserts.push({
        staff_id: staffId,
        appointment_id: d.primary_id,
        service_type: d.service_type,
        base_per_visit_cents: 0,
        companion_addon_cents: 0,
        tip_cents: 0,
        amount_cents: deltaCents,
        stripe_destination_account_id: stripeAcct,
        status: 'manual_owed',
        notes: `${BACKFILL_NOTE_TAG} · v2 floor reconciliation · expected $${d.expected_dollars.toFixed(2)} - actual $${d.actual_paid_dollars.toFixed(2)} = $${d.delta_dollars.toFixed(2)} delta (${d.bundle_rows} bundle row${d.bundle_rows > 1 ? 's' : ''})`,
      });
    }
    let inserted = 0;
    if (inserts.length > 0) {
      const { data: ins, error: insErr } = await admin.from('staff_payouts').insert(inserts).select('id');
      if (insErr) {
        return new Response(JSON.stringify({ error: 'insert_failed', message: insErr.message, attempted: inserts.length }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      inserted = (ins || []).length;
    }

    return new Response(JSON.stringify({
      ok: true,
      bundles_examined: bundles.size,
      bundles_underpaid: deltas.filter(d => d.delta_dollars > 0).length,
      manual_owed_rows_inserted: inserted,
      total_owed_dollars: totalDeltaCents / 100,
      next_step: 'Daily 02:00 EDT sweep-phleb-payouts-daily cron will fire the transfers. Or invoke sweep-phleb-owed-payouts manually now with cron_secret.',
      deltas,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[backfill-phleb-underpayments]', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error', stack: e?.stack }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
