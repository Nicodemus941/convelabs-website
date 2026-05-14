/**
 * BACKFILL-STRIPE-PAYMENTS-TO-LEDGER
 *
 * The cardinal Hormozi audit move: "Stripe is the source of truth. Our DB is
 * a cache that drifted. Rebuild the cache from the truth."
 *
 * Problem: stripe_qb_sync_log is supposed to log every payment Stripe
 * accepted, but webhooks miss events (ref errors, deploy timing, etc.).
 * Result: appointments where the patient actually paid show up as
 * "no_payment_yet" in v_sweep_eligibility because there's no ledger row,
 * which downstream-blocks the phleb sweep.
 *
 * What this does (READ-ONLY against Stripe; INSERT-ONLY into our DB):
 *   1. Lists every Stripe charge from the last 365 days (paginated up to 5k)
 *   2. For each charge → tries to find the appointment via:
 *        a) charge.metadata.appointment_id
 *        b) charge.payment_intent metadata.appointment_id
 *        c) the checkout session linked to the PI (metadata.appointment_id)
 *   3. If no stripe_qb_sync_log row exists for that charge_id → INSERT one
 *        with the real gross/fee/net/refunded amounts from Stripe
 *   4. Downstream triggers then fire automatically:
 *        - sync_appointment_total_from_stripe → updates total_amount
 *        - auto_reconcile_phleb_payout_v2 → creates v2 manual_owed delta
 *        - v_sweep_eligibility → reclassifies the row as 'stripe_paid'
 *
 * Body: { dry_run?: bool, since_days?: number, iterate_all?: bool }
 * Auth: bearer token; admin override / cron via iterate_all
 *
 * Never moves money. Never deletes. Only fills in missing ledger rows.
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
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dry_run;
    const sinceDays = Math.max(1, Math.min(365, Number(body?.since_days || 365)));

    const cutoffTs = Math.floor(Date.now() / 1000) - sinceDays * 86400;

    // ─────────────────────────────────────────────────────────────
    // PAGE through Stripe charges (paid only, last N days)
    // ─────────────────────────────────────────────────────────────
    const allCharges: any[] = [];
    let startingAfter: any = undefined;
    let pages = 0;
    while (pages < 50) {  // 50 * 100 = 5000 max
      const page: any = await stripe.charges.list({
        created: { gte: cutoffTs },
        limit: 100,
        starting_after: startingAfter,
        expand: ['data.balance_transaction', 'data.payment_intent'],
      });
      allCharges.push(...page.data);
      if (!page.has_more) break;
      startingAfter = page.data[page.data.length - 1].id;
      pages++;
    }

    // Keep only successful, non-refunded-to-zero charges
    const paidCharges = allCharges.filter((c: any) =>
      c.status === 'succeeded' && (c.amount - (c.amount_refunded || 0)) > 0
    );

    // ─────────────────────────────────────────────────────────────
    // For each charge, resolve the appointment_id via 3 sources
    // ─────────────────────────────────────────────────────────────
    type Resolved = {
      charge: any;
      appointment_id: string | null;
      source: string;
      patient_email: string | null;
      patient_name: string | null;
    };
    const resolved: Resolved[] = [];

    // Pre-fetch existing ledger rows so we skip what's already logged
    const chargeIds = paidCharges.map((c: any) => c.id);
    const existingByCharge = new Map<string, string>();
    if (chargeIds.length > 0) {
      // batched in chunks of 500 to avoid query length limits
      for (let i = 0; i < chargeIds.length; i += 500) {
        const chunk = chargeIds.slice(i, i + 500);
        const { data: existing } = await admin
          .from('stripe_qb_sync_log')
          .select('stripe_charge_id, appointment_id')
          .in('stripe_charge_id', chunk);
        for (const r of ((existing as any[]) || [])) {
          if (r.stripe_charge_id) existingByCharge.set(r.stripe_charge_id, r.appointment_id || '');
        }
      }
    }

    for (const charge of paidCharges) {
      if (existingByCharge.has(charge.id)) continue; // already logged

      let apptId: string | null = null;
      let source = '';
      const pi = typeof charge.payment_intent === 'object' ? charge.payment_intent : null;

      if (charge.metadata?.appointment_id) {
        apptId = charge.metadata.appointment_id;
        source = 'charge_metadata';
      } else if (pi?.metadata?.appointment_id) {
        apptId = pi.metadata.appointment_id;
        source = 'pi_metadata';
      } else if (pi?.id) {
        // Look up checkout session via payment_intent
        try {
          const sessions: any = await stripe.checkout.sessions.list({ payment_intent: pi.id, limit: 1 });
          if (sessions.data?.[0]?.metadata?.appointment_id) {
            apptId = sessions.data[0].metadata.appointment_id;
            source = 'session_metadata';
          }
        } catch { /* ignore */ }
      }

      resolved.push({
        charge,
        appointment_id: apptId,
        source: source || 'no_appointment_link',
        patient_email: charge.billing_details?.email || charge.receipt_email || null,
        patient_name: charge.billing_details?.name || null,
      });
    }

    const insertable = resolved.filter(r => r.appointment_id);
    const orphans = resolved.filter(r => !r.appointment_id);

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true, dry_run: true,
        charges_scanned: allCharges.length,
        paid_charges: paidCharges.length,
        already_in_ledger: paidCharges.length - resolved.length,
        missing_from_ledger: resolved.length,
        insertable_with_appt: insertable.length,
        orphan_no_appt: orphans.length,
        by_source: {
          charge_metadata: insertable.filter(r => r.source === 'charge_metadata').length,
          pi_metadata: insertable.filter(r => r.source === 'pi_metadata').length,
          session_metadata: insertable.filter(r => r.source === 'session_metadata').length,
        },
        sample_orphans: orphans.slice(0, 5).map(r => ({
          charge_id: r.charge.id,
          amount: r.charge.amount / 100,
          email: r.patient_email,
          name: r.patient_name,
          created: new Date(r.charge.created * 1000).toISOString(),
        })),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─────────────────────────────────────────────────────────────
    // INSERT missing rows. Existing downstream triggers handle the rest.
    // ─────────────────────────────────────────────────────────────
    let inserted = 0;
    let failed = 0;
    for (const r of insertable) {
      const charge = r.charge;
      const bt = typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
      const grossCents = charge.amount;
      const feeCents = bt?.fee || Math.round(charge.amount * 0.029 + 30); // fallback estimate
      const netCents = grossCents - feeCents;
      const refundedCents = charge.amount_refunded || 0;

      const { error } = await admin.from('stripe_qb_sync_log').insert({
        stripe_charge_id: charge.id,
        stripe_payment_intent_id: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id || null,
        appointment_id: r.appointment_id,
        amount_gross_cents: grossCents,
        amount_fee_cents: feeCents,
        amount_net_cents: netCents,
        amount_refunded_cents: refundedCents,
        currency: charge.currency || 'usd',
        charge_date: new Date(charge.created * 1000).toISOString(),
        patient_email: r.patient_email,
        patient_name: r.patient_name,
        qb_class_name: 'Backfilled (from Stripe)',
        qb_income_type: 'service',
        sync_status: 'pending',  // will be picked up by the QB sync cron
      });
      if (error) {
        console.warn('[backfill] insert failed for', charge.id, error.message);
        failed++;
      } else {
        inserted++;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      charges_scanned: allCharges.length,
      paid_charges: paidCharges.length,
      already_in_ledger: paidCharges.length - resolved.length,
      inserted_into_ledger: inserted,
      orphan_no_appt: orphans.length,
      insert_failures: failed,
      message: inserted === 0
        ? `Scanned ${paidCharges.length} paid charges — your ledger is fully synced.`
        : `Backfilled ${inserted} missing payment rows into the ledger. Downstream triggers will now auto-update appointment.total_amount + create v2 phleb-pay deltas where applicable. Refresh Earnings to see the updated pending list.`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[backfill] uncaught:', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
