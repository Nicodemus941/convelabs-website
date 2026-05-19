/**
 * STRIPE-PAYOUT-DIAGNOSTIC
 *
 * One-shot read-only diagnostic. Pulls the platform's Stripe balance,
 * every Connect account's balance + payout schedule, recent payouts, and
 * any pending money. Returns a structured report so the owner can see
 * exactly where dollars sit between "patient charged" → "phleb's bank"
 * and "platform's bank."
 *
 * Goal of the audit: confirm payments for FUTURE appointments are NOT
 * being held by Stripe pending service rendering. The transfer_data.
 * destination path moves the phleb's share to the Connect account at
 * charge capture, not at visit completion — so any "held" money is
 * either (a) in the platform's reserve, (b) sitting in a Connect balance
 * waiting for its payout schedule to run, or (c) caught in a Stripe
 * risk review.
 *
 * Auth: admin only. Read-only.
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

const cents = (n: number) => `$${(n / 100).toFixed(2)}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const cronSecret = body?.cron_secret;
    const isCronAuth = cronSecret && cronSecret === Deno.env.get('CRON_SECRET');

    if (!isCronAuth) {
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

    const report: any = { generated_at: new Date().toISOString() };

    // ─── PLATFORM BALANCE ─────────────────────────────────────────
    const platformBalance = await stripe.balance.retrieve();
    report.platform = {
      available: platformBalance.available.map(b => ({ currency: b.currency, amount: b.amount, pretty: cents(b.amount) })),
      pending: platformBalance.pending.map(b => ({ currency: b.currency, amount: b.amount, pretty: cents(b.amount) })),
      // Connect reserved = funds we owe to Connect accounts but haven't yet transferred (shouldn't exist under destination charges, but worth surfacing)
      connect_reserved: (platformBalance as any).connect_reserved?.map((b: any) => ({ currency: b.currency, amount: b.amount, pretty: cents(b.amount) })) || [],
    };

    // ─── PLATFORM PAYOUT SCHEDULE ─────────────────────────────────
    try {
      const acctInfo = await stripe.accounts.retrieve();
      const schedule = (acctInfo as any).settings?.payouts?.schedule;
      report.platform.payout_schedule = schedule || null;
      report.platform.payouts_enabled = (acctInfo as any).payouts_enabled;
      report.platform.charges_enabled = (acctInfo as any).charges_enabled;
    } catch (e: any) { report.platform.payout_schedule_error = e?.message; }

    // ─── PLATFORM RECENT PAYOUTS TO BUSINESS BANK ─────────────────
    try {
      const payouts = await stripe.payouts.list({ limit: 10 });
      report.platform.recent_payouts = payouts.data.map((p: any) => ({
        id: p.id, status: p.status, amount: p.amount, pretty: cents(p.amount),
        method: p.method, type: p.type,
        arrival_date: new Date((p.arrival_date || 0) * 1000).toISOString().substring(0, 10),
        created: new Date((p.created || 0) * 1000).toISOString().substring(0, 10),
        failure_message: p.failure_message || null,
      }));
    } catch (e: any) { report.platform.payouts_error = e?.message; }

    // ─── CONNECT ACCOUNTS ────────────────────────────────────────
    const { data: phlebs } = await admin
      .from('staff_profiles')
      .select('id, user_id, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
      .not('stripe_connect_account_id', 'is', null);

    const connectReports: any[] = [];
    for (const p of (phlebs || []) as any[]) {
      const acctId = p.stripe_connect_account_id;
      const c: any = { staff_id: p.id, stripe_connect_account_id: acctId };
      try {
        const acct = await stripe.accounts.retrieve(acctId);
        c.charges_enabled = (acct as any).charges_enabled;
        c.payouts_enabled = (acct as any).payouts_enabled;
        c.disabled_reason = (acct as any).requirements?.disabled_reason || null;
        c.requirements_pending = (acct as any).requirements?.currently_due || [];
        c.payout_schedule = (acct as any).settings?.payouts?.schedule || null;
      } catch (e: any) { c.account_error = e?.message; }
      try {
        const bal = await stripe.balance.retrieve({ stripeAccount: acctId });
        c.balance = {
          available: bal.available.map(b => ({ currency: b.currency, amount: b.amount, pretty: cents(b.amount) })),
          pending: bal.pending.map(b => ({ currency: b.currency, amount: b.amount, pretty: cents(b.amount) })),
        };
      } catch (e: any) { c.balance_error = e?.message; }
      try {
        const cp = await stripe.payouts.list({ limit: 5 }, { stripeAccount: acctId });
        c.recent_payouts = cp.data.map((x: any) => ({
          id: x.id, status: x.status, amount: x.amount, pretty: cents(x.amount),
          arrival_date: new Date((x.arrival_date || 0) * 1000).toISOString().substring(0, 10),
          failure_message: x.failure_message || null,
        }));
      } catch (e: any) { c.payouts_error = e?.message; }
      try {
        const transfers = await stripe.transfers.list({ destination: acctId, limit: 10 });
        c.recent_transfers_in = transfers.data.map((t: any) => ({
          id: t.id, amount: t.amount, pretty: cents(t.amount),
          created: new Date((t.created || 0) * 1000).toISOString().substring(0, 10),
          reversed: (t as any).reversed || false,
        }));
      } catch (e: any) { c.transfers_error = e?.message; }
      connectReports.push(c);
    }
    report.connect_accounts = connectReports;

    // ─── ANY MONEY "HELD" / PENDING REVIEW ───────────────────────
    // Stripe's review queue can hold payments at the platform level.
    try {
      const reviews = await stripe.reviews.list({ limit: 10 });
      report.platform.open_reviews = reviews.data.filter((r: any) => r.open).map((r: any) => ({
        id: r.id, reason: r.reason, charge: r.charge, created: new Date((r.created || 0) * 1000).toISOString(),
      }));
    } catch (e: any) { report.platform.reviews_error = e?.message; }

    // ─── FUTURE-APPT UNDISTRIBUTED REVENUE FROM OUR DB ───────────
    // Cross-reference: any successful payment for a future appointment
    // where the staff_payouts row hasn't been transferred yet.
    const { data: undistributed } = await admin
      .from('appointments')
      .select('id, patient_name, appointment_date, total_amount, payment_status, status')
      .gte('appointment_date', new Date().toISOString())
      .in('payment_status', ['paid', 'completed', 'succeeded'])
      .not('status', 'eq', 'cancelled');
    const apptIds = (undistributed || []).map((a: any) => a.id);
    let stuckCount = 0; let stuckCents = 0;
    if (apptIds.length > 0) {
      const { data: payoutRows } = await admin
        .from('staff_payouts')
        .select('appointment_id, status, amount_cents')
        .in('appointment_id', apptIds);
      const byId = new Map<string, any[]>();
      for (const r of (payoutRows || []) as any[]) {
        const arr = byId.get(r.appointment_id) || [];
        arr.push(r); byId.set(r.appointment_id, arr);
      }
      for (const a of undistributed || []) {
        const rows = byId.get(a.id) || [];
        const hasSucceeded = rows.some(r => r.status === 'succeeded');
        if (!hasSucceeded) {
          stuckCount++;
          stuckCents += Math.round((a.total_amount || 0) * 100);
        }
      }
    }
    report.future_appt_distribution = {
      paid_future_appts: apptIds.length,
      missing_phleb_payout_row: stuckCount,
      undistributed_total_gross_dollars: stuckCents / 100,
      note: 'Rows where the patient has paid + visit is future, but no succeeded staff_payouts row exists. Either Connect wasn\'t configured at booking, or the webhook didn\'t insert the row.',
    };

    return new Response(JSON.stringify(report, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[stripe-payout-diagnostic]', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error', stack: e?.stack }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
