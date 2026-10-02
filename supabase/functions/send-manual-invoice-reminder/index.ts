/**
 * SEND-MANUAL-INVOICE-REMINDER
 *
 * One-shot warm invoice-reminder email + SMS, triggered from the
 * AppointmentDetailModal "Send Invoice Reminder" button. Designed for:
 *  - VIPs (auto-cancel cascade skips them, but admin still wants to nudge)
 *  - Patients we want to chase OUTSIDE the cascade
 *  - Re-sending the friendly reminder after the cascade already paused
 *    (paid_pending_verify or manual_review)
 *
 * Does NOT change invoice_status — it's a notification only, not a state
 * change. Won't double-fire because the admin button does the gating.
 *
 * Copy mirrors the Phase-1 reminder in process-invoice-reminders so the
 * patient gets the same warm tone regardless of trigger.
 *
 * Auth: admin/super_admin only. RLS-style role check from the JWT.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { resolvePatientPayLink } from '../_shared/pay-link.ts';
import { sendSMS as twilioSend } from '../_shared/twilio.ts';
import { SMS, firstNameOf } from '../_shared/sms-copy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || '';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_MESSAGING_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

async function sendEmail(to: string, subject: string, html: string) {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) throw new Error('mailgun_not_configured');
  const form = new FormData();
  form.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
  form.append('to', to);
  form.append('subject', subject);
  form.append('html', html);
  form.append('o:tracking-clicks', 'no');
  const r = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: form,
  });
  if (!r.ok) throw new Error(`mailgun ${r.status}: ${await r.text()}`);
}

// Shared sender: pinned ConveLabs From number (this file used to prefer the
// pooled messaging service → 717 E-Labus caller-ID leak), delivery-status
// callback, and Twilio 21610 (opted-out) surfaces as a thrown error.
async function sendSMS(to: string, message: string): Promise<string | null> {
  if (!TWILIO_SID || !TWILIO_TOKEN) throw new Error('twilio_not_configured');
  let normalized = to.replace(/\D/g, '');
  if (normalized.length === 10) normalized = `+1${normalized}`;
  else if (normalized.length === 11 && normalized.startsWith('1')) normalized = `+${normalized}`;
  else if (!normalized.startsWith('+')) normalized = `+${normalized}`;
  const msg = await twilioSend(normalized, message);
  return msg?.sid || null;
}
void TWILIO_MESSAGING_SID; void TWILIO_FROM; // kept for env parity; sender pins From itself

function emailWrapper(color: string, headline: string, body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
    <div style="background:${color};color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
      <h2 style="margin:0;font-size:22px;">${headline}</h2>
    </div>
    <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">${body}</div>
  </div>`;
}

/**
 * Patient reminders link to the on-site pay page (/pay/:token — tip
 * optional, never a redirect to Stripe). We first confirm the Stripe
 * invoice is still payable (not void/paid) so we never nudge for a dead
 * bill; then mint/reuse the token. Org-billed rows get the hosted URL.
 */
async function getPayLink(admin: any, appt: any): Promise<string | null> {
  if (appt.stripe_invoice_id) {
    try {
      const inv = await stripe.invoices.retrieve(appt.stripe_invoice_id);
      const st = (inv as any).status;
      if (st === 'void' || st === 'paid' || st === 'uncollectible') return null;
      if (inv?.hosted_invoice_url && !appt.stripe_invoice_url) appt.stripe_invoice_url = inv.hosted_invoice_url;
    } catch { /* fall through — resolve from DB */ }
  }
  const link = await resolvePatientPayLink(admin, appt, { source: 'send-manual-invoice-reminder' });
  return link.kind === 'none' ? null : link.url;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  // Global notification kill switch — every patient-facing sender honours it.
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ ok: false, suspended: true, error: 'notifications_suspended' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const role = (user.user_metadata?.role || user.app_metadata?.role || '').toString();
    if (!['super_admin', 'admin', 'office_manager'].includes(role)) {
      return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const appointmentId: string = body?.appointment_id;
    const channels: { email: boolean; sms: boolean } = { email: body?.email !== false, sms: body?.sms !== false };
    if (!appointmentId) return new Response(JSON.stringify({ error: 'appointment_id_required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: appt } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
    if (!appt) return new Response(JSON.stringify({ error: 'appointment_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Sanity: don't send a "you owe us" message to someone who's been paid.
    // 'completed' is what card checkout (incl. the on-site /pay page) writes.
    if (['paid', 'succeeded', 'completed'].includes(String(appt.payment_status)) || appt.invoice_status === 'paid') {
      return new Response(JSON.stringify({ error: 'already_paid', message: 'This appointment is already marked paid.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (appt.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'cancelled' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const name = (appt.patient_name || 'there').split(' ')[0];
    const amount = `$${(appt.total_amount || 0).toFixed(2)}`;
    const payLinkRaw = await getPayLink(admin, appt);
    const payLink = payLinkRaw || 'https://convelabs.com';
    const linkText = payLinkRaw
      ? `<div style="text-align:center;margin:20px 0;"><a href="${payLink}" style="display:inline-block;background:#1e40af;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;">Pay ${amount} Now</a></div>`
      : `<p style="font-size:14px;color:#374151;">If you didn't get the original invoice email, just reply or call <strong>(941) 527-9169</strong> and we'll re-send it right away.</p>`;

    const html = emailWrapper(
      '#1e40af',
      'Quick reminder about your ConveLabs visit',
      `<p>Hi ${name},</p>
       <p>Just a friendly nudge — your ConveLabs invoice of <strong>${amount}</strong> for your upcoming visit is still open.</p>
       ${linkText}
       <p style="font-size:13px;color:#6b7280;">Already paid? Just ignore this — we're double-checking on our end. Anything we can help with? Text or call <strong>(941) 527-9169</strong>.</p>
       <p style="margin-top:24px;">Looking forward to your visit,<br/>ConveLabs</p>`
    );

    // Central copy (same wording the cascade's Phase-1 uses going forward).
    const sms = SMS.invoiceReminder({ firstName: firstNameOf(appt.patient_name), amount, payUrl: payLinkRaw || null });

    const results: { email?: any; sms?: any } = {};
    if (channels.email && appt.patient_email) {
      try {
        await sendEmail(appt.patient_email, 'Quick reminder about your ConveLabs visit', html);
        results.email = { ok: true, to: appt.patient_email };
      } catch (e: any) { results.email = { ok: false, error: e?.message }; }
    } else if (channels.email) {
      results.email = { ok: false, error: 'no_patient_email' };
    }
    if (channels.sms && appt.patient_phone) {
      let sid: string | null = null;
      try {
        sid = await sendSMS(appt.patient_phone, sms);
        results.sms = { ok: true, to: appt.patient_phone, sid };
      } catch (e: any) { results.sms = { ok: false, error: e?.message }; }
      // Log as `invoice_reminder` so process-invoice-reminders' 20h SMS
      // dedupe (invoiceSmsSentRecently) and the admin SMS inbox can see
      // this manual nudge. Before, it was invisible to both → same-day
      // double texts.
      try {
        await admin.from('sms_notifications').insert({
          appointment_id: appointmentId,
          notification_type: 'invoice_reminder',
          phone_number: appt.patient_phone,
          message_content: sms.substring(0, 1500),
          sent_at: new Date().toISOString(),
          delivery_status: results.sms?.ok ? 'sent' : 'failed',
          twilio_message_sid: sid,
          created_by: user.id,
          metadata: { source: 'send-manual-invoice-reminder', manual: true, ...(results.sms?.ok ? {} : { error: String(results.sms?.error || '').substring(0, 300) }) },
        });
      } catch { /* non-blocking */ }
    } else if (channels.sms) {
      results.sms = { ok: false, error: 'no_patient_phone' };
    }

    // Audit trail
    try {
      await admin.from('activity_log' as any).insert({
        patient_id: appt.patient_id || null,
        appointment_id: appointmentId,
        activity_type: 'manual_invoice_reminder',
        description: `Admin sent manual reminder · email=${results.email?.ok ? '✓' : '✗'} sms=${results.sms?.ok ? '✓' : '✗'}`,
        performed_by: user.email || user.id,
      });
    } catch { /* non-blocking */ }

    return new Response(JSON.stringify({ ok: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[send-manual-invoice-reminder]', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
