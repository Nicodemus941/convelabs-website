/**
 * ADD-COMPANION-WITH-INVOICE
 *
 * Admin/self-serve one-shot: takes a primary appointment_id + companion
 * details, creates the companion appointment row, links them via
 * family_group_id, AND fires an itemized Stripe Invoice for the companion's
 * charges (companion fee + optional specialty kit / extra line items).
 *
 * Body: {
 *   primaryAppointmentId,
 *   companion: {
 *     firstName, lastName, dateOfBirth?, phone?, email?, relationship?,
 *     serviceType?, serviceName?, specialtyKitCount?
 *   },
 *   lineItems?: Array<{ description: string, amountCents: number }>,
 *      // Itemized charges. If omitted, falls back to a single companionFeeCents line.
 *   companionFeeCents = 7500,         // used only when lineItems is absent
 *   billingEmail?, billingName?,      // bill someone other than the primary (e.g. a parent/payer)
 *   sendInvoice = true,               // create + finalize the Stripe invoice
 *   stripeAutoSend = true,            // also have Stripe email its hosted invoice
 * }
 *
 * Response: { ok, companionAppointmentId, invoiceId, hostedInvoiceUrl, totalCents, lineItems }
 *
 * verify_jwt=false (kept for backward-compat with existing admin UI callers).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

const fmtDate = (d: string) =>
  new Date(String(d).substring(0, 10) + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const ADMIN_ROLES = ['super_admin', 'office_manager', 'admin', 'owner'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Admin gate — this fn is verify_jwt=false at the gateway (so it can also
    // be reached by token-based self-serve later), so enforce staff-only here.
    // The admin UI invoke() passes the signed-in user's JWT automatically.
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    let authorized = false;
    if (token && token !== ANON_KEY) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
        authorized = (roles || []).some((r: any) => ADMIN_ROLES.includes(String(r.role)));
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: 'not_authorized', reason: 'staff role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      primaryAppointmentId,
      companion = {},
      lineItems: rawLineItems,
      companionFeeCents = 7500,
      billingEmail: billingEmailOverride,
      billingName: billingNameOverride,
      sendInvoice = true,
      stripeAutoSend = true,
    } = body || {};

    if (!primaryAppointmentId) {
      return new Response(JSON.stringify({ error: 'primaryAppointmentId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!companion?.firstName) {
      return new Response(JSON.stringify({ error: 'companion.firstName required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize line items. Default to a single companion-fee line.
    const lineItems: Array<{ description: string; amountCents: number }> =
      Array.isArray(rawLineItems) && rawLineItems.length > 0
        ? rawLineItems
            .map((li: any) => ({ description: String(li.description || 'Companion fee'), amountCents: Math.round(Number(li.amountCents) || 0) }))
            .filter((li) => li.amountCents > 0)
        : [{ description: 'Companion blood draw fee', amountCents: companionFeeCents }];
    const totalCents = lineItems.reduce((s, li) => s + li.amountCents, 0);

    const { data: primary } = await admin
      .from('appointments').select('*').eq('id', primaryAppointmentId).maybeSingle();
    if (!primary) {
      return new Response(JSON.stringify({ error: 'primary_appointment_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const companionFullName = `${String(companion.firstName).trim()} ${String(companion.lastName || '').trim()}`.trim();
    const relationship = companion.relationship || 'Companion';

    // 1) Ensure the primary anchors a family group (primary.id == family_group_id)
    if (!(primary as any).family_group_id) {
      await admin.from('appointments')
        .update({ family_group_id: primaryAppointmentId, companion_role: 'primary' })
        .eq('id', primaryAppointmentId);
    }

    // 2) Insert the companion appointment row.
    //    companion_role is the STRUCTURAL role ('companion') — the family-group
    //    queries + split RPC key off it. The human relationship ('Daughter')
    //    goes in notes. (Bug fix: previously companion_role was set to the
    //    relationship string, which broke sibling lookups.)
    const companionPhone = companion.phone ? String(companion.phone).replace(/\D/g, '') : null;
    const { data: compRow, error: insErr } = await admin.from('appointments').insert({
      patient_name: companionFullName,
      patient_email: companion.email || null,
      patient_phone: companionPhone,
      patient_dob: companion.dateOfBirth || null,
      appointment_date: (primary as any).appointment_date,
      appointment_time: (primary as any).appointment_time,
      address: (primary as any).address,
      zipcode: (primary as any).zipcode,
      gate_code: (primary as any).gate_code,
      service_type: companion.serviceType || (primary as any).service_type,
      service_name: companion.serviceName || (primary as any).service_name,
      service_price: totalCents / 100,
      tip_amount: 0,
      total_amount: totalCents / 100,
      specialty_kit_count: companion.specialtyKitCount || 1,
      duration_minutes: (primary as any).duration_minutes || 60,
      lab_destination: (primary as any).lab_destination,
      status: (primary as any).status === 'confirmed' ? 'confirmed' : 'scheduled',
      booking_source: 'admin_companion_addon',
      billed_to: (primary as any).billed_to || 'patient',
      organization_id: (primary as any).organization_id || null,
      family_group_id: primaryAppointmentId,
      companion_role: 'companion',
      payment_status: sendInvoice ? 'pending' : 'completed',
      notes: `Companion of ${(primary as any).patient_name || 'primary'} · rel: ${relationship}${companion.dateOfBirth ? ` · DOB ${companion.dateOfBirth}` : ''} · billed via family Stripe invoice`,
    }).select('id').single();

    if (insErr || !compRow) throw insErr || new Error('companion_insert_failed');
    const companionId = (compRow as any).id;

    // 3) Itemized Stripe invoice to the payer (override or the primary).
    let invoiceId: string | null = null;
    let hostedInvoiceUrl: string | null = null;
    const billingEmail = billingEmailOverride || (primary as any).patient_email;
    const billingName = billingNameOverride || (primary as any).patient_name;

    if (sendInvoice) {
      if (!billingEmail) {
        return new Response(JSON.stringify({
          ok: true, companionAppointmentId: companionId,
          warning: 'companion_added_no_invoice',
          reason: 'no billing email (primary has none and no billingEmail override) — cannot send Stripe Invoice',
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let customerId: string;
      const existing = await stripe.customers.list({ email: billingEmail, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const c = await stripe.customers.create({
          email: billingEmail, name: billingName,
          phone: (primary as any).patient_phone || undefined,
          metadata: { source: 'companion_addon' },
        });
        customerId = c.id;
      }

      const apptDateLabel = fmtDate((primary as any).appointment_date);
      // Create the empty invoice first, then attach each line item explicitly
      // (pending_invoice_items_behavior: 'exclude' would otherwise drop them).
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: 7,
        description: `Companion visit for ${companionFullName} — ${apptDateLabel}`,
        metadata: {
          primary_appointment_id: primaryAppointmentId,
          companion_appointment_id: companionId,
          source: 'companion_addon', type: 'companion_addon_invoice',
        },
        auto_advance: false,
        pending_invoice_items_behavior: 'exclude',
      });

      for (const li of lineItems) {
        await stripe.invoiceItems.create({
          customer: customerId,
          invoice: invoice.id,
          amount: li.amountCents,
          currency: 'usd',
          description: `${li.description} — ${companionFullName}`,
          metadata: { companion_appointment_id: companionId },
        });
      }

      const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
      hostedInvoiceUrl = finalized.hosted_invoice_url || null;
      invoiceId = finalized.id;
      if (stripeAutoSend) {
        const sent = await stripe.invoices.sendInvoice(finalized.id);
        hostedInvoiceUrl = sent.hosted_invoice_url || hostedInvoiceUrl;
      }

      await admin.from('appointments').update({
        stripe_invoice_id: invoiceId,
        notes: [(compRow as any).notes,
          `Invoice ${invoiceId} ($${(totalCents / 100).toFixed(2)}) sent to ${billingEmail}.`]
          .filter(Boolean).join(' '),
      }).eq('id', companionId);
    }

    return new Response(JSON.stringify({
      ok: true,
      primaryAppointmentId,
      companionAppointmentId: companionId,
      invoiceId,
      hostedInvoiceUrl,
      totalCents,
      lineItems,
      billedTo: billingEmail || null,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[add-companion-with-invoice] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e), code: e?.code, type: e?.type }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
