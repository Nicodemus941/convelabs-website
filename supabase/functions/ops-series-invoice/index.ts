/**
 * OPS-SERIES-INVOICE (2026-07-13, Lawrence Carpenter / Wellworth Advisors)
 *
 * One-off ops tool: VOID a previously-sent appointment invoice and REISSUE a
 * single Stripe invoice covering an entire recurring series (all appointments
 * in a recurrence_group), then stamp every appointment in the group with the
 * new invoice id/url. Secret-gated (ANNOUNCE_SECRET) — not a user endpoint.
 *
 * Body: {
 *   secret,
 *   void_invoice_id,          // existing Stripe invoice to void
 *   recurrence_group_id,      // series whose visits the new invoice covers
 *   description,              // line-item description
 *   memo?                     // invoice footer/description text
 * }
 * The amount is derived from the group's rows (sum of total_amount) — never
 * from a hand-typed number, so the invoice always matches the calendar.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });
const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const expected = Deno.env.get('ANNOUNCE_SECRET') || '';
    if (!expected || body.secret !== expected) return json({ error: 'forbidden' }, 403);
    const { void_invoice_id, recurrence_group_id, description, memo } = body;
    if (!void_invoice_id || !recurrence_group_id || !description) {
      return json({ error: 'void_invoice_id, recurrence_group_id, description required' }, 400);
    }

    // 1. Load the series — amount comes from the rows, not the caller.
    const { data: appts, error: apErr } = await admin.from('appointments')
      .select('id, appointment_date, appointment_time, patient_name, patient_email, total_amount, status')
      .eq('recurrence_group_id', recurrence_group_id)
      .neq('status', 'cancelled')
      .order('appointment_date');
    if (apErr) return json({ error: apErr.message }, 500);
    if (!appts || appts.length === 0) return json({ error: 'no appointments in group' }, 404);
    const totalCents = appts.reduce((s, a) => s + Math.round(Number(a.total_amount || 0) * 100), 0);
    const perVisitCents = Math.round(Number(appts[0].total_amount || 0) * 100);
    const toEmail = appts[0].patient_email;
    if (!toEmail || totalCents <= 0) return json({ error: 'missing email or zero total' }, 400);

    // 2. Void the old invoice (only 'open' invoices can be voided; a draft
    //    gets deleted; paid/void states are surfaced, not forced).
    const oldInv = await stripe.invoices.retrieve(void_invoice_id);
    let voided = oldInv.status as string;
    if (oldInv.status === 'open') {
      await stripe.invoices.voidInvoice(void_invoice_id);
      voided = 'voided';
    } else if (oldInv.status === 'draft') {
      await stripe.invoices.del(void_invoice_id);
      voided = 'deleted_draft';
    } else if (oldInv.status === 'paid') {
      return json({ error: 'old_invoice_already_paid — refund instead of void', status: oldInv.status }, 409);
    }

    // 3. Reuse the same Stripe customer the old invoice billed.
    const customerId = typeof oldInv.customer === 'string' ? oldInv.customer : (oldInv.customer as any)?.id;
    if (!customerId) return json({ error: 'old invoice has no customer' }, 500);

    // 4. New invoice: one line, qty = visits, unit = per-visit price.
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 30,
      auto_advance: false,
      description: memo || undefined,
      metadata: {
        convelabs_flow: 'recurring_series_invoice',
        recurrence_group_id,
        appointment_id: appts[0].id, // primary anchor for the webhook/reconciler
        visits: String(appts.length),
        replaces_invoice: void_invoice_id,
      },
    });
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      quantity: appts.length,
      unit_amount: perVisitCents,
      currency: 'usd',
      description,
    });
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(invoice.id); // Stripe emails the hosted invoice

    // 5. Stamp every visit in the series with the new invoice.
    const { error: upErr } = await admin.from('appointments').update({
      stripe_invoice_id: invoice.id,
      stripe_invoice_url: finalized.hosted_invoice_url || null,
      invoice_status: 'sent',
    }).eq('recurrence_group_id', recurrence_group_id).neq('status', 'cancelled');
    if (upErr) console.error('[ops-series-invoice] stamp failed:', upErr.message);

    return json({
      ok: true,
      old_invoice: { id: void_invoice_id, result: voided },
      new_invoice: { id: invoice.id, total_cents: totalCents, visits: appts.length, url: finalized.hosted_invoice_url, sent_to: toEmail },
      stamped: !upErr,
    });
  } catch (e: any) {
    console.error('[ops-series-invoice] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
