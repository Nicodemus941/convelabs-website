/**
 * PROCEED-TO-STRIPE-CHECKOUT
 *
 * Token-only. Called when the patient taps "Pay" on /pay/:token after
 * choosing a tip and accepting T&C.
 *
 * Security (non-negotiable):
 *   1. Server RECOMPUTES the amount due from the appointment row — never
 *      trusts a client-sent total.
 *   2. Tip is validated + capped: 0 ≤ tip ≤ min($500, 50% of subtotal).
 *   3. accept_tc must be true.
 *   4. Idempotent: a Stripe session created for this token in the last 15
 *      min is reused (prevents dupes on refresh / double-tap).
 *   5. Token must be active (not revoked / paid / expired).
 *
 * Body: { token, tip_cents, accept_tc:true }
 * → { ok, stripe_url }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

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
    if (!token) return json({ error: 'token_required' }, 400);
    if (!acceptTc) return json({ error: 'terms_required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tok } = await admin
      .from('appointment_pay_tokens')
      .select('id, appointment_id, expires_at, revoked_at, paid_at, last_stripe_session_id, last_session_created_at')
      .eq('access_token', token)
      .maybeSingle();
    if (!tok) return json({ error: 'token_not_found' }, 404);
    if (tok.revoked_at) return json({ error: 'voided' }, 410);
    if (tok.paid_at) return json({ error: 'already_paid' }, 409);
    if (new Date(tok.expires_at) < new Date()) return json({ error: 'expired' }, 410);

    const { data: a } = await admin
      .from('appointments')
      .select('id, patient_name, patient_email, total_amount, tip_amount, payment_status, status, service_name, service_type')
      .eq('id', tok.appointment_id)
      .maybeSingle();
    if (!a) return json({ error: 'appointment_not_found' }, 404);
    if (['completed', 'paid'].includes(String(a.payment_status))) return json({ error: 'already_paid' }, 409);
    if (['cancelled', 'no_show'].includes(String(a.status))) return json({ error: 'voided' }, 410);

    // (1) Server-side recompute of the pre-tip amount due.
    const subtotalCents = Math.max(0, Math.round((Number(a.total_amount || 0) - Number(a.tip_amount || 0)) * 100));
    if (subtotalCents <= 0) return json({ error: 'nothing_due' }, 409);

    // (2) Validate + cap the tip. Reject negatives / NaN; clamp to policy.
    let tipCents = Number.isFinite(tipCentsRaw) ? Math.round(tipCentsRaw) : 0;
    if (tipCents < 0) return json({ error: 'invalid_tip' }, 400);
    const tipCap = Math.min(TIP_HARD_CAP_CENTS, Math.round(subtotalCents * 0.5));
    if (tipCents > tipCap) return json({ error: 'tip_too_large', max_tip_cents: tipCap }, 400);

    const totalCents = subtotalCents + tipCents;

    // (4) Idempotency: reuse a recent live session for this token.
    if (tok.last_stripe_session_id && tok.last_session_created_at &&
        (Date.now() - new Date(tok.last_session_created_at).getTime()) < SESSION_REUSE_WINDOW_MS) {
      try {
        const prior = await stripe.checkout.sessions.retrieve(tok.last_stripe_session_id);
        // Only reuse if it's still open AND the amount matches this request.
        if (prior && prior.status === 'open' && prior.amount_total === totalCents && prior.url) {
          return json({ ok: true, stripe_url: prior.url, reused: true });
        }
      } catch { /* fall through to create a fresh session */ }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: a.patient_email || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: a.service_name || a.service_type || 'Mobile Blood Draw' },
          unit_amount: totalCents,
        },
        quantity: 1,
      }],
      payment_method_types: ['card', 'us_bank_account'],
      success_url: `${SITE}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/pay/${token}`,
      metadata: {
        appointment_id: a.id,
        tip_cents: String(tipCents),
        subtotal_cents: String(subtotalCents),
        source: 'branded_checkout_v1',
        pay_token: token,
      },
    });

    await admin.from('appointment_pay_tokens').update({
      last_stripe_session_id: session.id,
      last_session_created_at: new Date().toISOString(),
      selected_tip_cents: tipCents,
      accepted_tc_at: new Date().toISOString(),
    }).eq('id', tok.id);

    return json({ ok: true, stripe_url: session.url });
  } catch (e: any) {
    console.error('[proceed-to-stripe-checkout] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
