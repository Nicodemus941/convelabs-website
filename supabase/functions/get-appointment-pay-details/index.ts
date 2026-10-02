/**
 * GET-APPOINTMENT-PAY-DETAILS
 *
 * Token-only (appointment_pay_tokens.access_token). Powers the branded
 * /pay/:token checkout page. Returns the visit summary, the itemised
 * pre-tip amount due (server-authoritative, cross-checked against the open
 * Stripe invoice) and the token/appointment status. No PHI in the URL; the
 * token is the bearer credential. Read-only.
 *
 * GET  ?token=...   OR   POST { token }
 * → { ok, status, appointment:{...}, subtotal_cents, lines, terms_url, privacy_url,
 *     receipt_email_hint, paid?:{ total_cents, tip_cents, paid_at } }
 *   status ∈ 'unpaid' | 'paid' | 'expired' | 'voided'
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { resolveAmountDue, phlebFirstName } from '../_shared/pay-amount.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY, { apiVersion: '2023-10-16' }) : null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function maskEmail(email: string | null | undefined): string | null {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  if (at < 1) return null;
  const local = e.substring(0, at);
  const domain = e.substring(at + 1);
  return `${local.substring(0, Math.min(2, local.length))}•••@${domain}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    let token = '';
    if (req.method === 'GET') token = new URL(req.url).searchParams.get('token') || '';
    else token = (await req.json().catch(() => ({})))?.token || '';
    if (!token) return json({ error: 'token_required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tok } = await admin
      .from('appointment_pay_tokens')
      .select('id, appointment_id, expires_at, revoked_at, paid_at, selected_tip_cents')
      .eq('access_token', token)
      .maybeSingle();
    if (!tok) return json({ error: 'token_not_found' }, 404);

    const { data: a } = await admin
      .from('appointments')
      .select('id, patient_name, patient_email, appointment_date, appointment_time, address, service_type, service_name, total_amount, surcharge_amount, tip_amount, payment_status, status, phlebotomist_id, stripe_invoice_id, billed_to, organization_id')
      .eq('id', tok.appointment_id)
      .maybeSingle();
    if (!a) return json({ error: 'appointment_not_found' }, 404);

    const appointment = {
      patient_first_name: String(a.patient_name || 'there').split(' ')[0],
      appointment_date: a.appointment_date,
      appointment_time: a.appointment_time,
      address: a.address,
      service_name: a.service_name || a.service_type || 'Mobile Blood Draw',
      phleb_first_name: await phlebFirstName(admin, a.phlebotomist_id),
    };

    // Paid (via this token OR anywhere else) wins over every other state so
    // a patient who already paid never sees "expired".
    const paidViaToken = !!tok.paid_at;
    const paidOnAppt = ['completed', 'paid', 'succeeded'].includes(String(a.payment_status));
    if (paidViaToken || paidOnAppt) {
      const tipCents = Math.round(Number(a.tip_amount || 0) * 100);
      return json({
        ok: true, status: 'paid', appointment,
        paid: { total_cents: Math.round(Number(a.total_amount || 0) * 100), tip_cents: tipCents, paid_at: tok.paid_at || null },
        receipt_email_hint: maskEmail(a.patient_email),
      });
    }
    if (tok.revoked_at) return json({ ok: true, status: 'voided', appointment });
    if (['cancelled', 'no_show'].includes(String(a.status))) return json({ ok: true, status: 'voided', appointment });
    if (new Date(tok.expires_at) < new Date()) return json({ ok: true, status: 'expired', appointment });

    const due = await resolveAmountDue(admin, stripe, a);
    if (due.status === 'paid') {
      return json({ ok: true, status: 'paid', appointment, paid: { total_cents: Math.round(Number(a.total_amount || 0) * 100), tip_cents: Math.round(Number(a.tip_amount || 0) * 100), paid_at: null }, receipt_email_hint: maskEmail(a.patient_email) });
    }
    if (due.status === 'voided') return json({ ok: true, status: 'voided', appointment });

    return json({
      ok: true,
      status: 'unpaid',
      subtotal_cents: due.subtotal_cents,
      lines: due.lines,
      selected_tip_cents: tok.selected_tip_cents ?? null,
      terms_url: `${SITE}/terms-of-service`,
      privacy_url: `${SITE}/privacy-policy`,
      receipt_email_hint: maskEmail(a.patient_email),
      appointment,
    });
  } catch (e: any) {
    console.error('[get-appointment-pay-details] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
