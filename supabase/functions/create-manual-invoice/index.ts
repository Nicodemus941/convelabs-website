import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

/**
 * CREATE-MANUAL-INVOICE
 *
 * Ad-hoc supplemental Stripe invoice to a PATIENT (by email), independent of
 * any appointment's own invoice state — for things like "2 additional
 * specialty kits @ $75" on top of an already-paid visit.
 *
 * Secured by an internal shared secret (MANUAL_INVOICE_SECRET) in the
 * `x-manual-invoice-secret` header — NOT a public endpoint, so a bot with the
 * anon key can't mint ConveLabs-branded invoices to arbitrary addresses.
 *
 * Body: {
 *   email: string, name?: string, phone?: string,
 *   lineItems: [{ description: string, amountCents: number }],  // >= 50 cents each
 *   memo?: string, appointmentId?: string, daysUntilDue?: number
 * }
 *
 * Patient-customer keying mirrors send-appointment-invoice: one Stripe
 * customer per patient email, never an org customer. No transfer_data is
 * attached (whole amount to the business); phleb comp is handled separately.
 */

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-manual-invoice-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── AUTH: internal shared secret only ──────────────────────────────
  const expected = Deno.env.get('MANUAL_INVOICE_SECRET') || '';
  const provided = req.headers.get('x-manual-invoice-secret') || '';
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { email, name, phone, lineItems, memo, appointmentId, daysUntilDue } = body || {};

    if (!email || !Array.isArray(lineItems) || lineItems.length === 0) {
      return new Response(JSON.stringify({ error: 'email and non-empty lineItems are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const normEmail = String(email).trim().toLowerCase();

    // ── Patient Stripe customer (isolated from org customers) ──
    const existing = await stripe.customers.list({ email: normEmail, limit: 5 });
    const patientCustomer = existing.data.find((c) => !(c.metadata?.convelabs_org_id)) || null;
    let customerId: string;
    if (patientCustomer) {
      customerId = patientCustomer.id;
    } else {
      const customer = await stripe.customers.create({
        email: normEmail,
        name: name || undefined,
        phone: phone || undefined,
        metadata: { source: 'manual_invoice', appointment_id: appointmentId || '' },
      });
      customerId = customer.id;
    }

    // ── Invoice ──
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: typeof daysUntilDue === 'number' ? daysUntilDue : 3,
      description: memo || 'ConveLabs — additional charges',
      metadata: { source: 'manual_invoice', appointment_id: appointmentId || '' },
    });

    let totalCents = 0;
    for (const li of lineItems) {
      const cents = Math.round(Number(li?.amountCents ?? 0));
      if (!Number.isFinite(cents) || cents < 50) continue; // Stripe min line item
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: cents,
        currency: 'usd',
        description: String(li?.description || 'Item').substring(0, 250),
      });
      totalCents += cents;
    }

    if (totalCents < 50) {
      // nothing valid to bill — clean up the empty draft
      try { await stripe.invoices.del(invoice.id); } catch { /* noop */ }
      return new Response(JSON.stringify({ error: 'no valid line items (each must be >= 50 cents)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(invoice.id);

    // Best-effort audit note on the appointment (does NOT touch its own
    // stripe_invoice_id / invoice_status — this is a separate charge).
    if (appointmentId) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: appt } = await supabase.from('appointments').select('notes').eq('id', appointmentId).maybeSingle();
        const note = `[MANUAL INVOICE ${invoice.id} — $${(totalCents / 100).toFixed(2)} — ${memo || 'additional charges'} — ${new Date().toISOString()}]`;
        await supabase.from('appointments')
          .update({ notes: `${(appt as any)?.notes || ''}\n${note}`.trim().substring(0, 2000) })
          .eq('id', appointmentId);
      } catch (noteErr) {
        console.warn('[manual-invoice] appointment note failed (non-blocking):', noteErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      invoiceId: invoice.id,
      invoiceUrl: finalized.hosted_invoice_url,
      amountCents: totalCents,
      recipient: normEmail,
      customerId,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[manual-invoice] error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
