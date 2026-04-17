import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { stripe } from '../_shared/stripe.ts';

/**
 * SYNC STRIPE → QUICKBOOKS — Phase 1 (Ledger Pipeline)
 *
 * Hormozi principle: every dollar gets classified the moment it lands.
 * No monthly reconciliation surprises. No "where did this $150 come from"
 * at tax time.
 *
 * How it works:
 * 1. Pulls every Stripe charge from a window (default: yesterday)
 * 2. For each charge, classifies it using stripe_qb_mapping rules
 * 3. Writes a staged row to stripe_qb_sync_log with the QB destination
 * 4. When QB OAuth is wired, a follow-up function posts the row to QB
 *
 * Until QB OAuth is live, stripe_qb_sync_log IS the ledger. Every
 * charge is categorized, attributed to a patient, and tagged with the
 * QB account/class it belongs in. Export-ready.
 *
 * Runs nightly via cron. Also callable on-demand with ?since=YYYY-MM-DD
 * to backfill a window.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MappingRule {
  id: string;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  appointment_service_type: string | null;
  metadata_key: string | null;
  metadata_value: string | null;
  min_amount_cents: number | null;
  max_amount_cents: number | null;
  qb_account_name: string;
  qb_class_name: string | null;
  qb_income_type: string;
  priority: number;
}

interface ClassificationContext {
  productIds: string[];
  priceIds: string[];
  metadata: Record<string, string>;
  serviceType: string | null;
  amountCents: number;
}

function matchRule(rule: MappingRule, ctx: ClassificationContext): boolean {
  if (rule.stripe_product_id && !ctx.productIds.includes(rule.stripe_product_id)) return false;
  if (rule.stripe_price_id && !ctx.priceIds.includes(rule.stripe_price_id)) return false;
  if (rule.appointment_service_type && rule.appointment_service_type !== ctx.serviceType) return false;
  if (rule.metadata_key) {
    const metaVal = ctx.metadata[rule.metadata_key];
    if (!metaVal) return false;
    if (rule.metadata_value && metaVal !== rule.metadata_value) return false;
  }
  if (rule.min_amount_cents !== null && ctx.amountCents < rule.min_amount_cents) return false;
  if (rule.max_amount_cents !== null && ctx.amountCents > rule.max_amount_cents) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Parse window ─────────────────────────────────────────────────
    const url = new URL(req.url);
    const sinceParam = url.searchParams.get('since');
    const untilParam = url.searchParams.get('until');

    const now = new Date();
    let sinceTs: number;
    let untilTs: number;

    if (sinceParam) {
      sinceTs = Math.floor(new Date(sinceParam).getTime() / 1000);
    } else {
      // Default: last 26 hours (slight overlap so nothing slips through the 24h boundary)
      sinceTs = Math.floor((now.getTime() - 26 * 60 * 60 * 1000) / 1000);
    }
    untilTs = untilParam
      ? Math.floor(new Date(untilParam).getTime() / 1000)
      : Math.floor(now.getTime() / 1000);

    console.log(`Syncing Stripe charges from ${new Date(sinceTs * 1000).toISOString()} to ${new Date(untilTs * 1000).toISOString()}`);

    // ── Load mapping rules (cheap, cache in memory for this run) ────
    const { data: rules } = await supabase
      .from('stripe_qb_mapping')
      .select('*')
      .eq('active', true)
      .order('priority', { ascending: true });

    if (!rules || rules.length === 0) {
      throw new Error('No active mapping rules — seed stripe_qb_mapping first');
    }

    // ── Pull all charges in window (paginated) ──────────────────────
    const charges: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const resp = await stripe.charges.list({
        created: { gte: sinceTs, lte: untilTs },
        limit: 100,
        starting_after: startingAfter,
        expand: ['data.balance_transaction', 'data.invoice'],
      });
      charges.push(...resp.data);
      hasMore = resp.has_more;
      startingAfter = resp.data.length > 0 ? resp.data[resp.data.length - 1].id : undefined;
    }

    console.log(`Fetched ${charges.length} charge(s) from Stripe`);

    // ── Process each charge ─────────────────────────────────────────
    const results = {
      total: charges.length,
      inserted: 0,
      skipped: 0,
      failed: 0,
      classified: {} as Record<string, number>,
    };

    for (const charge of charges) {
      try {
        // Skip failed/unsuccessful charges — only successful money counts
        if (charge.status !== 'succeeded') {
          results.skipped++;
          continue;
        }

        // Skip if already logged (idempotent)
        const { data: existing } = await supabase
          .from('stripe_qb_sync_log')
          .select('id')
          .eq('stripe_charge_id', charge.id)
          .maybeSingle();
        if (existing) {
          results.skipped++;
          continue;
        }

        // ── Build classification context ─────────────────────────────
        const invoice = typeof charge.invoice === 'object' ? charge.invoice : null;
        const balanceTx = typeof charge.balance_transaction === 'object'
          ? charge.balance_transaction
          : null;

        const appointmentId = invoice?.metadata?.appointment_id
          || charge.metadata?.appointment_id
          || null;

        let serviceType: string | null = null;
        let patientEmail: string | null = charge.billing_details?.email || invoice?.customer_email || null;
        let patientName: string | null = charge.billing_details?.name || null;

        if (appointmentId) {
          const { data: appt } = await supabase
            .from('appointments')
            .select('service_type, patient_email, patient_name')
            .eq('id', appointmentId)
            .maybeSingle();
          if (appt) {
            serviceType = appt.service_type || null;
            patientEmail = patientEmail || appt.patient_email || null;
            patientName = patientName || appt.patient_name || null;
          }
        }

        // Pull product/price IDs from invoice line items if we have them
        const productIds: string[] = [];
        const priceIds: string[] = [];
        if (invoice?.lines?.data) {
          for (const line of invoice.lines.data) {
            if (line.price?.id) priceIds.push(line.price.id);
            if (line.price?.product && typeof line.price.product === 'string') {
              productIds.push(line.price.product);
            }
          }
        }

        const ctx: ClassificationContext = {
          productIds,
          priceIds,
          metadata: { ...(invoice?.metadata || {}), ...(charge.metadata || {}) },
          serviceType,
          amountCents: charge.amount,
        };

        // ── Find the winning rule ────────────────────────────────────
        const winningRule = rules.find(r => matchRule(r, ctx));
        if (!winningRule) {
          // Shouldn't happen — priority=100 is a catch-all — but guard anyway
          console.warn(`No rule matched charge ${charge.id} ($${charge.amount / 100})`);
          results.failed++;
          continue;
        }

        // ── Insert into sync log ─────────────────────────────────────
        const netCents = balanceTx?.net ?? (charge.amount - (balanceTx?.fee || 0));
        const feeCents = balanceTx?.fee || 0;

        const { error: insertError } = await supabase
          .from('stripe_qb_sync_log')
          .insert({
            stripe_charge_id: charge.id,
            stripe_invoice_id: invoice?.id || null,
            stripe_customer_id: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || null,
            stripe_payment_intent_id: typeof charge.payment_intent === 'string' ? charge.payment_intent : null,
            stripe_balance_transaction_id: balanceTx?.id || null,
            charge_date: new Date(charge.created * 1000).toISOString(),
            amount_gross_cents: charge.amount,
            amount_fee_cents: feeCents,
            amount_net_cents: netCents,
            amount_refunded_cents: charge.amount_refunded || 0,
            currency: charge.currency || 'usd',
            appointment_id: appointmentId,
            patient_email: patientEmail,
            patient_name: patientName,
            mapping_id: winningRule.id,
            qb_account_name: winningRule.qb_account_name,
            qb_class_name: winningRule.qb_class_name,
            qb_income_type: winningRule.qb_income_type,
            sync_status: charge.amount_refunded > 0 ? 'refunded' : 'pending',
            raw_stripe_data: charge,
          });

        if (insertError) {
          console.error(`Insert failed for ${charge.id}:`, insertError);
          results.failed++;
          continue;
        }

        results.inserted++;
        results.classified[winningRule.qb_income_type] =
          (results.classified[winningRule.qb_income_type] || 0) + 1;
      } catch (chargeErr: any) {
        console.error(`Error processing charge ${charge.id}:`, chargeErr);
        results.failed++;
      }
    }

    // ── Summary ──────────────────────────────────────────────────────
    console.log('Sync complete:', results);

    return new Response(JSON.stringify({
      success: true,
      window: {
        since: new Date(sinceTs * 1000).toISOString(),
        until: new Date(untilTs * 1000).toISOString(),
      },
      ...results,
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
