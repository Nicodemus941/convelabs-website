// send-partner-outreach — admin-triggered outreach email to partner prospects.
//
// High-converting Hormozi-grade template (hook → agitate → stack → reverse →
// social proof → single CTA → signoff). Every CTA routes to /partner-with-us
// where the prospect fills out the self-sufficient form.
//
// Dedup: inserts a campaign_sends row PER recipient BEFORE sending, so
// repeat invocations within 30 days skip anyone already contacted under
// the same campaign_key. Admin supplies their own campaign_key for batches.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

interface Recipient {
  email: string;
  firstName?: string;
  practiceName?: string;
}

interface OutreachPayload {
  recipients: Recipient[];
  // Optional admin overrides — if omitted, the default high-converting
  // template copy ships as-is.
  customSubject?: string;
  customIntro?: string;
  campaignKey?: string;  // default: 'partner_outreach_YYYY_MM_DD'
  dryRun?: boolean;      // returns rendered preview without sending
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '_');
}

function renderEmail(r: Recipient, customIntro?: string): string {
  const firstName = escapeHtml((r.firstName || '').trim() || 'there');
  const practice = escapeHtml((r.practiceName || '').trim());
  const partnerUrl = `${PUBLIC_SITE}/partner-with-us?utm_source=outreach&utm_medium=email&utm_campaign=partner_${todayIsoDate()}`;

  const introBlock = customIntro
    ? `<p>${escapeHtml(customIntro).replace(/\n/g, '<br>')}</p>`
    : `<p>I'm the founder of ConveLabs — a concierge mobile phlebotomy practice serving Central Florida. Our team currently collects for <strong>Aristotle Education, ND Wellness, The Restoration Place, Natura Integrative &amp; Functional Medicine, Kristen Blake Wellness, and several concierge physicians</strong>.</p>
       <p>${practice ? `I've been thinking about ${practice}` : `I noticed you're in the space`} and wanted to reach out directly. If your patients are still going to LabCorp or Quest for collection, there's a better way — one that takes your practice out of the middle entirely.</p>`;

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);padding:28px 24px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">A concierge lab partner for your patients</h1>
    <p style="margin:6px 0 0;color:#fecaca;font-size:13px;letter-spacing:.5px;">ConveLabs Mobile Phlebotomy · Central Florida</p>
  </div>
  <div style="padding:28px 24px;background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;color:#111827;line-height:1.65;font-size:14.5px;">
    <p>Hi ${firstName},</p>

    ${introBlock}

    <h3 style="margin:22px 0 10px;color:#B91C1C;font-size:15px;">What a ConveLabs partnership looks like</h3>
    <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:8px 0 18px;">
      <tr><td style="padding:12px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
        <strong>Your patients self-schedule in 90 seconds.</strong> No phone tag. We show up at their door in a known window. You see every booking live in your portal.
      </td></tr>
      <tr><td style="padding:12px 14px;background:#fff;border-bottom:1px solid #e5e7eb;">
        <strong>Upload a lab order, our OCR does the rest.</strong> Reads every panel, auto-sends protocol-specific prep (fasting, urine, GTT). Fewer redraws, zero invalid specimens.
      </td></tr>
      <tr><td style="padding:12px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
        <strong>Billing isolation — you decide who pays.</strong> Patient-pay default; flip any visit to "${practice || 'your practice'} pays" with one toggle. Billing walls between your invoices and your patient's.
      </td></tr>
      <tr><td style="padding:12px 14px;background:#fff;border-bottom:1px solid #e5e7eb;">
        <strong>Live specimen tracking.</strong> Unique ID per tube. Collected → In Transit → Delivered → Results ETA. Your portal updates instantly. You never chase us.
      </td></tr>
      <tr><td style="padding:12px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
        <strong>Unlimited team logins.</strong> Every provider, nurse, front-desk — each gets their own scoped portal. No per-seat pricing.
      </td></tr>
      <tr><td style="padding:12px 14px;background:#fff;">
        <strong>Live in under 48 hours.</strong> From "yes" to your first patient booking: custom portal, team logins, branded patient emails — all in under 2 days.
      </td></tr>
    </table>

    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px 18px;margin:18px 0;">
      <p style="margin:0;font-size:13px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">The Recollection Guarantee — in writing</p>
      <ul style="padding-left:18px;margin:8px 0 0;font-size:13px;color:#14532d;line-height:1.55;">
        <li>If <strong>ConveLabs</strong> caused the error, recollection is <strong>100% free</strong>.</li>
        <li>If the <strong>reference lab</strong> caused the error, recollection is <strong>50% off</strong>.</li>
      </ul>
      <p style="margin:8px 0 0;font-size:12px;color:#166534;">No other mobile phleb service in Florida puts this in writing.</p>
    </div>

    <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">The simplest request</h3>
    <p style="margin:0 0 14px;">If you're open to a 10-minute conversation, hit the button below. It's a one-page form — tells me about your practice so I can come back with a proposal tailored to you (pricing, timelines, and anything specific to your panels or workflow).</p>

    <div style="text-align:center;margin:22px 0 6px;">
      <a href="${partnerUrl}" style="display:inline-block;background:#B91C1C;color:#ffffff;padding:15px 38px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15.5px;">
        See if we're a fit →
      </a>
    </div>
    <p style="text-align:center;font-size:12px;color:#6b7280;margin:0 0 16px;">Takes 2 minutes. 24-hour founder response.</p>

    <p style="margin:22px 0 8px;font-size:14px;">
      Want the answers right now without a call?
      <a href="${PUBLIC_SITE}/for-providers" style="color:#B91C1C;font-weight:600;">View services, pricing, hours &amp; how it works →</a>
    </p>
    <p style="margin:8px 0 0;font-size:12px;color:#6b7280;">
      Includes draw fees, lab destinations (Quest, LabCorp, AdventHealth, Orlando Health), service area, and the patient booking flow.
    </p>

    <p style="margin:22px 0 8px;font-size:14px;">Prefer a phone call? <a href="tel:+19415279169" style="color:#B91C1C;font-weight:600;">(941) 527-9169</a> — I answer my own phone on weekdays.</p>

    <p style="margin:16px 0 0;">With gratitude,<br>
    <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
    <em>Founder, ConveLabs Concierge Lab Services</em></p>

    <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0 14px;">
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:0;line-height:1.55;">
      You're receiving this one-time introduction because your practice is in a segment we serve. Not interested? Just reply "no thanks" and we won't reach out again.<br>
      ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169
    </p>
  </div>
</div>`;
}

async function claimSendRow(supabase: any, campaignKey: string, email: string): Promise<boolean> {
  // Reserve-first pattern — INSERT with status='sending'. Unique index
  // uniq_campaign_sends_key_email prevents any duplicate outreach.
  const { error } = await supabase
    .from('campaign_sends')
    .insert({
      campaign_key: campaignKey,
      recipient_email: email.toLowerCase(),
      status: 'sending',
    })
    .select('id')
    .maybeSingle();
  if (error) {
    const code = String((error as any).code || '');
    const msg = String((error as any).message || '');
    if (code === '23505' || /duplicate|unique/i.test(msg)) return false; // already sent
    throw error;
  }
  return true;
}

async function finalizeSendRow(supabase: any, campaignKey: string, email: string, mgId: string | null, status: 'sent' | 'failed', errorMsg?: string) {
  await supabase.from('campaign_sends')
    .update({
      status,
      mailgun_id: mgId,
      metadata: errorMsg ? { error: errorMsg.substring(0, 500) } : undefined,
    })
    .eq('campaign_key', campaignKey)
    .eq('recipient_email', email.toLowerCase());
}

async function sendMailgun(to: string, subject: string, html: string, replyTo = 'info@convelabs.com'): Promise<{ ok: boolean; id: string | null; error?: string }> {
  const fd = new FormData();
  fd.append('from', `Nico at Nicodemme Jean-Baptiste <info@convelabs.com>`);
  fd.append('to', to);
  fd.append('h:Reply-To', replyTo);
  fd.append('subject', subject);
  fd.append('html', html);
  fd.append('o:tracking-clicks', 'no');
  const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: fd,
  });
  const body = await resp.text();
  if (!resp.ok) return { ok: false, id: null, error: body.substring(0, 300) };
  let id: string | null = null;
  try { id = JSON.parse(body).id; } catch { /* ignore */ }
  return { ok: true, id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    if (!MAILGUN_API_KEY) {
      return new Response(JSON.stringify({ error: 'MAILGUN_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body: OutreachPayload = await req.json();
    if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'recipients array required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const campaignKey = (body.campaignKey || `partner_outreach_${todayIsoDate()}`).toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 64);
    const subject = body.customSubject?.trim() || 'A concierge lab partner for your patients';

    // ── Dry-run: render the first recipient's email and return it ───
    if (body.dryRun) {
      const previewHtml = renderEmail(body.recipients[0], body.customIntro);
      return new Response(JSON.stringify({
        dry_run: true,
        campaign_key: campaignKey,
        subject,
        recipient_count: body.recipients.length,
        preview_html: previewHtml,
        preview_for: body.recipients[0].email,
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const stats = { attempted: 0, sent: 0, skipped_already_contacted: 0, failed: 0 };
    const failures: any[] = [];

    for (const r of body.recipients) {
      stats.attempted++;
      const email = String(r.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) { stats.failed++; failures.push({ email, error: 'invalid_email' }); continue; }

      // Reserve campaign_sends row first
      let claimed = false;
      try { claimed = await claimSendRow(supabase, campaignKey, email); }
      catch (claimErr: any) { stats.failed++; failures.push({ email, error: `claim_err: ${claimErr.message}` }); continue; }

      if (!claimed) { stats.skipped_already_contacted++; continue; }

      // Render + send
      const html = renderEmail(r, body.customIntro);
      const { ok, id, error } = await sendMailgun(email, subject, html);

      if (ok) {
        await finalizeSendRow(supabase, campaignKey, email, id, 'sent');
        stats.sent++;
      } else {
        await finalizeSendRow(supabase, campaignKey, email, null, 'failed', error);
        stats.failed++;
        if (failures.length < 5) failures.push({ email, error });
      }

      await new Promise(r => setTimeout(r, 200)); // 5/sec throttle
    }

    return new Response(JSON.stringify({
      success: true,
      campaign_key: campaignKey,
      fired_at: new Date().toISOString(),
      ...stats,
      failures,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[send-partner-outreach] exception:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
