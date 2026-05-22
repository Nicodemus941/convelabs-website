/**
 * TRANSFER-INVOICE-PHLEB-CUT
 *
 * Admin-fired one-shot: given an appointment_id, look up its Stripe
 * invoice, find the latest paid charge, compute the phleb's take via
 * compute_phleb_take_cents, and fire stripe.transfers.create from
 * platform balance to the phleb's Connect account.
 *
 * Use case: a patient paid a Stripe Invoice (instead of going through
 * Stripe Checkout) — so transfer_data didn't auto-route the phleb cut.
 * This edge fn does the catch-up transfer.
 *
 * Idempotent: refuses to re-transfer for an appointment that already
 * has a staff_payouts row with a stripe_transfer_id.
 *
 * Body: { appointment_id }
 * verify_jwt=false (gated by appointment lookup)
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

// KILL SWITCH (2026-05-21): disabled to stop double-transfer leak.
// Root cause: this fn AND reconcile-stripe-payments both fire transfers
// for invoice-paid appointments. Stripe accepts both because idempotency
// keys differ → phleb's Connect account double-paid. See chat log for
// affected appointments (Joyce Linton, Blake Hutton, Juanita Sevor,
// Amanda Wahrer, etc.).
//
// reconcile-stripe-payments now owns transfer creation for invoice-paid.
// Re-enable only after: (a) idempotency key wired here, (b) explicit
// guard against reconciler having already settled the appointment.
const KILL_SWITCH = true;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (KILL_SWITCH) {
    return new Response(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'transfer-invoice-phleb-cut disabled 2026-05-21 to prevent double-transfer. reconcile-stripe-payments handles invoice-paid transfers.',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  try {
    const { appointment_id } = await req.json().catch(() => ({}));
    if (!appointment_id) {
      return new Response(JSON.stringify({ error: 'appointment_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: appt } = await admin
      .from('appointments')
      .select('id, patient_name, service_type, tip_amount, family_group_id, stripe_invoice_id, stripe_payment_intent_id, payment_status, total_amount')
      .eq('id', appointment_id)
      .maybeSingle();
    if (!appt) {
      return new Response(JSON.stringify({ error: 'appointment_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (appt.payment_status !== 'completed') {
      return new Response(JSON.stringify({ error: 'not_paid', payment_status: appt.payment_status }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── FAMILY BUNDLE AWARENESS ─────────────────────────────────────
    // Per owner decision 2026-05-19: the $87 business floor applies ONCE
    // per family bundle, not per appointment row. Sum every row sharing
    // this row's family_group_id, run the v2 floor math against the combined
    // total, attach the transfer to the PRIMARY row (the one whose id =
    // family_group_id) for audit. Other rows in the bundle get their own
    // staff_payouts rows with amount_cents=0 + a note pointing at the primary.
    let bundleTotalCents = Math.round((appt.total_amount || 0) * 100);
    let bundleTipCents = Math.round(((appt.tip_amount || 0) as number) * 100);
    let bundleRowIds: string[] = [appointment_id];
    const isPrimaryOfBundle = appt.family_group_id && appt.family_group_id === appointment_id;
    if (appt.family_group_id) {
      if (!isPrimaryOfBundle) {
        // Non-primary companion row — delegate to the primary so the bundle
        // math runs ONCE and stays attached to the primary appointment.
        return new Response(JSON.stringify({
          ok: true, delegated_to_primary: true, primary_appointment_id: appt.family_group_id,
          message: 'Companion row — bundle transfer handled on primary appointment.',
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: bundleRows } = await admin
        .from('appointments')
        .select('id, total_amount, tip_amount')
        .eq('family_group_id', appt.family_group_id);
      bundleTotalCents = 0;
      bundleTipCents = 0;
      bundleRowIds = [];
      for (const r of (bundleRows || []) as any[]) {
        bundleTotalCents += Math.round((r.total_amount || 0) * 100);
        bundleTipCents += Math.round((r.tip_amount || 0) * 100);
        bundleRowIds.push(r.id);
      }
    }

    // Idempotency: skip if a successful transfer already exists for this appt
    const { data: existing } = await admin
      .from('staff_payouts' as any)
      .select('id, status, stripe_transfer_id, amount_cents')
      .eq('appointment_id', appointment_id)
      .in('status', ['succeeded', 'pending']);
    if (existing && existing.length > 0 && (existing as any[]).some(r => r.stripe_transfer_id)) {
      return new Response(JSON.stringify({
        ok: true, already: true,
        transfer_id: (existing as any[])[0].stripe_transfer_id,
        amount_cents: (existing as any[])[0].amount_cents,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolve the connected staff (single phleb scenario for now)
    const { data: connected } = await admin
      .from('staff_profiles')
      .select('id, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
      .not('stripe_connect_account_id', 'is', null)
      .eq('stripe_connect_charges_enabled', true)
      .eq('stripe_connect_payouts_enabled', true)
      .limit(2);
    if (!connected || connected.length !== 1) {
      return new Response(JSON.stringify({ error: 'connected_staff_ambiguous', count: connected?.length || 0 }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const phleb: any = connected[0];

    // Find the source charge (charge_id is needed for source_transaction so
    // the transfer is funded from THIS specific charge, not platform float)
    let chargeId: string | null = null;
    let paymentIntentId: string | null = appt.stripe_payment_intent_id || null;

    if (appt.stripe_invoice_id) {
      const invoice = await stripe.invoices.retrieve(appt.stripe_invoice_id, {
        expand: ['payment_intent', 'charge'],
      } as any);
      const inv: any = invoice;
      if (inv.charge && typeof inv.charge !== 'string') chargeId = inv.charge.id;
      else if (typeof inv.charge === 'string') chargeId = inv.charge;
      if (!paymentIntentId && inv.payment_intent) {
        paymentIntentId = typeof inv.payment_intent === 'string' ? inv.payment_intent : inv.payment_intent.id;
      }
      if (!chargeId && paymentIntentId) {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const charges = (pi as any).charges?.data || [];
        if (charges.length > 0) chargeId = charges[0].id;
      }
    }
    if (!chargeId) {
      return new Response(JSON.stringify({ error: 'no_charge_found', invoice_id: appt.stripe_invoice_id }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Compute phleb's take using the v2 BUSINESS-FLOOR rule.
    // Pre-fix this function called v1 compute_phleb_take_cents which only
    // returned base+tip+companion and never applied the $87 business floor —
    // so admin-billed visits with surcharges (Mark Disler $225, Mitesh Jivan
    // $375 family) silently shorted the phleb by the full surcharge.
    //
    // The v2 RPC needs the total charged (per family-bundle aggregate above),
    // and it handles the floor internally. Surcharge is passed as 0 because
    // the bundle total already includes any surcharges.
    const tipCents = bundleTipCents;
    const hasCompanion = !!appt.family_group_id;
    const { data: v2Rows } = await admin.rpc('compute_phleb_take_v2_inline' as any, {
      p_staff_id: phleb.id,
      p_service_type: appt.service_type || 'mobile',
      p_total_paid_cents: bundleTotalCents,
      p_surcharge_cents: 0,
      p_tip_cents: tipCents,
      p_has_companion: hasCompanion,
    });
    const v2Row: any = Array.isArray(v2Rows) ? v2Rows[0] : v2Rows;
    const takeCents = Math.max(0, Math.min(Number(v2Row?.take_cents) || 0, bundleTotalCents + tipCents));
    const ruleUsed = v2Row?.rule_used || 'unknown';
    const businessKeepCents = Number(v2Row?.business_keep_cents) || 0;
    console.log(`[transfer-invoice-phleb-cut] v2 rule '${ruleUsed}' → phleb $${(takeCents/100).toFixed(2)} business $${(businessKeepCents/100).toFixed(2)} (bundle total $${(bundleTotalCents/100).toFixed(2)}, rows ${bundleRowIds.length})`);
    if (takeCents <= 0) {
      return new Response(JSON.stringify({ error: 'take_zero' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fire Stripe transfer (source_transaction ties it to the original charge so
    // refunds flow correctly + the transfer is funded from that specific charge).
    // If Stripe rejects with insufficient_funds (auto-payouts swept the balance
    // before we could transfer), fall back to logging as 'manual_owed' so the
    // owner can settle from their bank / Profit-First bucket.
    let transferId: string | null = null;
    let transferErr: any = null;
    try {
      const transfer = await stripe.transfers.create({
        amount: takeCents,
        currency: 'usd',
        destination: phleb.stripe_connect_account_id,
        source_transaction: chargeId,
        description: `Phleb cut for ${appt.patient_name || 'patient'} (appt ${appointment_id.substring(0, 8)})`,
        metadata: {
          appointment_id,
          invoice_id: appt.stripe_invoice_id || '',
          source: 'invoice_catchup_transfer',
        },
      });
      transferId = transfer.id;
    } catch (e: any) {
      transferErr = e;
      // balance_insufficient = auto-payouts already swept the funds.
      // Other errors (Connect not enabled, dest account inactive, etc.)
      // fall into the same manual-settle path so phleb is never silently
      // shorted.
      console.warn(`[transfer-invoice-phleb-cut] transfer failed (${e?.code || 'unknown'}): ${e?.message || e}. Falling back to manual_owed.`);
    }

    const isManualOwed = !transferId;
    const status = isManualOwed ? 'manual_owed' : 'succeeded';
    const notes = isManualOwed
      ? `Manual owed (transfers.create failed: ${transferErr?.code || 'unknown'} - ${(transferErr?.message || '').substring(0, 120)}). Owner to settle from bank / Profit-First bucket and flip to manual_settled.`
      : 'Catch-up transfer for Stripe Invoice payment';

    if (existing && existing.length > 0) {
      await admin.from('staff_payouts' as any)
        .update({
          stripe_transfer_id: transferId,
          stripe_charge_id: chargeId,
          stripe_payment_intent_id: paymentIntentId,
          stripe_destination_account_id: phleb.stripe_connect_account_id,
          status,
          transferred_at: transferId ? new Date().toISOString() : null,
          notes,
        })
        .eq('appointment_id', appointment_id);
    } else {
      await admin.from('staff_payouts' as any).insert({
        staff_id: phleb.id,
        appointment_id,
        service_type: appt.service_type || 'mobile',
        base_per_visit_cents: takeCents - tipCents,
        companion_addon_cents: hasCompanion ? 1500 : 0,
        tip_cents: tipCents,
        amount_cents: takeCents,
        stripe_transfer_id: transferId,
        stripe_charge_id: chargeId,
        stripe_payment_intent_id: paymentIntentId,
        stripe_destination_account_id: phleb.stripe_connect_account_id,
        status,
        transferred_at: transferId ? new Date().toISOString() : null,
        notes,
      });
    }

    return new Response(JSON.stringify({
      ok: true, transfer_id: transferId, amount_cents: takeCents, charge_id: chargeId,
      manual_owed: isManualOwed,
      transfer_error: transferErr?.code || null,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[transfer-invoice-phleb-cut] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e), code: e?.code, type: e?.type }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
