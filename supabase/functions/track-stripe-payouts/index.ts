import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { stripe } from '../_shared/stripe.ts';

/**
 * TRACK STRIPE PAYOUTS — Bank-Side Ledger
 *
 * Hormozi principle: if you can't reconcile the bank, you can't trust
 * any of your numbers.
 *
 * Every time Stripe pays out to the bank, record it — AND tag each
 * underlying charge with its payout_id so we know which deposit in
 * QuickBooks it belongs to. Without this, bank rec is guesswork.
 *
 * Runs daily. Idempotent. Looks back 14 days to catch late-arriving
 * payouts and retroactively-attached balance transactions.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const daysBack = parseInt(url.searchParams.get('days') || '14');
    const sinceTs = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);

    // ── Pull payouts in window ───────────────────────────────────────
    const payouts: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const resp = await stripe.payouts.list({
        created: { gte: sinceTs },
        limit: 100,
        starting_after: startingAfter,
      });
      payouts.push(...resp.data);
      hasMore = resp.has_more;
      startingAfter = resp.data.length > 0 ? resp.data[resp.data.length - 1].id : undefined;
    }

    console.log(`Fetched ${payouts.length} payout(s) from Stripe`);

    const results = { total: payouts.length, inserted: 0, updated: 0, chargesLinked: 0, failed: 0 };

    for (const payout of payouts) {
      try {
        // Upsert the payout log
        const { data: existing } = await supabase
          .from('stripe_qb_payout_log')
          .select('id, sync_status')
          .eq('stripe_payout_id', payout.id)
          .maybeSingle();

        if (existing) {
          // Update status only (in case it changed from pending → paid)
          await supabase
            .from('stripe_qb_payout_log')
            .update({
              status: payout.status,
              arrival_date: payout.arrival_date
                ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
                : null,
            })
            .eq('id', existing.id);
          results.updated++;
        } else {
          await supabase.from('stripe_qb_payout_log').insert({
            stripe_payout_id: payout.id,
            payout_date: new Date(payout.created * 1000).toISOString(),
            amount_cents: payout.amount,
            currency: payout.currency || 'usd',
            arrival_date: payout.arrival_date
              ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
              : null,
            status: payout.status,
            raw_stripe_data: payout,
          });
          results.inserted++;
        }

        // ── Attach this payout_id to every charge that rolled into it ──
        // Pull balance transactions tied to this payout, map to charges.
        const balanceTxns: any[] = [];
        let btHasMore = true;
        let btAfter: string | undefined;
        while (btHasMore) {
          const btResp = await stripe.balanceTransactions.list({
            payout: payout.id,
            limit: 100,
            type: 'charge',
            starting_after: btAfter,
          });
          balanceTxns.push(...btResp.data);
          btHasMore = btResp.has_more;
          btAfter = btResp.data.length > 0 ? btResp.data[btResp.data.length - 1].id : undefined;
        }

        let linkedCount = 0;
        for (const bt of balanceTxns) {
          if (bt.source && typeof bt.source === 'string' && bt.source.startsWith('ch_')) {
            const { error } = await supabase
              .from('stripe_qb_sync_log')
              .update({ stripe_payout_id: payout.id })
              .eq('stripe_charge_id', bt.source)
              .is('stripe_payout_id', null);
            if (!error) linkedCount++;
          }
        }

        // Update charge_count on the payout row
        if (balanceTxns.length > 0) {
          await supabase
            .from('stripe_qb_payout_log')
            .update({ charge_count: balanceTxns.length })
            .eq('stripe_payout_id', payout.id);
        }

        results.chargesLinked += linkedCount;
      } catch (payoutErr: any) {
        console.error(`Payout error for ${payout.id}:`, payoutErr);
        results.failed++;
      }
    }

    console.log('Payout tracking complete:', results);

    return new Response(JSON.stringify({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Payout tracker error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
