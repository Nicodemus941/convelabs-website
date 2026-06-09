// create-reschedule-fee-checkout
//
// Token-based. Creates a $25 Stripe Checkout session for a late (<24h)
// reschedule. The move is NOT applied here — it's committed by stripe-webhook
// once the fee clears (metadata.kind = 'reschedule_fee'). This keeps "payment
// then reschedule" atomic: no payment, no move.
//
// Body: { token, date:'YYYY-MM-DD', time:'8:00 AM' }
// verify_jwt = false (the appointment view_token is the binding).

import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { isSlotStillAvailable } from '../_shared/availability.ts';
import { isActiveMember, hoursUntil, RESCHEDULE } from '../_shared/reschedule.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });
const ORIGIN = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

const NON_RESCHEDULABLE = new Set(['cancelled', 'en_route', 'arrived', 'in_progress', 'specimen_delivered', 'completed', 'no_show']);

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '');
    const date = String(body?.date || '').substring(0, 10);
    const time = String(body?.time || '').trim();
    if (!token) return j({ error: 'token_required' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return j({ error: 'date_and_time_required' }, 400);

    const { data: appt } = await admin
      .from('appointments')
      .select('id, view_token, patient_name, patient_email, patient_phone, appointment_date, appointment_time, status, organization_id, service_type')
      .eq('view_token', token)
      .maybeSingle();
    if (!appt) return j({ error: 'token_not_found' }, 404);

    if (NON_RESCHEDULABLE.has(String(appt.status))) return j({ error: 'not_reschedulable', status: appt.status }, 409);

    const h = hoursUntil(appt);
    if (isFinite(h) && h < RESCHEDULE.MIN_LEAD_HOURS) {
      return j({ error: 'too_close', call: '(941) 527-9169', lead_hours: RESCHEDULE.MIN_LEAD_HOURS }, 409);
    }
    // Only charge inside the fee window; ≥24h should never reach here.
    if (isFinite(h) && h >= RESCHEDULE.FEE_WINDOW_HOURS) return j({ error: 'no_fee_required' }, 400);
    // Members don't pay — they should have committed via the free path.
    if (await isActiveMember(admin, appt.patient_email)) return j({ error: 'member_waived' }, 400);

    // Re-verify the requested slot is still free before taking money.
    let timeWindowRules: any = null;
    if (appt.organization_id) {
      const { data: org } = await admin.from('organizations').select('time_window_rules').eq('id', appt.organization_id).maybeSingle();
      timeWindowRules = org?.time_window_rules ?? null;
    }
    const free = await isSlotStillAvailable(admin, appt.organization_id, date, time, timeWindowRules, appt.service_type);
    if (!free) return j({ error: 'slot_conflict' }, 409);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: RESCHEDULE.RESCHEDULE_FEE_CENTS,
          product_data: {
            name: 'Reschedule fee',
            description: `Move your visit to ${date} at ${time} (within ${RESCHEDULE.FEE_WINDOW_HOURS}h)`,
          },
        },
      }],
      metadata: {
        kind: 'reschedule_fee',
        appointment_id: appt.id,
        view_token: token,
        new_date: date,
        new_time: time,
      },
      success_url: `${ORIGIN}/appt/${token}/confirm?rescheduled=1`,
      cancel_url: `${ORIGIN}/appt/${token}/confirm?reschedule_canceled=1`,
    });

    return j({ ok: true, url: session.url, fee_cents: RESCHEDULE.RESCHEDULE_FEE_CENTS });
  } catch (e: any) {
    console.error('[create-reschedule-fee-checkout] error:', e?.message || e);
    return j({ error: e?.message || String(e) }, 500);
  }
});
