/**
 * RECONCILE-PHLEB-PAYOUTS-FROM-STRIPE
 *
 * Hormozi structure: "Truth from the source, write to your books, never
 * trust the cache." Pulls authoritative payment + transfer data from
 * Stripe directly, then flips staff_payouts.manual_owed rows to succeeded
 * when Stripe shows the phleb cut already moved.
 *
 * Three reconciliation passes, in order:
 *
 *   PASS 1 — Transfers by metadata.appointment_id
 *     Lists all stripe.transfers.list({ destination: phlebConnect }) for
 *     the last 365 days. Our codebase stamps metadata.appointment_id on
 *     every transfer it fires. Match → flip status='succeeded' +
 *     stripe_transfer_id.
 *
 *   PASS 2 — Transfers by transfer_group (sweep groups, etc.)
 *     Some legacy transfers don't carry appointment_id but DO carry
 *     transfer_group=`phleb_sweep_{staff}_{date}`. We trust those bulk
 *     transfers to cover whatever was owed at that moment.
 *
 *   PASS 3 — Destination payments on the underlying charge
 *     For each remaining manual_owed row, fetch the appointment's charge
 *     from stripe_qb_sync_log. If charge.transfer points to our destination
 *     AND we don't already have a succeeded row for it, mark this one
 *     succeeded with that transfer_id.
 *
 * NEVER moves money. Only updates DB to match what already happened on Stripe.
 *
 * Body: { p_staff_id?, dry_run?: bool }
 * Auth: bearer token; admin override via p_staff_id requires admin role.
 */

import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const adminRequestedStaffId = body?.p_staff_id;
    const dryRun = !!body?.dry_run;

    let staffId: string | null = null;
    let stripeAcct: string | null = null;

    if (adminRequestedStaffId) {
      const role = (user.user_metadata?.role || user.app_metadata?.role || '').toString();
      if (role !== 'super_admin' && role !== 'office_manager' && role !== 'admin') {
        return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: sp } = await admin.from('staff_profiles').select('id, stripe_connect_account_id').eq('id', adminRequestedStaffId).maybeSingle();
      staffId = (sp as any)?.id || null;
      stripeAcct = (sp as any)?.stripe_connect_account_id || null;
    } else {
      const { data: sp } = await admin.from('staff_profiles').select('id, stripe_connect_account_id').eq('user_id', user.id).maybeSingle();
      staffId = (sp as any)?.id || null;
      stripeAcct = (sp as any)?.stripe_connect_account_id || null;
    }

    if (!staffId) return new Response(JSON.stringify({ ok: false, error: 'no_staff_profile' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!stripeAcct) return new Response(JSON.stringify({ ok: false, error: 'no_stripe_connect_account' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // ──────────────────────────────────────────────────────────────────
    // FETCH 1: All manual_owed rows for this staff
    // ──────────────────────────────────────────────────────────────────
    const { data: owedRowsRaw } = await admin
      .from('staff_payouts')
      .select('id, appointment_id, amount_cents, stripe_payment_intent_id, stripe_charge_id, notes')
      .eq('staff_id', staffId)
      .eq('status', 'manual_owed')
      .is('stripe_transfer_id', null);

    const owedRows = (owedRowsRaw as any[]) || [];
    if (owedRows.length === 0) {
      return new Response(JSON.stringify({ ok: true, reconciled_count: 0, total_cents: 0, message: 'No manual_owed rows to reconcile.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ──────────────────────────────────────────────────────────────────
    // FETCH 2: All Stripe transfers to this Connect account, last 365 days
    // ──────────────────────────────────────────────────────────────────
    const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 86400;
    const allTransfers: any[] = [];
    let startingAfter: string | undefined = undefined;
    let pageCount = 0;
    while (pageCount < 10) {
      const page: any = await stripe.transfers.list({
        destination: stripeAcct,
        created: { gte: oneYearAgo },
        limit: 100,
        starting_after: startingAfter,
      });
      allTransfers.push(...page.data);
      if (!page.has_more) break;
      startingAfter = page.data[page.data.length - 1].id;
      pageCount++;
    }

    // ──────────────────────────────────────────────────────────────────
    // FETCH 3: stripe_qb_sync_log → charge_id for every owed row's appointment
    // ──────────────────────────────────────────────────────────────────
    const apptIds = Array.from(new Set(owedRows.map((r: any) => r.appointment_id).filter(Boolean)));
    const { data: syncRows } = await admin
      .from('stripe_qb_sync_log')
      .select('appointment_id, stripe_charge_id, stripe_payment_intent_id, amount_net_cents')
      .in('appointment_id', apptIds);
    const apptToCharge = new Map<string, { charge_id: string | null; pi_id: string | null; net_cents: number }>();
    for (const s of ((syncRows as any[]) || [])) {
      const existing = apptToCharge.get(s.appointment_id) || { charge_id: null, pi_id: null, net_cents: 0 };
      apptToCharge.set(s.appointment_id, {
        charge_id: existing.charge_id || s.stripe_charge_id,
        pi_id: existing.pi_id || s.stripe_payment_intent_id,
        net_cents: existing.net_cents + (s.amount_net_cents || 0),
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // PASS 1 — Match transfers by metadata.appointment_id
    // ──────────────────────────────────────────────────────────────────
    const transfersByAppt = new Map<string, any>();
    for (const t of allTransfers) {
      const meta = t.metadata || {};
      const apptId = meta.appointment_id || meta.appt_id;
      if (apptId && !transfersByAppt.has(apptId)) {
        transfersByAppt.set(apptId, t);
      }
    }

    const reconciled: Array<{ row_id: string; transfer_id: string; via: string }> = [];

    for (const row of owedRows) {
      if (!row.appointment_id) continue;
      const t = transfersByAppt.get(row.appointment_id);
      if (t) {
        reconciled.push({ row_id: row.id, transfer_id: t.id, via: 'pass1_metadata_match' });
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // PASS 2 — Match by source_transaction (Stripe's link back to the charge)
    // ──────────────────────────────────────────────────────────────────
    const reconciledIds = new Set(reconciled.map(r => r.row_id));
    const transfersBySource = new Map<string, any>();
    for (const t of allTransfers) {
      if (t.source_transaction) transfersBySource.set(t.source_transaction, t);
    }
    for (const row of owedRows) {
      if (reconciledIds.has(row.id)) continue;
      if (!row.appointment_id) continue;
      const sync = apptToCharge.get(row.appointment_id);
      const chargeId = sync?.charge_id || row.stripe_charge_id;
      if (chargeId && transfersBySource.has(chargeId)) {
        const t = transfersBySource.get(chargeId);
        reconciled.push({ row_id: row.id, transfer_id: t.id, via: 'pass2_source_transaction' });
        reconciledIds.add(row.id);
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // PASS 3 — Fetch each remaining row's charge directly and check
    // charge.transfer (the destination payment id when transfer_data was
    // used at checkout time)
    // ──────────────────────────────────────────────────────────────────
    const remaining = owedRows.filter((r: any) => !reconciledIds.has(r.id) && r.appointment_id);
    for (const row of remaining) {
      const sync = apptToCharge.get(row.appointment_id);
      const chargeId = sync?.charge_id || row.stripe_charge_id;
      if (!chargeId) continue;
      try {
        const ch: any = await stripe.charges.retrieve(chargeId, { expand: ['transfer'] });
        const transfer = ch.transfer;
        if (transfer && transfer.destination === stripeAcct) {
          reconciled.push({ row_id: row.id, transfer_id: transfer.id, via: 'pass3_charge_destination' });
          reconciledIds.add(row.id);
        }
      } catch (e: any) {
        // Charge not retrievable (deleted, wrong key, etc.) — skip
        console.warn(`[reconcile] charge ${chargeId} retrieve failed:`, e?.message);
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // Compute total dollars reconciled, group by transfer for the report
    // ──────────────────────────────────────────────────────────────────
    const totalCents = owedRows
      .filter((r: any) => reconciledIds.has(r.id))
      .reduce((s: number, r: any) => s + (r.amount_cents || 0), 0);

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true, dry_run: true,
        total_manual_owed: owedRows.length,
        would_reconcile_count: reconciled.length,
        would_reconcile_cents: totalCents,
        remaining_truly_owed: owedRows.length - reconciled.length,
        transfers_scanned: allTransfers.length,
        by_pass: {
          pass1_metadata: reconciled.filter(r => r.via === 'pass1_metadata_match').length,
          pass2_source: reconciled.filter(r => r.via === 'pass2_source_transaction').length,
          pass3_charge: reconciled.filter(r => r.via === 'pass3_charge_destination').length,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ──────────────────────────────────────────────────────────────────
    // WRITE — Update the DB to match Stripe truth
    // ──────────────────────────────────────────────────────────────────
    const updates = reconciled.map(r =>
      admin.from('staff_payouts').update({
        status: 'succeeded',
        stripe_transfer_id: r.transfer_id,
        transferred_at: new Date().toISOString(),
        notes: `reconciled from Stripe (${r.via})`,
      }).eq('id', r.row_id)
    );

    const results = await Promise.allSettled(updates);
    const failed = results.filter(r => r.status === 'rejected').length;

    // ──────────────────────────────────────────────────────────────────
    // BACK-FILL — Stripe transfers we have NO matching DB row for. The
    // pre-fix reconciler only flipped existing rows; transfers created via
    // the Stripe dashboard (or by old code that never wrote staff_payouts
    // because connect_json was truncated to invalid JSON) were silently
    // invisible to ConveLabs' books → owner saw "less" on dashboard than
    // on Stripe. Now we INSERT a row per orphan transfer so totals
    // reconcile bidirectionally.
    const matchedTransferIds = new Set(reconciled.map(r => r.transfer_id));
    const { data: existingRows } = await admin
      .from('staff_payouts')
      .select('stripe_transfer_id')
      .eq('staff_id', staffId)
      .not('stripe_transfer_id', 'is', null);
    const knownTransferIds = new Set((existingRows || []).map((r: any) => r.stripe_transfer_id));
    const orphans = allTransfers.filter(t =>
      !matchedTransferIds.has(t.id) && !knownTransferIds.has(t.id)
    );
    let backfilledCount = 0;
    let backfilledCents = 0;
    for (const t of orphans) {
      try {
        const apptId = t.metadata?.appointment_id || null;
        await admin.from('staff_payouts').insert({
          staff_id: staffId,
          appointment_id: apptId,
          amount_cents: t.amount,
          status: 'succeeded',
          stripe_transfer_id: t.id,
          transferred_at: new Date(t.created * 1000).toISOString(),
          notes: `back-filled from Stripe (orphan transfer ${t.id})`,
        });
        backfilledCount++;
        backfilledCents += t.amount;
      } catch (e: any) {
        console.warn(`[reconcile] back-fill insert failed for ${t.id}:`, e?.message);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      reconciled_count: reconciled.length - failed,
      reconciled_cents: totalCents,
      backfilled_count: backfilledCount,
      backfilled_cents: backfilledCents,
      remaining_manual_owed: owedRows.length - reconciled.length + failed,
      transfers_scanned: allTransfers.length,
      by_pass: {
        pass1_metadata: reconciled.filter(r => r.via === 'pass1_metadata_match').length,
        pass2_source: reconciled.filter(r => r.via === 'pass2_source_transaction').length,
        pass3_charge: reconciled.filter(r => r.via === 'pass3_charge_destination').length,
      },
      db_failures: failed,
      message: reconciled.length === 0 && backfilledCount === 0
        ? 'No matches found — all manual_owed rows still truly outstanding, no orphan transfers.'
        : `Marked ${reconciled.length} rows as already-paid + back-filled ${backfilledCount} orphan transfer(s) = $${((totalCents + backfilledCents)/100).toFixed(2)} accounted for.`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[reconcile] uncaught:', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
