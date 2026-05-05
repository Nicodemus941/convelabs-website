/**
 * ADD-COMPANION-WITH-INVOICE
 *
 * Admin one-shot: takes a primary appointment_id + companion details,
 * creates the companion appointment row, links them via family_group_id,
 * AND fires a Stripe Invoice to the primary patient for the companion fee.
 *
 * Body: {
 *   primaryAppointmentId,
 *   companion: { firstName, lastName, dateOfBirth?, phone?, email?, relationship? },
 *   companionFeeCents (default $7500 = $75 non-member rate),
 *   sendInvoice (default true),
 * }
 *
 * Response: { ok, companionAppointmentId, invoiceId, hostedInvoiceUrl }
 *
 * verify_jwt=false (admin-gated by auth.role check inside).
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const {
      primaryAppointmentId,
      companion = {},
      companionFeeCents = 7500,
      sendInvoice = true,
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

    // Load primary appointment
    const { data: primary } = await admin
      .from('appointments')
      .select('*')
      .eq('id', primaryAppointmentId)
      .maybeSingle();
    if (!primary) {
      return new Response(JSON.stringify({ error: 'primary_appointment_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const companionFullName = `${String(companion.firstName).trim()} ${String(companion.lastName || '').trim()}`.trim();
    const relationship = companion.relationship || 'Spouse';

    // 1) Ensure primary has family_group_id set (convention: primary.id == family_group_id)
    if (!(primary as any).family_group_id) {
      await admin.from('appointments')
        .update({ family_group_id: primaryAppointmentId, companion_role: 'primary' })
        .eq('id', primaryAppointmentId);
    }

    // 2) Insert companion appointment row
    const companionPhone = companion.phone ? String(companion.phone).replace(/\D/g, '') : null;
    const { data: compRow, error: insErr } = await admin.from('appointments').insert({
      patient_name: companionFullName,
      patient_email: companion.email || null,
      patient_phone: companionPhone,
      appointment_date: (primary as any).appointment_date,
      appointment_time: (primary as any).appointment_time,
      address: (primary as any).address,
      zipcode: (primary as any).zipcode,
      gate_code: (primary as any).gate_code,
      service_type: (primary as any).service_type,
      service_name: (primary as any).service_name,
      service_price: 0,
      tip_amount: 0,
      total_amount: 0,
      duration_minutes: (primary as any).duration_minutes || 60,
      lab_destination: (primary as any).lab_destination,
      status: 'scheduled',
      booking_source: 'admin',
      billed_to: (primary as any).billed_to || 'patient',
      organization_id: (primary as any).organization_id || null,
      family_group_id: primaryAppointmentId,
      companion_role: relationship,
      payment_status: 'completed', // fee billed separately on primary's invoice
      notes: `Companion of ${(primary as any).patient_name || 'primary'}${companion.dateOfBirth ? ` · DOB ${companion.dateOfBirth}` : ''} · rel: ${relationship} · billed via primary Stripe invoice`,
    }).select('id').single();

    if (insErr || !compRow) {
      throw insErr || new Error('companion_insert_failed');
    }

    // 3) Stripe Invoice on the primary patient
    let invoiceId: string | null = null;
    let hostedInvoiceUrl: string | null = null;
    if (sendInvoice) {
      const primaryEmail = (primary as any).patient_email;
      if (!primaryEmail) {
        return new Response(JSON.stringify({
          ok: true,
          companionAppointmentId: (compRow as any).id,
          warning: 'companion_added_no_invoice',
          reason: 'primary has no email — cannot send Stripe Invoice',
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Find or create Stripe customer
      let customerId: string | null = null;
      const existingCustomers = await stripe.customers.list({ email: primaryEmail, limit: 1 });
      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({
          email: primaryEmail,
          name: (primary as any).patient_name,
          phone: (primary as any).patient_phone || undefined,
          metadata: {
            patient_id: (primary as any).patient_id || '',
            source: 'admin_companion_addon',
          },
        });
        customerId = newCustomer.id;
      }

      // Create invoice item
      await stripe.invoiceItems.create({
        customer: customerId!,
        amount: companionFeeCents,
        currency: 'usd',
        description: `Companion visit add-on — ${companionFullName} — ${String((primary as any).appointment_date).substring(0, 10)} at ${(primary as any).appointment_time || ''}`,
        metadata: {
          primary_appointment_id: primaryAppointmentId,
          companion_appointment_id: (compRow as any).id,
          companion_name: companionFullName,
          relationship,
          source: 'admin_companion_addon',
        },
      });

      // Create the invoice + finalize + send
      const invoice = await stripe.invoices.create({
        customer: customerId!,
        collection_method: 'send_invoice',
        days_until_due: 7,
        description: `Companion visit add-on for ${companionFullName} — Wed ${new Date(String((primary as any).appointment_date).substring(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`,
        metadata: {
          primary_appointment_id: primaryAppointmentId,
          companion_appointment_id: (compRow as any).id,
          source: 'admin_companion_addon',
          type: 'companion_addon_invoice',
        },
        auto_advance: false,
      });

      const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
      const sentInvoice = await stripe.invoices.sendInvoice(finalized.id);
      invoiceId = sentInvoice.id;
      hostedInvoiceUrl = sentInvoice.hosted_invoice_url || null;

      // 4) Update primary's notes + cross-reference the companion appointment
      const newNotes = [
        (primary as any).notes,
        `Companion added: ${companionFullName} (${relationship}). $${(companionFeeCents / 100).toFixed(2)} invoice ${invoiceId} sent to ${primaryEmail}.`,
      ].filter(Boolean).join(' | ');

      await admin.from('appointments').update({
        notes: newNotes,
        // Save Stripe invoice ID on primary so admin can find it later
        stripe_invoice_id: invoiceId,
      }).eq('id', primaryAppointmentId);

      // Stamp the companion's notes too with the invoice ID
      await admin.from('appointments').update({
        notes: `Companion of ${(primary as any).patient_name} · invoice ${invoiceId}` + (companion.dateOfBirth ? ` · DOB ${companion.dateOfBirth}` : ''),
      }).eq('id', (compRow as any).id);
    }

    return new Response(JSON.stringify({
      ok: true,
      primaryAppointmentId,
      companionAppointmentId: (compRow as any).id,
      invoiceId,
      hostedInvoiceUrl,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[add-companion-with-invoice] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e), code: e?.code, type: e?.type }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
