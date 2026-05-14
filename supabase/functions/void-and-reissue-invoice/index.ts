/**
 * VOID-AND-REISSUE-INVOICE
 *
 * Admin-fired one-shot: voids a bad Stripe invoice + resets the appointment
 * + companion family group so send-appointment-invoice can create a clean
 * replacement.
 *
 * Body: { stripe_invoice_id, appointment_id }
 */

import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { stripe_invoice_id, appointment_id } = await req.json();
    if (!stripe_invoice_id || !appointment_id) {
      return new Response(JSON.stringify({ error: 'stripe_invoice_id + appointment_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Look up the invoice on Stripe
    let inv: any;
    try {
      inv = await stripe.invoices.retrieve(stripe_invoice_id);
    } catch (e: any) {
      return new Response(JSON.stringify({ error: 'invoice_not_found', message: e?.message }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Void or mark uncollectible depending on current status
    let voidedStatus: string;
    if (inv.status === 'draft') {
      await stripe.invoices.del(stripe_invoice_id);
      voidedStatus = 'deleted_draft';
    } else if (inv.status === 'open') {
      await stripe.invoices.voidInvoice(stripe_invoice_id);
      voidedStatus = 'voided';
    } else if (inv.status === 'paid') {
      return new Response(JSON.stringify({ error: 'cannot_void_paid', message: 'Invoice already paid — issue a refund instead.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else if (inv.status === 'void' || inv.status === 'uncollectible') {
      voidedStatus = `already_${inv.status}`;
    } else {
      return new Response(JSON.stringify({ error: 'unsupported_status', invoice_status: inv.status }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Clear the primary appointment + all family-group companions
    const { data: primary } = await admin
      .from('appointments')
      .select('id, family_group_id')
      .eq('id', appointment_id)
      .maybeSingle();
    if (!primary) {
      return new Response(JSON.stringify({ error: 'appointment_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const familyGroupId = (primary as any).family_group_id || (primary as any).id;
    const idsToReset: string[] = [(primary as any).id];
    const { data: siblings } = await admin
      .from('appointments').select('id')
      .eq('family_group_id', familyGroupId)
      .neq('id', (primary as any).id);
    for (const s of ((siblings as any[]) || [])) idsToReset.push(s.id);

    await admin.from('appointments').update({
      stripe_invoice_id: null,
      invoice_status: 'pending_send',
      invoice_sent_at: null,
    }).in('id', idsToReset);

    return new Response(JSON.stringify({
      ok: true,
      voided: voidedStatus,
      invoice_id: stripe_invoice_id,
      cleared_appointment_ids: idsToReset,
      message: `Stripe invoice ${voidedStatus}. ${idsToReset.length} appointment row(s) cleared. Call send-appointment-invoice next.`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[void-and-reissue] uncaught:', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
