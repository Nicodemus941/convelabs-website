/**
 * PROCEED-TO-STRIPE-CHECKOUT
 *
 * Token-only. Called when the patient taps "Pay" on /pay/:token after
 * choosing a tip and accepting T&C.
 *
 * Security (non-negotiable):
 *   1. Server RECOMPUTES the amount due (shared resolveAmountDue — same
 *      number the page displayed; cross-checked with the open Stripe
 *      invoice). Never trusts a client-sent total.
 *   2. Tip is validated + capped: 0 ≤ tip ≤ min($500, 50% of subtotal).
 *   3. accept_tc must be true.
 *   4. Idempotent: a Stripe session created for this token in the last 15
 *      min with the same total is reused (prevents dupes on refresh).
 *   5. Token must be active (not revoked / paid / expired).
 *
 * The Checkout session carries metadata the webhook uses to settle EVERY
 * appointment row on the bill and to reconcile the open Stripe invoice
 * (paid out-of-band) so the old hosted link can't be paid twice.
 *
 * Body: { token, tip_cents, accept_tc:true, embedded?:true }
 * → { ok, client_secret }  (embedded)  |  { ok, stripe_url }  (redirect)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { resolveAmountDue } from '../_shared/pay-amount.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

const TIP_HARD_CAP_CENTS = 50000; // $500
const SESSION_REUSE_WINDOW_MS = 15 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const token: string = body?.token || '';
    const tipCentsRaw = Number(body?.tip_cents);
    const acceptTc = body?.accept_tc === true;
    const embedded = body?.embedded === true;
    if (!token) return json({ error: 'token_required' }, 400);
    if (!acceptTc) return json({ error: 'terms_required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tok } = await admin
      .from('appointment_pay_tokens')
      .select('id, appointment_id, expires_at, revoked_at, paid_at, last_stripe_session_id, last_session_created_at')
      .eq('access_token', token)
      .maybeSingle();
    if (!tok) return json({ error: 'token_not_found' }, 404);
    if (tok.paid_at) return json({ error: 'already_paid' }, 409);
    if (tok.revoked_at) return json({ error: 'voided' }, 410);
    if (new Date(tok.expires_at) < new Date()) return json({ error: 'expired' }, 410);

    const { data: a } = await admin
      .from('appointments')
      .select('id, patient_name, patient_email, total_amount, tip_amount, payment_status, status, service_name, service_type, stripe_invoice_id, billed_to, organization_id, phlebotomist_id')
      .eq('id', tok.appointment_id)
      .maybeSingle();
    if (!a) return json({ error: 'appointment_not_found' }, 404);
    if (['completed', 'paid', 'succeeded'].includes(String(a.payment_status))) return json({ error: 'already_paid' }, 409);
    if (['cancelled', 'no_show'].includes(String(a.status))) return json({ error: 'voided' }, 410);

    // (1) Server-side recompute of the pre-tip amount due (whole bill).
    const due = await resolveAmountDue(admin, stripe, a);
    if (due.status === 'paid') return json({ error: 'already_paid' }, 409);
    if (due.status === 'voided') return json({ error: 'voided' }, 410);
    const subtotalCents = due.subtotal_cents;
    if (subtotalCents <= 0) return json({ error: 'nothing_due' }, 409);

    // (2) Validate + cap the tip.
    let tipCents = Number.isFinite(tipCentsRaw) ? Math.round(tipCentsRaw) : 0;
    if (tipCents < 0) return json({ error: 'invalid_tip' }, 400);
    const tipCap = Math.min(TIP_HARD_CAP_CENTS, Math.round(subtotalCents * 0.5));
    if (tipCents > tipCap) return json({ error: 'tip_too_large', max_tip_cents: tipCap }, 400);

    const totalCents = subtotalCents + tipCents;

    // (4) Idempotency: reuse a recent live session with the same total.
    if (tok.last_stripe_session_id && tok.last_session_created_at &&
        (Date.now() - new Date(tok.last_session_created_at).getTime()) < SESSION_REUSE_WINDOW_MS) {
      try {
        const prior = await stripe.checkout.sessions.retrieve(tok.last_stripe_session_id);
        if (prior && prior.status === 'open' && prior.amount_total === totalCents) {
          if (embedded && (prior as any).client_secret) return json({ ok: true, client_secret: (prior as any).client_secret, reused: true });
          if (!embedded && prior.url) return json({ ok: true, stripe_url: prior.url, reused: true });
        }
        // Different total (tip changed) → expire the stale session so it can
        // never be completed at the old amount from a second tab.
        if (prior && prior.status === 'open') {
          try { await stripe.checkout.sessions.expire(prior.id); } catch { /* best effort */ }
        }
      } catch { /* fall through to create a fresh session */ }
    }

    const serviceLabel = a.service_name || a.service_type || 'Mobile Blood Draw';
    const lineItems: any[] = [{
      price_data: { currency: 'usd', product_data: { name: due.lines.length > 1 ? `ConveLabs visit (${due.lines.length} patients)` : serviceLabel }, unit_amount: subtotalCents },
      quantity: 1,
    }];
    if (tipCents > 0) {
      lineItems.push({
        price_data: { currency: 'usd', product_data: { name: 'Tip for your phlebotomist (100% goes to them)' }, unit_amount: tipCents },
        quantity: 1,
      });
    }

    const sharedParams: any = {
      mode: 'payment',
      customer_email: a.patient_email || undefined,
      line_items: lineItems,
      // Stripe emails the card receipt to the payer (dashboard setting
      // "Successful payments" must be on). We also show the summary on-page.
      payment_intent_data: {
        description: `ConveLabs — ${serviceLabel} — ${String(a.patient_name || '').split(' ')[0]}`,
        metadata: { appointment_id: a.id, source: 'branded_checkout_v1', tip_cents: String(tipCents) },
      },
      metadata: {
        appointment_id: a.id,
        appointment_ids: due.appointment_ids.join(','),
        stripe_invoice_id: due.stripe_invoice_id || '',
        tip_cents: String(tipCents),
        subtotal_cents: String(subtotalCents),
        source: 'branded_checkout_v1',
        pay_token: token,
      },
    };

    let session: any;
    if (embedded) {
      // On-page Embedded Checkout — card entry stays on convelabs.com. Apple
      // Pay / Google Pay / Link show automatically when the domain is
      // registered in the Stripe dashboard. us_bank_account needs a
      // redirect, so embedded is card-only.
      session = await stripe.checkout.sessions.create({
        ...sharedParams,
        ui_mode: 'embedded',
        redirect_on_completion: 'never',
        payment_method_types: ['card'],
      });
    } else {
      session = await stripe.checkout.sessions.create({
        ...sharedParams,
        payment_method_types: ['card', 'us_bank_account'],
        success_url: `${SITE}/pay/${token}?paid=1`,
        cancel_url: `${SITE}/pay/${token}`,
      });
    }

    await admin.from('appointment_pay_tokens').update({
      last_stripe_session_id: session.id,
      last_session_created_at: new Date().toISOString(),
      selected_tip_cents: tipCents,
      accepted_tc_at: new Date().toISOString(),
    }).eq('id', tok.id);

    return embedded
      ? json({ ok: true, client_secret: session.client_secret, total_cents: totalCents })
      : json({ ok: true, stripe_url: session.url, total_cents: totalCents });
  } catch (e: any) {
    console.error('[proceed-to-stripe-checkout] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
