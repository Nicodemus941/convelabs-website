/**
 * RECONCILE-PHANTOM-PAYMENTS
 *
 * Owner-triggered diagnostic + recovery. For every appointment marked
 * payment_status='completed' but missing a stripe_qb_sync_log entry, this
 * function:
 *
 *   1. If stripe_invoice_id is on the appointment row, fetch the Stripe
 *      invoice. If status='paid', write a stripe_qb_sync_log row with the
 *      invoice's charge + amount + paid date.
 *   2. Otherwise, search Stripe Charges by customer email + total_amount
 *      within ±10 days of appointment_date. If exactly one match, write
 *      the QB log row. If 0 or >1, report so admin can verify.
 *
 * Returns a per-appointment outcome list so the owner can see what got
 * recovered + what still needs manual triage.
 *
 * Body: { appointment_ids?: string[], days?: number } — if appointment_ids
 *       omitted, defaults to the output of list_phantom_paid_appointments(days).
 * Auth: admin/super_admin/office_manager OR cron_secret.
 * verify_jwt=false (own auth).
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

interface ApptRow {
  id: string;
  patient_name: string;
  patient_email: string | null;
  appointment_date: string;
  service_type: string;
  total_amount: number;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  billed_to: string;
  organization_id: string | null;
}

interface Outcome {
  appointment_id: string;
  patient_name: string;
  date: string;
  amount: number;
  status: 'recovered_from_invoice' | 'recovered_from_charge_search' | 'ambiguous_charge_match' | 'no_stripe_record' | 'already_logged' | 'error';
  charge_id?: string;
  invoice_id?: string;
  charge_date?: string;
  net_cents?: number;
  candidates?: number;
  error?: string;
}

async function ensureNotAlreadyLogged(admin: any, apptId: string): Promise<boolean> {
  const { data } = await admin
    .from('stripe_qb_sync_log')
    .select('id')
    .eq('appointment_id', apptId)
    .gt('amount_net_cents', 0)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function writeQbLog(admin: any, row: {
  appointment_id: string;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  stripe_customer_id: string | null;
  charge_date: string;
  amount_gross_cents: number;
  amount_net_cents: number;
  amount_fee_cents: number;
  qb_income_type: string;
  qb_class_name: string;
}) {
  await admin.from('stripe_qb_sync_log').insert({
    ...row,
    currency: 'usd',
    sync_status: 'pending',
    qb_account_name: 'Stripe Income',
    raw_stripe_data: { backfilled_via: 'reconcile-phantom-payments', at: new Date().toISOString() },
  });
}

async function recoverFromInvoice(admin: any, appt: ApptRow): Promise<Outcome> {
  try {
    const inv = await stripe.invoices.retrieve(appt.stripe_invoice_id!, { expand: ['charge'] } as any);
    if ((inv as any).status !== 'paid') {
      return { appointment_id: appt.id, patient_name: appt.patient_name, date: appt.appointment_date, amount: appt.total_amount, status: 'no_stripe_record', invoice_id: appt.stripe_invoice_id!, error: `invoice status=${(inv as any).status}` };
    }
    const charge: any = (inv as any).charge && typeof (inv as any).charge !== 'string' ? (inv as any).charge : null;
    const chargeId = charge?.id || (typeof (inv as any).charge === 'string' ? (inv as any).charge : null);
    const customerId = typeof (inv as any).customer === 'string' ? (inv as any).customer : (inv as any).customer?.id || null;
    const amountPaid = (inv as any).amount_paid || charge?.amount || 0;
    const fee = charge?.balance_transaction ? null : 0; // we don't expand balance_transaction by default
    const net = amountPaid; // best-effort net (no BT expanded); will be slight over-count but better than missing
    await writeQbLog(admin, {
      appointment_id: appt.id,
      stripe_charge_id: chargeId,
      stripe_invoice_id: appt.stripe_invoice_id!,
      stripe_customer_id: customerId,
      charge_date: new Date(((inv as any).status_transitions?.paid_at || (inv as any).created || Date.now() / 1000) * 1000).toISOString(),
      amount_gross_cents: amountPaid,
      amount_net_cents: net,
      amount_fee_cents: 0,
      qb_income_type: appt.billed_to === 'org' ? 'org_invoice' : 'patient_invoice',
      qb_class_name: appt.service_type || 'Uncategorized',
    });
    return { appointment_id: appt.id, patient_name: appt.patient_name, date: appt.appointment_date, amount: appt.total_amount, status: 'recovered_from_invoice', invoice_id: appt.stripe_invoice_id!, charge_id: chargeId || undefined, net_cents: net };
  } catch (e: any) {
    return { appointment_id: appt.id, patient_name: appt.patient_name, date: appt.appointment_date, amount: appt.total_amount, status: 'error', error: e?.message };
  }
}

async function recoverFromChargeSearch(admin: any, appt: ApptRow): Promise<Outcome> {
  try {
    if (!appt.patient_email) {
      return { appointment_id: appt.id, patient_name: appt.patient_name, date: appt.appointment_date, amount: appt.total_amount, status: 'no_stripe_record', error: 'no email to search by' };
    }
    const amountCents = Math.round((appt.total_amount || 0) * 100);
    const dateMs = new Date(appt.appointment_date).getTime();
    const lo = Math.floor((dateMs - 14 * 86400000) / 1000);
    const hi = Math.floor((dateMs + 14 * 86400000) / 1000);
    // Stripe Charges search by amount + customer email is fragile via list;
    // use Stripe Search API for exact criteria.
    const query = `amount:'${amountCents}' AND status:'succeeded' AND -refunded:'true'`;
    const searchRes = await stripe.charges.search({ query, limit: 50 });
    const byEmail = searchRes.data.filter((c: any) => {
      const created = c.created || 0;
      if (created < lo || created > hi) return false;
      const email = (c.billing_details?.email || c.receipt_email || '').toLowerCase();
      return email === appt.patient_email!.toLowerCase();
    });
    if (byEmail.length === 0) {
      return { appointment_id: appt.id, patient_name: appt.patient_name, date: appt.appointment_date, amount: appt.total_amount, status: 'no_stripe_record', candidates: 0 };
    }
    if (byEmail.length > 1) {
      return { appointment_id: appt.id, patient_name: appt.patient_name, date: appt.appointment_date, amount: appt.total_amount, status: 'ambiguous_charge_match', candidates: byEmail.length };
    }
    const c: any = byEmail[0];
    await writeQbLog(admin, {
      appointment_id: appt.id,
      stripe_charge_id: c.id,
      stripe_invoice_id: null,
      stripe_customer_id: typeof c.customer === 'string' ? c.customer : c.customer?.id || null,
      charge_date: new Date((c.created || 0) * 1000).toISOString(),
      amount_gross_cents: c.amount,
      amount_net_cents: c.amount, // best-effort without balance_txn expansion
      amount_fee_cents: 0,
      qb_income_type: appt.billed_to === 'org' ? 'org_charge' : 'patient_charge',
      qb_class_name: appt.service_type || 'Uncategorized',
    });
    return { appointment_id: appt.id, patient_name: appt.patient_name, date: appt.appointment_date, amount: appt.total_amount, status: 'recovered_from_charge_search', charge_id: c.id, charge_date: new Date((c.created || 0) * 1000).toISOString(), net_cents: c.amount };
  } catch (e: any) {
    return { appointment_id: appt.id, patient_name: appt.patient_name, date: appt.appointment_date, amount: appt.total_amount, status: 'error', error: e?.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const isCronAuth = body?.cron_secret && body.cron_secret === Deno.env.get('CRON_SECRET');

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

    const days = Number(body?.days || 30);
    const explicitIds: string[] = Array.isArray(body?.appointment_ids) ? body.appointment_ids : [];

    // Resolve the appointment list to process
    let appts: ApptRow[] = [];
    if (explicitIds.length > 0) {
      const { data } = await admin
        .from('appointments')
        .select('id, patient_name, patient_email, appointment_date, service_type, total_amount, stripe_invoice_id, stripe_payment_intent_id, billed_to, organization_id')
        .in('id', explicitIds);
      appts = ((data as any[]) || []) as ApptRow[];
    } else {
      const { data: ids } = await admin.rpc('list_phantom_paid_appointments' as any, { p_days: days });
      const idList = (ids || []).map((r: any) => r.id);
      if (idList.length === 0) {
        return new Response(JSON.stringify({ ok: true, processed: 0, outcomes: [], message: 'No phantom-paid appointments in window.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data } = await admin
        .from('appointments')
        .select('id, patient_name, patient_email, appointment_date, service_type, total_amount, stripe_invoice_id, stripe_payment_intent_id, billed_to, organization_id')
        .in('id', idList);
      appts = ((data as any[]) || []) as ApptRow[];
    }

    const outcomes: Outcome[] = [];
    for (const appt of appts) {
      const already = await ensureNotAlreadyLogged(admin, appt.id);
      if (already) {
        outcomes.push({ appointment_id: appt.id, patient_name: appt.patient_name, date: appt.appointment_date, amount: appt.total_amount, status: 'already_logged' });
        continue;
      }
      if (appt.stripe_invoice_id) {
        outcomes.push(await recoverFromInvoice(admin, appt));
      } else {
        outcomes.push(await recoverFromChargeSearch(admin, appt));
      }
    }

    // Aggregate report
    const counts: Record<string, number> = {};
    let totalRecovered = 0;
    for (const o of outcomes) {
      counts[o.status] = (counts[o.status] || 0) + 1;
      if (o.status === 'recovered_from_invoice' || o.status === 'recovered_from_charge_search') {
        totalRecovered += o.net_cents || 0;
      }
    }
    return new Response(JSON.stringify({
      ok: true,
      processed: appts.length,
      counts,
      total_recovered_dollars: totalRecovered / 100,
      outcomes,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[reconcile-phantom-payments]', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error', stack: e?.stack }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
