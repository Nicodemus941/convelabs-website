// ADJUST-INVOICE-SPLIT (admin one-off / reusable)
//
// Re-routes the phleb-vs-business split on an UNPAID appointment invoice.
// Owner rule (Morelli $800, 2026-06-15): phleb gets `phlebPercent`% of the
// invoice total, business keeps the rest. The original invoice was created by
// send-appointment-invoice with the per-visit base-rate split (e.g. $63 on an
// $800 visit); this lets us override to an explicit percentage.
//
// Strategy (least-disruptive first):
//   1. paid           → supplemental stripe.transfers.create for the shortfall
//                       (source_transaction = the invoice's charge).
//   2. open + has PI  → update the PaymentIntent's transfer_data.amount in
//                       place (NO new email to the patient).
//   3. fallback       → void the invoice + reissue an identical one with the
//                       correct transfer_data.amount (patient gets a fresh
//                       email; the old hosted link shows "voided").
//
// Body: { appointmentId: string, phlebPercent?: number }  (default 60)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { appointmentId, phlebPercent = 60 } = await req.json();
    if (!appointmentId) return json({ error: 'appointmentId required' }, 400);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: appt } = await supabase
      .from('appointments')
      .select('id, stripe_invoice_id, total_amount, patient_name, patient_email, service_type, appointment_date, appointment_time, address')
      .eq('id', appointmentId)
      .maybeSingle();
    if (!appt || !(appt as any).stripe_invoice_id) return json({ error: 'no invoice on appointment' }, 400);

    const { data: connected } = await supabase
      .from('staff_profiles')
      .select('stripe_connect_account_id')
      .not('stripe_connect_account_id', 'is', null)
      .eq('stripe_connect_charges_enabled', true)
      .eq('stripe_connect_payouts_enabled', true)
      .limit(1);
    const destination = (connected || [])[0]?.stripe_connect_account_id as string | undefined;
    if (!destination) return json({ error: 'no connected phleb account' }, 400);

    const invoiceId = (appt as any).stripe_invoice_id as string;
    const totalCents = Math.round(Number((appt as any).total_amount || 0) * 100);
    const phlebCents = Math.round((totalCents * Number(phlebPercent)) / 100);

    const inv = await stripe.invoices.retrieve(invoiceId, { expand: ['payment_intent'] });

    // 1) Already paid → supplemental transfer for the shortfall.
    if (inv.status === 'paid') {
      const already = (inv as any).transfer_data?.amount || 0;
      const diff = phlebCents - already;
      const chargeId = typeof (inv as any).charge === 'string' ? (inv as any).charge : (inv as any).charge?.id;
      if (diff > 0 && chargeId) {
        const tr = await stripe.transfers.create({
          amount: diff, currency: 'usd', destination,
          source_transaction: chargeId,
          description: `Phleb split top-up to ${phlebPercent}% for appt ${appointmentId}`,
          metadata: { appointment_id: appointmentId, reason: 'split_topup' },
        });
        return json({ ok: true, mode: 'supplemental_transfer', transferId: tr.id, addedCents: diff, targetPhlebCents: phlebCents });
      }
      return json({ ok: true, mode: 'paid_no_action_needed', alreadyCents: already });
    }

    // 2) Open with a PaymentIntent → try updating transfer_data.amount in place.
    const pi = (inv as any).payment_intent;
    const piId = typeof pi === 'string' ? pi : pi?.id;
    if (piId) {
      try {
        await stripe.paymentIntents.update(piId, { transfer_data: { amount: phlebCents } } as any);
        return json({ ok: true, mode: 'payment_intent_updated', invoiceId, paymentIntent: piId, phlebCents });
      } catch (e) {
        console.warn('[adjust-split] PI transfer_data update failed, will void+reissue:', (e as Error).message);
      }
    }

    // 3) Fallback: void + reissue identical invoice with correct transfer_data.
    const customerId = typeof inv.customer === 'string' ? inv.customer : (inv.customer as any)?.id;
    if (inv.status === 'open' || inv.status === 'uncollectible') {
      await stripe.invoices.voidInvoice(invoiceId);
    } else if (inv.status === 'draft') {
      await stripe.invoices.del(invoiceId);
    }
    const newInv = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 0,
      description: `ConveLabs Appointment — ${(appt as any).patient_name}`,
      transfer_data: { destination, amount: phlebCents },
      metadata: { appointment_id: appointmentId, reissued_for_split: 'true', phleb_percent: String(phlebPercent) },
    });
    await stripe.invoiceItems.create({
      customer: customerId, invoice: newInv.id, amount: totalCents, currency: 'usd',
      description: `${(appt as any).service_type || 'Mobile Blood Draw'} — ${(appt as any).patient_name} — ${(appt as any).appointment_date || ''}${(appt as any).appointment_time ? ` at ${(appt as any).appointment_time}` : ''}`,
    });
    const finalized = await stripe.invoices.finalizeInvoice(newInv.id);
    await stripe.invoices.sendInvoice(newInv.id);
    await supabase.from('appointments').update({
      stripe_invoice_id: newInv.id,
      stripe_invoice_url: finalized.hosted_invoice_url || null,
      invoice_status: 'sent',
      invoice_sent_at: new Date().toISOString(),
    }).eq('id', appointmentId);

    return json({ ok: true, mode: 'voided_and_reissued', oldInvoice: invoiceId, newInvoice: newInv.id, phlebCents, hosted: finalized.hosted_invoice_url });
  } catch (e) {
    console.error('[adjust-invoice-split] error:', e);
    return json({ error: (e as Error).message }, 500);
  }
});
