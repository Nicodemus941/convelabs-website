// admin-fire-concierge-welcome-nicholas
// One-shot: send Nicolas Chaillan his missed concierge welcome email + SMS.
// His 2026-05-28 $399 signup webhook crashed with "Invalid time value"
// before the welcome notification step. Hardcoded recipient so this
// function can't be reused.
//
// Disabled after first successful fire by replacing body with 410 Gone.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';

const RECIPIENT_EMAIL = 'nicolas.chaillan@preventbreach.com';
const RECIPIENT_PHONE = '+12025340312';
const FIRST_NAME = 'Nicolas';
const DASHBOARD_URL = 'https://www.convelabs.com/dashboard/patient';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // PERMANENTLY DISABLED. Successfully fired Nicolas Chaillan's
    // concierge welcome at 2026-05-28 19:04 UTC. Kept in repo as
    // reference template for future one-shot member backfills.
    return new Response(JSON.stringify({ error: 'one-shot function disabled — already fired' }), {
      status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    // @ts-ignore unreachable
    const body = await req.json().catch(() => ({}));

    const report: Record<string, any> = {};

    // ── EMAIL ────────────────────────────────────────────────────────
    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;margin:0;padding:20px;background:#f4f4f5;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);color:#fff;padding:28px;text-align:center;">
    <h1 style="margin:0;font-size:24px;">Welcome to ConveLabs Concierge, ${FIRST_NAME}</h1>
    <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">Your $399/year Concierge membership is active.</p>
  </div>
  <div style="padding:28px;line-height:1.6;color:#111827;">
    <p>You're in. Here's exactly what your Concierge plan unlocks — effective immediately:</p>

    <div style="background:#fef2f2;border-left:4px solid #B91C1C;border-radius:8px;padding:18px 22px;margin:22px 0;">
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#7F1D1D;">Your Concierge perks</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse;">
        <tr><td style="padding:4px 0;color:#374151;">Mobile blood draws</td><td style="text-align:right;font-weight:700;color:#B91C1C;">$99 <span style="font-weight:400;color:#6b7280;">(save $51 vs retail)</span></td></tr>
        <tr><td style="padding:4px 0;color:#374151;">Restoration Place visits</td><td style="text-align:right;font-weight:700;color:#B91C1C;">$85</td></tr>
        <tr><td style="padding:4px 0;color:#374151;">In-office (Maitland)</td><td style="text-align:right;font-weight:700;color:#B91C1C;">$39</td></tr>
        <tr><td style="padding:4px 0;color:#374151;">Up to 2 household members per visit</td><td style="text-align:right;font-weight:700;color:#B91C1C;">$0 each</td></tr>
        <tr><td style="padding:4px 0;color:#374151;">Additional family beyond 2</td><td style="text-align:right;font-weight:700;color:#B91C1C;">$35 each</td></tr>
        <tr><td style="padding:4px 0;color:#374151;">Same-day booking guarantee</td><td style="text-align:right;font-weight:700;color:#059669;">✓</td></tr>
        <tr><td style="padding:4px 0;color:#374151;">Dedicated phlebotomist</td><td style="text-align:right;font-weight:700;color:#059669;">✓</td></tr>
        <tr><td style="padding:4px 0;color:#374151;">NDA available on request</td><td style="text-align:right;font-weight:700;color:#059669;">✓</td></tr>
        <tr><td style="padding:4px 0;color:#374151;">Concierge support line</td><td style="text-align:right;font-weight:700;color:#059669;">✓</td></tr>
      </table>
    </div>

    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px 18px;margin:18px 0;font-size:13px;color:#065f46;">
      <strong>The Concierge Promise:</strong> If any visit isn't 5-star, your entire annual fee is refunded AND your next 3 visits are free. Period.
    </div>

    <p style="margin:24px 0 14px;">Your dashboard shows everything in one place — book visits, add family members at $0, see your savings, message support:</p>

    <div style="text-align:center;margin:24px 0;">
      <a href="${DASHBOARD_URL}" style="display:inline-block;background:#B91C1C;color:#fff;padding:15px 42px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Open my Concierge dashboard →</a>
    </div>

    <p style="margin-top:24px;font-size:13px;color:#6b7280;">Renewal: <strong style="color:#111827;">May 28, 2027</strong> · Member # MEM-2026-0009</p>

    <p style="margin-top:20px;">Questions? Reply to this email or call (941) 527-9169.</p>
    <p style="margin-top:16px;">— Nicodemme "Nico" Jean-Baptiste<br><em>Founder, ConveLabs</em></p>
  </div>
  <div style="background:#f9fafb;padding:14px 28px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;">
    ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810
  </div>
</div></body></html>`;

    const fd = new FormData();
    fd.append('from', `Nicodemme Jean-Baptiste <info@convelabs.com>`);
    fd.append('to', RECIPIENT_EMAIL);
    fd.append('subject', `Welcome to ConveLabs Concierge, ${FIRST_NAME} — your perks inside`);
    fd.append('html', html);
    fd.append('o:tracking-clicks', 'no');
    const mgResp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: fd,
    });
    report.email_status = mgResp.status;
    report.email_body = (await mgResp.text()).slice(0, 200);

    // ── SMS ──────────────────────────────────────────────────────────
    const smsBody = `Welcome to ConveLabs Concierge, ${FIRST_NAME}! Your $399/yr plan is active. Mobile draws $99, 2 family members FREE per visit, same-day booking. Dashboard: ${DASHBOARD_URL} · Call (941) 527-9169 anytime. — Nico`;
    const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const sFd = new URLSearchParams({ To: RECIPIENT_PHONE, From: TWILIO_FROM, Body: smsBody });
    const twResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: sFd.toString(),
    });
    report.sms_status = twResp.status;
    report.sms_body = (await twResp.text()).slice(0, 200);

    return new Response(JSON.stringify({ ok: mgResp.ok && twResp.ok, report }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
