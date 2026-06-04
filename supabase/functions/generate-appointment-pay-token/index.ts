/**
 * GENERATE-APPOINTMENT-PAY-TOKEN
 *
 * Admin-triggered (or internal-secret for automation). Creates a branded
 * pay link (/pay/:token) for an appointment, revoking any prior active
 * token for that appointment first (one active token per appointment).
 *
 * Email send is GATED by PAY_TOKEN_EMAIL_ENABLED (default OFF):
 *   - off  → returns { url } in JSON for the admin to paste manually
 *   - on   → also sends the branded pay-link email via Mailgun
 *
 * Auth: caller must be an authenticated admin (super_admin/admin/owner) OR
 * pass x-internal-secret matching PAY_TOKEN_INTERNAL_SECRET (for
 * send-appointment-invoice integration later).
 *
 * Body: { appointment_id }
 * → { ok, url, token, emailed }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const EMAIL_ENABLED = (Deno.env.get('PAY_TOKEN_EMAIL_ENABLED') || '').toLowerCase() === 'true';
const INTERNAL_SECRET = Deno.env.get('PAY_TOKEN_INTERNAL_SECRET') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

const ADMIN_ROLES = new Set(['super_admin', 'admin', 'owner']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function newToken(): string {
  // URL-safe random token, ~32 chars.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
        const role = String((data?.user?.user_metadata as any)?.role || '').toLowerCase();
        if (ADMIN_ROLES.has(role)) authed = true;
      }
    }
    if (!authed) return json({ error: 'unauthorized' }, 401);

    const { appointment_id } = await req.json().catch(() => ({}));
    if (!appointment_id) return json({ error: 'appointment_id_required' }, 400);

    const { data: appt } = await admin
      .from('appointments')
      .select('id, patient_name, patient_email, appointment_date, total_amount, payment_status, status')
      .eq('id', appointment_id)
      .maybeSingle();
    if (!appt) return json({ error: 'appointment_not_found' }, 404);

    // Revoke any prior active token for this appointment (keeps the partial
    // unique index happy + invalidates stale links).
    await admin.from('appointment_pay_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('appointment_id', appointment_id)
      .is('revoked_at', null)
      .is('paid_at', null);

    // Expiry = min(appointment_date + 1 day, now + 30 days).
    const apptDate = new Date(String(appt.appointment_date).substring(0, 10) + 'T23:59:59-04:00');
    const apptPlus1 = new Date(apptDate.getTime() + 24 * 60 * 60 * 1000);
    const nowPlus30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(Math.min(apptPlus1.getTime(), nowPlus30.getTime()));

    const token = newToken();
    const { error: insErr } = await admin.from('appointment_pay_tokens').insert({
      appointment_id,
      access_token: token,
      expires_at: expiresAt.toISOString(),
    });
    if (insErr) return json({ error: insErr.message }, 500);

    const url = `${SITE}/pay/${token}`;

    // ── EMAIL (gated) ─────────────────────────────────────────────
    let emailed = false;
    if (EMAIL_ENABLED && appt.patient_email && MAILGUN_API_KEY) {
      try {
        const first = String(appt.patient_name || 'there').split(' ')[0];
        const amt = Number(appt.total_amount || 0).toFixed(2);
        const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:22px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="margin:0;font-size:20px;">Your ConveLabs invoice is ready</h1></div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111827;">
    <p>Hi ${first},</p>
    <p>Your balance for your mobile blood draw is <strong>$${amt}</strong>. Review and pay securely below — you can also add a tip for your phlebotomist if you'd like.</p>
    <div style="text-align:center;margin:22px 0;"><a href="${url}" style="display:inline-block;background:#B91C1C;color:#fff;padding:13px 34px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Review &amp; pay →</a></div>
    <p style="font-size:12px;color:#6b7280;">Powered by Stripe. Your card details never touch ConveLabs. Questions? info@convelabs.com · (941) 527-9169</p>
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

    return json({ ok: true, url, token, emailed, email_enabled: EMAIL_ENABLED });
  } catch (e: any) {
    console.error('[generate-appointment-pay-token] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
