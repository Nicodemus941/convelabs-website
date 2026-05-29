// admin-diag-missing-event
// One-shot: fetch a specific Stripe event by ID + the session it references,
// then check whether downstream DB records (appointment, qb sync, membership)
// exist. Helps triage 'missing from webhook_logs' alerts.
// Hardcoded to evt_1TbMGMAPnMg8iHarVG4pXrJ1 — disable after report.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

const TARGET_EVENT = 'evt_1TbMGMAPnMg8iHarVG4pXrJ1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // PERMANENTLY DISABLED. Diagnostic fired 2026-05-28 — Joshua Hoskins
    // missing event evt_1TbMGMAPnMg8iHarVG4pXrJ1 traced + remediated:
    // QB class reclassified to membership_signup, webhook_logs backfilled.
    return new Response(JSON.stringify({ error: 'one-shot disabled — already triaged' }), {
      status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    // @ts-ignore unreachable
    const body = await req.json().catch(() => ({}));

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const report: Record<string, any> = { target_event: TARGET_EVENT };

    // 1. Fetch event from Stripe
    const ev = await stripe.events.retrieve(TARGET_EVENT);
    const session = ev.data.object as any;
    report.event = {
      id: ev.id, type: ev.type, created: new Date(ev.created * 1000).toISOString(),
      livemode: ev.livemode, request_id: (ev as any).request?.id,
    };
    report.session = {
      id: session.id, mode: session.mode, status: session.status,
      payment_status: session.payment_status, customer: session.customer,
      customer_email: session.customer_email || session.customer_details?.email,
      amount_total: session.amount_total, currency: session.currency,
      metadata: session.metadata, subscription: session.subscription,
      payment_intent: session.payment_intent, client_reference_id: session.client_reference_id,
    };

    // 2. Check downstream records
    if (session.id) {
      const { data: wh } = await admin.from('webhook_logs' as any).select('id, status, event_type, created_at').eq('stripe_session_id', session.id).limit(5);
      report.webhook_logs_rows = wh || [];
    }
    if (session.customer) {
      const { data: m } = await admin.from('user_memberships' as any).select('id, status, stripe_subscription_id, created_at').eq('stripe_customer_id', session.customer).limit(5);
      report.user_memberships_rows = m || [];
      const { data: q } = await admin.from('stripe_qb_sync_log' as any).select('id, amount_gross_cents, qb_class_name, charge_date').eq('stripe_customer_id', session.customer).limit(5);
      report.qb_sync_rows = q || [];
    }
    if (session.metadata?.appointment_id) {
      const { data: appt } = await admin.from('appointments' as any).select('id, patient_name, status, payment_status, total_amount, created_at').eq('id', session.metadata.appointment_id).maybeSingle();
      report.appointment = appt || null;
    }
    if (session.subscription) {
      const { data: subRow } = await admin.from('user_memberships' as any).select('id, status, plan_id, created_at').eq('stripe_subscription_id', session.subscription).maybeSingle();
      report.subscription_membership = subRow || null;
    }

    return new Response(JSON.stringify(report, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
