import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { stripe } from '../_shared/stripe.ts';

/**
 * RECONCILE INVOICE PAYMENTS — Hormozi Self-Healing Layer
 *
 * Problem: Stripe webhooks aren't 100% reliable. Invoices get paid
 * but our DB never updates. Patients show "unpaid" when they already paid.
 *
 * Solution: Don't trust webhooks alone. Proactively check Stripe every 30 min.
 * If Stripe says "paid" and we say "pending" → update our DB. Done.
 *
 * Runs via cron every 30 minutes. Also callable on-demand.
 *
 * Checks:
 * 1. Appointments with stripe_invoice_id where payment_status != 'completed'
 * 2. Queries Stripe API for actual invoice status
 * 3. Syncs any mismatches
 * 4. Logs everything for audit trail
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const synced: Array<{ appointmentId: string; patientName: string; amount: number; action: string }> = [];
    const errors: string[] = [];

    // ── STEP 1: Find appointments with Stripe invoice IDs that aren't marked paid ──
    //
    // BUG FIX (2026-04-30): the previous filter only excluded 'completed' so
    // rows already marked 'voided' / 'void' / 'refunded' got pulled every
    // 30 min, hit Stripe again (paid API call), no-op'd the UPDATE, and
    // logged a fresh error_logs row each cycle — producing the
    // "Cron health check error log" notification spam (Savitri Gopie +
    // Bob Peters at $0 every 30 min). Now we also exclude all terminal-
    // state payment_statuses so those rows leave the polling set after
    // their first reconciliation pass.
    const { data: unsyncedAppts, error: queryError } = await supabase
      .from('appointments')
      .select('id, patient_name, stripe_invoice_id, payment_status, invoice_status, total_amount, total_price, status')
      .not('stripe_invoice_id', 'is', null)
      .not('payment_status', 'in', '("completed","voided","void","refunded","uncollectible")')
      .not('invoice_status', 'in', '("paid","voided","void","uncollectible")')
      .not('status', 'in', '("cancelled")')
      .limit(50);

    if (queryError) {
      throw new Error(`Query error: ${queryError.message}`);
    }

    if (!unsyncedAppts || unsyncedAppts.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'All invoices in sync',
        synced: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Found ${unsyncedAppts.length} appointment(s) with unsynced invoices — checking Stripe...`);

    // ── STEP 2: Check each invoice against Stripe ──
    for (const appt of unsyncedAppts) {
      try {
        const invoice = await stripe.invoices.retrieve(appt.stripe_invoice_id);

        if (invoice.status === 'paid' || invoice.paid === true) {
          // ── STRIPE SAYS PAID — Update our DB ──
          const updateData: Record<string, any> = {
            payment_status: 'completed',
            invoice_status: 'paid',
          };

          // Capture the payment intent if available
          if (typeof invoice.payment_intent === 'string') {
            updateData.stripe_payment_intent_id = invoice.payment_intent;
          }

          // If we have amount_paid from Stripe and it differs from our records, note it
          if (invoice.amount_paid && invoice.amount_paid > 0) {
            const stripeAmount = invoice.amount_paid / 100; // Stripe uses cents
            updateData.total_amount = stripeAmount;
          }

          const { error: updateError } = await supabase
            .from('appointments')
            .update(updateData)
            .eq('id', appt.id);

          if (updateError) {
            errors.push(`Failed to update ${appt.patient_name} (${appt.id}): ${updateError.message}`);
          } else {
            synced.push({
              appointmentId: appt.id,
              patientName: appt.patient_name || 'Unknown',
              amount: invoice.amount_paid ? invoice.amount_paid / 100 : (appt.total_amount || appt.total_price || 0),
              action: 'marked_paid',
            });
            console.log(`✓ Synced: ${appt.patient_name} — invoice ${appt.stripe_invoice_id} is PAID on Stripe`);
          }
        } else if (invoice.status === 'void' || invoice.status === 'uncollectible') {
          // Invoice was voided/written off on Stripe — update our side too
          const { error: updateError } = await supabase
            .from('appointments')
            .update({
              invoice_status: invoice.status === 'void' ? 'voided' : 'uncollectible',
              payment_status: 'voided',
            })
            .eq('id', appt.id);

          if (!updateError) {
            synced.push({
              appointmentId: appt.id,
              patientName: appt.patient_name || 'Unknown',
              amount: 0,
              action: `marked_${invoice.status}`,
            });
            console.log(`✓ Synced: ${appt.patient_name} — invoice ${invoice.status} on Stripe`);
          }
        } else {
          // Still open/draft/uncollectible on Stripe — nothing to do
          console.log(`○ ${appt.patient_name} — invoice still ${invoice.status} on Stripe`);
        }
      } catch (stripeErr: any) {
        // Invoice might not exist on Stripe (deleted, wrong ID, etc.)
        if (stripeErr.statusCode === 404) {
          errors.push(`Invoice ${appt.stripe_invoice_id} not found on Stripe for ${appt.patient_name}`);
        } else {
          errors.push(`Stripe API error for ${appt.patient_name}: ${stripeErr.message}`);
        }
      }
    }

    // ── STEP 3: Log results ──
    // Only log entries that were actually moved to a NEW state (paid).
    // Routine "marked_void / marked_uncollectible" syncs and idempotent
    // re-runs no longer get a row in error_logs — those were tripping
    // the activity-monitor's "new errors this cycle" alert every 30 min
    // even though nothing was wrong.
    const billable = synced.filter(s => s.action === 'marked_paid');
    if (billable.length > 0) {
      console.log(`Reconciliation complete: ${billable.length} payment(s) freshly marked paid`);
      await supabase.from('error_logs').insert({
        error_type: 'reconciliation',
        component: 'reconcile-invoice-payments',
        action: 'auto_sync',
        error_message: `Synced ${billable.length} payment(s): ${billable.map(s => `${s.patientName} ($${s.amount})`).join(', ')}`,
        resolved: true,
      }).then(() => {}, () => {});
    } else if (synced.length > 0) {
      console.log(`Reconciliation: ${synced.length} non-billable state-sync(s) — not logged.`);
    }

    return new Response(JSON.stringify({
      success: true,
      checked: unsyncedAppts.length,
      synced: synced.length,
      errors: errors.length,
      details: { synced, errors },
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Reconciliation error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
