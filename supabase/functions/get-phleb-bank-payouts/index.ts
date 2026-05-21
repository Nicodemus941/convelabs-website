/**
 * GET-PHLEB-BANK-PAYOUTS
 *
 * Returns recent Stripe payouts (Connect-account → phleb's bank) for the
 * authenticated phleb. Powers the "What cleared in your bank today" card
 * on the PWA earnings tab.
 *
 * Why an edge fn (vs reading staff_payouts directly): Stripe is the SOURCE
 * of truth for bank arrivals. staff_payouts only knows about the platform
 * → Connect TRANSFER. The phleb's bank arrival is the SUBSEQUENT payout
 * (with delay_days from the Connect payout schedule). Only Stripe knows
 * the arrival_date + actual settled amount.
 *
 * Auth: phleb's session JWT. Server resolves the user's staff_profile +
 * stripe_connect_account_id, then queries Stripe with that as
 * stripeAccount. Phleb can ONLY see their own payouts.
 *
 * Response shape:
 *   {
 *     today_total_cents, today_count,
 *     month_total_cents, month_count,
 *     year_total_cents, year_count,
 *     pending_total_cents,   // in-flight to bank
 *     next_arrival_date,      // ISO date of the next scheduled bank arrival
 *     payouts: [{ id, amount, status, arrival_date, created, method, failure_message }],
 *     schedule: { interval, delay_days, weekly_anchor?, monthly_anchor? }
 *   }
 */

import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Resolve the phleb's Connect account id
    const { data: sp } = await admin
      .from('staff_profiles')
      .select('id, stripe_connect_account_id, stripe_connect_payouts_enabled')
      .eq('user_id', user.id)
      .maybeSingle();
    const acctId = (sp as any)?.stripe_connect_account_id || null;
    if (!acctId) {
      return new Response(JSON.stringify({
        ok: false, error: 'no_connect_account',
        message: 'No Stripe Connect account on file. Complete Connect onboarding to see bank payouts.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Account schedule (delay_days, interval) so the UI can say "next
    // payout arrives Friday"
    let schedule: any = null;
    try {
      const acct = await stripe.accounts.retrieve(acctId);
      schedule = (acct as any).settings?.payouts?.schedule || null;
    } catch { /* non-fatal */ }

    // Last 90 days of payouts
    const nineties = Math.floor(Date.now() / 1000) - 90 * 86400;
    const payouts = await stripe.payouts.list(
      { limit: 100, created: { gte: nineties } },
      { stripeAccount: acctId },
    );

    // Bucket by arrival date for today/MTD/YTD totals (paid status only)
    const todayIso = new Date().toISOString().substring(0, 10);
    const monthIso = todayIso.substring(0, 7); // YYYY-MM
    const yearIso = todayIso.substring(0, 4);

    let todayCents = 0, todayCount = 0;
    let monthCents = 0, monthCount = 0;
    let yearCents = 0, yearCount = 0;
    let pendingCents = 0;
    let nextArrival: string | null = null;

    for (const p of payouts.data) {
      const arrival = p.arrival_date ? new Date(p.arrival_date * 1000).toISOString().substring(0, 10) : '';
      if (p.status === 'paid' && arrival) {
        if (arrival === todayIso) { todayCents += p.amount; todayCount++; }
        if (arrival.startsWith(monthIso)) { monthCents += p.amount; monthCount++; }
        if (arrival.startsWith(yearIso)) { yearCents += p.amount; yearCount++; }
      } else if (['pending', 'in_transit'].includes(p.status)) {
        pendingCents += p.amount;
        if (arrival && (!nextArrival || arrival < nextArrival)) nextArrival = arrival;
      }
    }

    const payoutsList = payouts.data.slice(0, 12).map((p: any) => ({
      id: p.id,
      amount_cents: p.amount,
      status: p.status,
      method: p.method,
      arrival_date: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString().substring(0, 10) : null,
      created: p.created ? new Date(p.created * 1000).toISOString() : null,
      failure_message: p.failure_message || null,
      description: p.description || null,
    }));

    return new Response(JSON.stringify({
      ok: true,
      connect_account_id: acctId,
      today_total_cents: todayCents,
      today_count: todayCount,
      month_total_cents: monthCents,
      month_count: monthCount,
      year_total_cents: yearCents,
      year_count: yearCount,
      pending_total_cents: pendingCents,
      next_arrival_date: nextArrival,
      payouts: payoutsList,
      schedule,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[get-phleb-bank-payouts]', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
