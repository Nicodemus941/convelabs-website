/**
 * CHARGE-PROVIDER-ON-DELIVERY (2026-09-22)
 *
 * The practice's saved card is charged when the work is actually done: the
 * specimens have been collected AND delivered to the lab. Not at booking.
 *
 * Why this replaces charge-at-booking:
 *   - Booking is only one of the ways a visit starts. Six Elite draws in
 *     Aug/Sep were booked by staff rather than by the patient's link, so
 *     schedule-lab-request never ran and the card was never even attempted
 *     (provider_charge_attempted_at was null on all six).
 *   - Delivery happens on every path, whoever booked it, so this is the one
 *     place that catches them all.
 *   - A practice is charged for a draw that happened, never for a no-show.
 *
 * Each lab request is charged for ITS OWN draw. A household saves one card on
 * the anchor row but each member is drawn (and delivered) separately, so each
 * sibling settles on its own delivery at the per-draw price.
 *
 * Idempotent three ways: only a row still sitting at 'card_on_file' is
 * charged, the row is flipped inside the same call, and Stripe gets an
 * idempotency key derived from the lab request id.
 *
 * Body: { appointment_id }
 * Invoked by the on_appointment_specimen_delivered trigger.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { renderEmail, okBlock, badBlock, paragraph, BRAND } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });
const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'convelabs.com';
const OWNER_EMAIL = 'info@convelabs.com';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sendMail(to: string, subject: string, html: string) {
  if (!MAILGUN_API_KEY || !to) return;
  const form = new FormData();
  form.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
  form.append('to', to);
  form.append('subject', subject);
  form.append('html', html);
  await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: form,
  }).catch((e) => console.error('[charge-on-delivery] mail failed:', e));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const appointmentId = body.appointment_id || body.appointmentId;
    if (!appointmentId) return json({ error: 'appointment_id required' }, 400);

    const { data: appt } = await admin
      .from('appointments')
      .select('id, organization_id, lab_request_id, patient_name, billed_to, specimens_delivered_at, appointment_date')
      .eq('id', appointmentId)
      .maybeSingle();
    if (!appt) return json({ skipped: 'appointment_not_found' });
    if (!appt.specimens_delivered_at) return json({ skipped: 'not_delivered_yet' });
    // The patient's own visit is paid by the patient, at booking.
    if (appt.billed_to !== 'org') return json({ skipped: 'not_org_billed' });

    // The request behind this visit. Lab-request bookings carry the link;
    // staff-booked visits are matched on the practice + patient instead.
    let request: Record<string, unknown> | null = null;
    const COLS = 'id, household_group_id, patient_name, provider_payment_status, provider_payment_cents, provider_stripe_customer_id, provider_stripe_payment_method_id, organization_id';
    if (appt.lab_request_id) {
      request = (await admin.from('patient_lab_requests').select(COLS).eq('id', appt.lab_request_id).maybeSingle()).data;
    }
    if (!request) {
      request = (await admin.from('patient_lab_requests').select(COLS)
        .eq('appointment_id', appointmentId).maybeSingle()).data;
    }
    if (!request) return json({ skipped: 'no_lab_request' });
    if (request.provider_payment_status !== 'card_on_file') {
      // Already settled, never had a card, or a charge is recorded against it.
      return json({ skipped: `status_${request.provider_payment_status}` });
    }

    // The card lives on the anchor of a household; a solo request is its own.
    const anchorId = (request.household_group_id as string) || (request.id as string);
    const anchor = anchorId === request.id
      ? request
      : (await admin.from('patient_lab_requests').select(COLS).eq('id', anchorId).maybeSingle()).data;
    if (!anchor) return json({ skipped: 'no_anchor' });

    const customerId = anchor.provider_stripe_customer_id as string | null;
    const pmId = anchor.provider_stripe_payment_method_id as string | null;

    // What this ONE draw costs. The anchor holds the household's combined
    // amount, so divide it by the group; a solo request already is per-draw.
    let cents = Number(request.provider_payment_cents || 0);
    if (!cents || request.household_group_id) {
      const { count } = await admin.from('patient_lab_requests')
        .select('id', { count: 'exact', head: true })
        .eq('household_group_id', anchorId);
      const members = Math.max(1, count || 1);
      cents = Math.round(Number(anchor.provider_payment_cents || 0) / members);
    }

    if (!cents || !customerId || !pmId) {
      console.warn(`[charge-on-delivery] ${request.id}: nothing to charge (cents=${cents} cust=${!!customerId} pm=${!!pmId})`);
      return json({ skipped: 'no_card_or_amount' });
    }

    const { data: org } = await admin.from('organizations')
      .select('id, name, billing_email, contact_email')
      .eq('id', appt.organization_id).maybeSingle();

    try {
      const pi = await stripe.paymentIntents.create({
        amount: cents,
        currency: 'usd',
        customer: customerId,
        payment_method: pmId,
        off_session: true,
        confirm: true,
        description: `Mobile Blood Draw — ${request.patient_name || appt.patient_name} (covered by ${org?.name || 'the practice'}, charged on delivery to the lab)`,
        metadata: {
          lab_request_id: String(request.id),
          appointment_id: String(appt.id),
          organization_id: String(appt.organization_id || ''),
          convelabs_flow: 'lab_request_charge_on_delivery',
        },
      }, { idempotencyKey: `ldel_${request.id}` });

      await admin.from('patient_lab_requests').update({
        provider_payment_status: 'completed',
        provider_paid_at: new Date().toISOString(),
        provider_stripe_payment_intent_id: pi.id,
        provider_charge_attempted_at: new Date().toISOString(),
        provider_charge_error: null,
      }).eq('id', request.id);

      console.log(`[charge-on-delivery] charged ${cents}c for ${request.id} (pi ${pi.id})`);
      return json({ charged: true, cents, payment_intent: pi.id });
    } catch (err) {
      const message = String((err as Error)?.message || err).slice(0, 500);
      console.error(`[charge-on-delivery] DECLINED ${request.id}: ${message}`);
      await admin.from('patient_lab_requests').update({
        provider_payment_status: 'charge_failed',
        provider_charge_attempted_at: new Date().toISOString(),
        provider_charge_error: message,
      }).eq('id', request.id);

      // The draw is done and the specimens are at the lab; this is a billing
      // matter between us and the practice, never the patient's problem.
      const amount = `$${(cents / 100).toFixed(2)}`;
      const who = String(request.patient_name || appt.patient_name || 'a patient');
      const practiceEmail = (org?.billing_email || org?.contact_email) as string | undefined;
      if (practiceEmail) {
        await sendMail(practiceEmail, `Card declined for ${who}'s draw — ${amount} due`, renderEmail({
          eyebrow: 'Action needed · Billing',
          headline: `We couldn't charge the card on file`,
          greeting: 'Hi,',
          bodyHtml: [
            okBlock('✓ The draw is done', `${who}'s specimens were collected and delivered to the lab. Results are on their way as normal.`),
            paragraph('We tried the card you have on file for this draw and it did not go through:'),
            badBlock(`<strong>${amount} now due</strong> · Reason: ${message}`),
            paragraph(`<span style="color:${BRAND.muted};font-size:13px;">Reply to this email and we'll send a payment link, or call ${BRAND.phone}.</span>`),
          ].join(''),
        }));
      }
      await sendMail(OWNER_EMAIL, `[ConveLabs] Card declined on delivery — ${org?.name || 'practice'} ${amount}`, renderEmail({
        eyebrow: 'Billing',
        headline: `${org?.name || 'A practice'}: card declined on delivery`,
        greeting: 'Heads up Nico,',
        bodyHtml: [
          paragraph(`${who}'s draw was delivered to the lab and the saved card declined.`),
          badBlock(`<strong>${amount}</strong> · ${message}`),
          paragraph(`Lab request ${String(request.id)}`),
        ].join(''),
      }));
      return json({ charged: false, error: message }, 200);
    }
  } catch (err) {
    console.error('[charge-on-delivery] failed:', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
