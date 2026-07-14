/**
 * ANNOUNCE-PROVIDER-FEATURES (2026-07-13)
 *
 * One-shot campaign: emails every REGISTERED organization (is_active, has a
 * dashboard login, valid contact email) announcing the new provider-dashboard
 * features. Each email is tailored to that org: contact first name, org name,
 * their live roster/visit counts, and a stat line that matches where they are
 * in the funnel. CTA goes to the org LOGIN screen (/provider) so they sign in
 * before landing on their dashboard.
 *
 * Auth: body.secret must equal env ANNOUNCE_SECRET (one-off ops tool, not a
 * user-facing endpoint).
 *
 * Body:
 *   { secret, mode: 'preview', to }        → renders the tailored email for
 *                                            the largest org + sends ONLY to `to`
 *   { secret, mode: 'send', dry_run? }     → one tailored email per org;
 *                                            dry_run=true returns the list
 *                                            without sending
 * Response: { ok, sent: [{org, email, ok}], skipped: [...] }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const LOGIN_URL = `${PUBLIC_SITE_URL}/provider`;

// Internal / test orgs that must never receive the campaign.
const EXCLUDED_ORG_IDS = new Set([
  '7166ab5a-cd49-4eba-b30c-7c6ad94c9422', // "faith" (owner test)
  '8576ba0a-ed77-4c36-baaf-79c92c2c6127', // "test"
  '730cb266-1f3c-41b9-9bef-c144a2e7175f', // ConveLabs Preview (internal)
  'c3359187-6ad6-4dc9-abae-722659299e29', // E-Labus (internal)
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface OrgRow {
  id: string; name: string; contact_name: string | null; contact_email: string | null;
  billing_email: string | null; roster_count: number; visit_count: number; request_count: number;
}

function firstName(contact: string | null): string {
  if (!contact) return 'there';
  // Strip honorifics so "Dr. Monica Sher" → "Dr. Sher"-style greeting feels
  // wrong in first-name form; keep it warm: "Dr. Monica" reads oddly too, so
  // use the full first token after any title.
  const cleaned = contact.replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '').trim();
  const tok = cleaned.split(/[\s,]+/)[0] || 'there';
  return tok.charAt(0).toUpperCase() + tok.slice(1);
}

/** The personalized "where you are" line — makes each email feel written for them. */
function statLine(o: OrgRow): string {
  if (o.roster_count >= 20) {
    return `Your patient list (${o.roster_count} patients) is already loaded — the new tools below were built for practices exactly your size.`;
  }
  if (o.visit_count >= 5) {
    return `With ${o.visit_count} completed visits together, these upgrades make your next order even smoother.`;
  }
  if (o.visit_count > 0 || o.roster_count > 0) {
    return `Your dashboard is set up and ready — these new tools make ordering your next draw effortless.`;
  }
  return `Your organization is registered and your dashboard is ready — here's what's waiting for you inside.`;
}

function emailHtml(o: OrgRow): string {
  const fn = firstName(o.contact_name);
  const feature = (icon: string, title: string, body: string) => `
    <tr><td style="padding:0 0 14px;">
      <div style="background:#ffffff;border:1px solid #f1e5e3;border-radius:12px;padding:16px 18px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#111827;">${icon}&nbsp; ${title}</p>
        <p style="margin:6px 0 0;font-size:13px;line-height:1.55;color:#4b5563;">${body}</p>
      </div>
    </td></tr>`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f6f3f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3f2;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);border-radius:16px 16px 0 0;padding:34px 32px;text-align:center;">
    <p style="margin:0;font-size:12px;letter-spacing:.18em;color:#fecaca;font-weight:700;">CONVELABS · PARTNER UPDATE</p>
    <h1 style="margin:10px 0 0;font-size:24px;line-height:1.3;color:#ffffff;">Your provider dashboard just got a major upgrade, ${o.name}</h1>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#fdfbfa;border:1px solid #eee2e0;border-top:0;padding:30px 32px 10px;">
    <p style="margin:0 0 6px;font-size:15px;color:#111827;">Hi ${fn},</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;">${statLine(o)}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${feature('📥', 'Import your whole patient roster in one upload',
        `Export a CSV from your EHR and drop it in — names, emails, phones, DOBs and addresses import in seconds. Duplicates are merged automatically (we fill in the blanks, never overwrite what you have).`)}
      ${feature('🗂️', 'A patient list built for real rosters',
        `Clean pages instead of endless scrolling, instant search, A–Z jump, and one-tap filters that surface patients missing a phone, DOB, or address so your team can complete their charts. Visit history is now exact — imported patients show the day they were added, not a false "last visit."`)}
      ${feature('💳', 'Your card is only charged when the patient books',
        `When ${o.name} covers a draw, you now save a card instead of paying up-front. The charge happens the moment your patient actually books — and if they never schedule, your card is simply never charged. Nothing to chase, nothing to refund.`)}
      ${feature('🔁', 'One-click resend for unscheduled requests',
        `Patient let a request lapse? Hit Resend, pick a new needed-by date, and they get a fresh link by text + email — any payment or saved card carries over automatically.`)}
      ${feature('📦', 'Specimen delivery tracking, automatically',
        `The moment your patient's specimen is handed to the reference lab, they're notified with the lab name and a live tracking number. Fewer "where's my sample?" calls to your front desk.`)}
    </table>

    <!-- CTA -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:14px 0 8px;">
      <a href="${LOGIN_URL}" style="display:inline-block;background:#B91C1C;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 44px;border-radius:10px;">Sign in to your dashboard →</a>
      <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;">Use your ${o.name} organization login — everything above is live now.</p>
    </td></tr></table>

    <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#4b5563;">Questions, or want a 10-minute walkthrough for your team? Just reply to this email or call <a href="tel:+19415279169" style="color:#B91C1C;text-decoration:none;font-weight:600;">(941) 527-9169</a> — I'll personally show you around.</p>
    <p style="margin:16px 0 24px;font-size:13px;color:#374151;">— Nicodemme "Nico" Jean-Baptiste<br><span style="color:#9ca3af;">Founder, ConveLabs Concierge Lab Services</span></p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f9f5f4;border:1px solid #eee2e0;border-top:0;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810<br>
    You're receiving this because ${o.name} has a registered provider account with ConveLabs.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

async function sendMail(to: string, orgName: string, html: string): Promise<boolean> {
  const fd = new FormData();
  fd.append('from', `Nico at ConveLabs <info@convelabs.com>`);
  fd.append('to', to);
  fd.append('subject', `New in your ConveLabs dashboard, ${orgName}: roster import, smarter patient list & pay-when-they-book`);
  fd.append('html', html);
  fd.append('o:tracking-clicks', 'no');
  const r = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: fd,
  });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const expected = Deno.env.get('ANNOUNCE_SECRET') || '';
    if (!expected || body.secret !== expected) return json({ error: 'forbidden' }, 403);
    if (!MAILGUN_API_KEY) return json({ error: 'mailgun_not_configured' }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Registered = active + has at least one dashboard login + a sane email.
    const { data: orgs, error } = await admin.rpc('announce_target_orgs');
    if (error) return json({ error: error.message }, 500);

    const targets: OrgRow[] = (orgs || []).filter((o: OrgRow) =>
      !EXCLUDED_ORG_IDS.has(o.id) &&
      o.contact_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.contact_email)
    );

    // mode:'render' → return the tailored HTML (largest org) without sending,
    // for visual QA in a browser before the campaign goes out.
    if (body.mode === 'render') {
      const sample = targets[0];
      if (!sample) return json({ error: 'no targets' }, 404);
      return new Response(emailHtml(sample), { headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
    }

    if (body.mode === 'preview') {
      if (!body.to) return json({ error: 'to required for preview' }, 400);
      const sample = targets[0]; // largest roster first (RPC orders by size)
      if (!sample) return json({ error: 'no targets' }, 404);
      const ok = await sendMail(body.to, sample.name, emailHtml(sample));
      return json({ ok, mode: 'preview', sample_org: sample.name, sent_to: body.to, target_count: targets.length, targets: targets.map(t => ({ name: t.name, email: t.contact_email })) });
    }

    if (body.mode !== 'send') return json({ error: 'mode must be preview or send' }, 400);

    if (body.dry_run) {
      return json({ ok: true, dry_run: true, target_count: targets.length, targets: targets.map(t => ({ name: t.name, email: t.contact_email, roster: t.roster_count, visits: t.visit_count })) });
    }

    const sent: any[] = [];
    const failed: any[] = [];
    const seenEmails = new Set<string>(); // never double-send to one inbox
    for (const o of targets) {
      const to = o.contact_email!.trim().toLowerCase();
      if (seenEmails.has(to)) { failed.push({ org: o.name, email: to, reason: 'duplicate_inbox' }); continue; }
      seenEmails.add(to);
      try {
        const ok = await sendMail(o.contact_email!, o.name, emailHtml(o));
        (ok ? sent : failed).push({ org: o.name, email: to, ...(ok ? {} : { reason: 'mailgun_error' }) });
      } catch (e: any) {
        failed.push({ org: o.name, email: to, reason: e?.message || 'exception' });
      }
      await new Promise(r => setTimeout(r, 250)); // gentle pacing
    }
    console.log(`[announce] sent=${sent.length} failed=${failed.length}`);
    return json({ ok: true, sent_count: sent.length, failed_count: failed.length, sent, failed });
  } catch (e: any) {
    console.error('[announce] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
