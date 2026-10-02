/**
 * GENERATE-APPOINTMENT-PAY-TOKEN
 *
 * Admin-triggered (or internal-secret for automation). Returns the branded
 * on-site pay link (/pay/:token) for an appointment.
 *
 * Default behaviour REUSES the active token (so a link already texted to the
 * patient keeps working when an admin clicks "copy pay link" again). Pass
 * { fresh: true } to revoke the active token and mint a new one (use after
 * an amount change / invoice reissue).
 *
 * Email send is GATED by PAY_TOKEN_EMAIL_ENABLED (default OFF):
 *   - off  → returns { url } in JSON for the admin to paste manually
 *   - on   → also sends the branded pay-link email via Mailgun
 *
 * Auth: caller must be an authenticated admin (super_admin/admin/owner) OR
 * pass x-internal-secret matching PAY_TOKEN_INTERNAL_SECRET.
 *
 * Body: { appointment_id, fresh?: boolean }
 * → { ok, url, token, reused, expires_at, emailed }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getOrCreatePayToken } from '../_shared/pay-link.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EMAIL_ENABLED = (Deno.env.get('PAY_TOKEN_EMAIL_ENABLED') || '').toLowerCase() === 'true';
const INTERNAL_SECRET = Deno.env.get('PAY_TOKEN_INTERNAL_SECRET') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

const ADMIN_ROLES = new Set(['super_admin', 'admin', 'owner']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── AUTH ──────────────────────────────────────────────────────
    const internalSecret = req.headers.get('x-internal-secret') || '';
    let authed = false;
    if (INTERNAL_SECRET && internalSecret && internalSecret === INTERNAL_SECRET) {
      authed = true;
    } else {
      const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (bearer) {
        const { data } = await admin.auth.getUser(bearer);
        const role = String((data?.user?.user_metadata as any)?.role || (data?.user?.app_metadata as any)?.role || '').toLowerCase();
        if (ADMIN_ROLES.has(role)) authed = true;
      }
    }
    if (!authed) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const appointment_id: string = body?.appointment_id;
    const fresh = body?.fresh === true;
    if (!appointment_id) return json({ error: 'appointment_id_required' }, 400);

    const { data: appt } = await admin
      .from('appointments')
      .select('id, patient_name, patient_email, appointment_date, total_amount, tip_amount, payment_status, status, billed_to, organization_id, stripe_invoice_url')
      .eq('id', appointment_id)
      .maybeSingle();
    if (!appt) return json({ error: 'appointment_not_found' }, 404);
    if (['completed', 'paid', 'succeeded'].includes(String(appt.payment_status))) return json({ error: 'already_paid' }, 409);
    if (['cancelled', 'no_show'].includes(String(appt.status))) return json({ error: 'cancelled' }, 409);
    if (appt.billed_to === 'org' && appt.organization_id) {
      // Org invoices stay on Stripe's hosted page (ACH / net-30).
      return json({ error: 'org_billed', hosted_url: appt.stripe_invoice_url || null }, 409);
    }

    const tok = await getOrCreatePayToken(admin, appointment_id, { fresh, source: 'generate-appointment-pay-token', appointmentDate: appt.appointment_date });
    if (!tok) return json({ error: 'token_create_failed' }, 500);
    const { url, token, reused, expires_at } = tok;

    // ── EMAIL (gated) ─────────────────────────────────────────────
    let emailed = false;
    if (EMAIL_ENABLED && appt.patient_email && MAILGUN_API_KEY) {
      try {
        const first = String(appt.patient_name || 'there').split(' ')[0];
        const due = Math.max(0, Number(appt.total_amount || 0) - Number(appt.tip_amount || 0));
        const amt = due.toFixed(2);
        const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:22px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="margin:0;font-size:20px;">Your ConveLabs invoice is ready</h1></div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111827;">
    <p>Hi ${first},</p>
    <p>Your balance for your mobile blood draw is <strong>$${amt}</strong>. Review and pay securely on our site. Adding a tip for your phlebotomist is optional.</p>
    <div style="text-align:center;margin:22px 0;"><a href="${url}" style="display:inline-block;background:#B91C1C;color:#fff;padding:13px 34px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Review &amp; pay →</a></div>
    <p style="font-size:12px;color:#6b7280;">Payments are processed by Stripe; your card details never touch ConveLabs. Questions? info@convelabs.com · (941) 527-9169</p>
  </div>
</div>`;
        const fd = new FormData();
        fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
        fd.append('to', appt.patient_email);
        fd.append('subject', `Your ConveLabs invoice — $${amt}`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd,
        });
        emailed = mg.ok;
        try {
          await admin.from('email_send_log').insert({
            appointment_id, to_email: appt.patient_email, email_type: 'pay_link',
            subject: `Your ConveLabs invoice — $${amt}`, sent_at: new Date().toISOString(),
            status: mg.ok ? 'sent' : 'failed', campaign_tag: 'branded_pay_link',
          });
        } catch { /* non-blocking */ }
      } catch (e) { console.warn('[generate-pay-token] email err:', e); }
    }

    return json({ ok: true, url, token, reused, expires_at, emailed, email_enabled: EMAIL_ENABLED });
  } catch (e: any) {
    console.error('[generate-appointment-pay-token] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
