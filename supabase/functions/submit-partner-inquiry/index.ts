// submit-partner-inquiry — self-sufficient endpoint for /partner-with-us
//
// Does three things atomically:
//   1. Insert the inquiry row (service_role, so no RLS/anon friction)
//   2. Notify admin via Mailgun ("New partner inquiry")
//   3. Send the submitter an auto-reply ("We got it — here's what happens next")
//
// Why an edge function (not direct supabase.from().insert() from client):
//   - PostgREST insert+return requires SELECT grant to anon, which exposes
//     every inquiry to public read. Going through service_role keeps the
//     table admin-read-only.
//   - Auto-reply to the submitter is a transactional, HIPAA-safe email
//     (quiet-hours gate doesn't apply — it's a reply to an action they
//     just took), so it's fine to fire immediately.
//
// Quiet-hours: does NOT apply here. These emails are transactional
// replies to a form the submitter just filled out; HIPAA-irrelevant.

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

interface InquiryPayload {
  practiceName: string;
  contactName: string;
  contactRole?: string;
  contactEmail: string;
  contactPhone?: string;
  practiceType?: string;
  servicesOffered?: string;
  monthlyVolume?: string;
  preferredBilling?: string;
  notes?: string;
  referralSource?: string;
  landingUrl?: string;
}

async function sendMailgun(to: string, subject: string, html: string, replyTo = 'info@convelabs.com') {
  if (!MAILGUN_API_KEY) return;
  const fd = new FormData();
  fd.append('from', `Nico at ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
  fd.append('to', to);
  fd.append('h:Reply-To', replyTo);
  fd.append('subject', subject);
  fd.append('html', html);
  fd.append('o:tracking-clicks', 'no');
  await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: fd,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body: InquiryPayload = await req.json();

    // Minimal validation — practice_name, contact_name, contact_email are NOT NULL
    if (!body.practiceName?.trim() || !body.contactName?.trim() || !body.contactEmail?.trim()) {
      return new Response(
        JSON.stringify({ error: 'practiceName, contactName, and contactEmail are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!body.contactEmail.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'contactEmail must be valid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. INSERT the row (bypasses RLS via service_role)
    const { data: inserted, error: insErr } = await supabase
      .from('provider_partnership_inquiries')
      .insert({
        practice_name: body.practiceName.trim(),
        contact_name: body.contactName.trim(),
        contact_role: body.contactRole?.trim() || null,
        contact_email: body.contactEmail.trim().toLowerCase(),
        contact_phone: body.contactPhone?.trim() || null,
        practice_type: body.practiceType || null,
        services_offered: body.servicesOffered?.trim() || null,
        monthly_patient_volume: body.monthlyVolume || null,
        preferred_billing: body.preferredBilling || null,
        notes: body.notes?.trim() || null,
        referral_source: body.referralSource || 'direct',
        landing_url: body.landingUrl || null,
      })
      .select('id')
      .single();

    if (insErr) {
      console.error('[submit-partner-inquiry] insert failed:', insErr);
      return new Response(
        JSON.stringify({ error: `Failed to submit: ${insErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const inquiryId = (inserted as any)?.id;

    // 2. NOTIFY ADMIN (fire-and-forget — don't block the submitter)
    const adminNote = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:20px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;font-size:18px;">🤝 New partner inquiry</h2>
          <p style="margin:4px 0 0;opacity:.9;font-size:13px;">${escapeHtml(body.practiceName)}</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 12px 12px;font-size:14px;line-height:1.6;color:#111;">
          <p><strong>Contact:</strong> ${escapeHtml(body.contactName)}${body.contactRole ? ' (' + escapeHtml(body.contactRole) + ')' : ''}</p>
          <p><strong>Email:</strong> <a href="mailto:${escapeHtml(body.contactEmail)}">${escapeHtml(body.contactEmail)}</a></p>
          ${body.contactPhone ? `<p><strong>Phone:</strong> <a href="tel:${escapeHtml(body.contactPhone)}">${escapeHtml(body.contactPhone)}</a></p>` : ''}
          ${body.practiceType ? `<p><strong>Practice type:</strong> ${escapeHtml(body.practiceType)}</p>` : ''}
          ${body.monthlyVolume ? `<p><strong>Volume:</strong> ${escapeHtml(body.monthlyVolume)} patients/mo</p>` : ''}
          ${body.preferredBilling ? `<p><strong>Preferred billing:</strong> ${escapeHtml(body.preferredBilling)}</p>` : ''}
          ${body.servicesOffered ? `<p><strong>Services offered:</strong><br>${escapeHtml(body.servicesOffered).replace(/\n/g, '<br>')}</p>` : ''}
          ${body.notes ? `<p><strong>Notes:</strong><br>${escapeHtml(body.notes).replace(/\n/g, '<br>')}</p>` : ''}
          <hr style="border:0;border-top:1px solid #e5e7eb;margin:16px 0;">
          <p style="margin:0;font-size:13px;">Inquiry ID: <code>${inquiryId}</code></p>
          <p style="margin:6px 0 0;font-size:12px;color:#666;">Follow up within 24 hours. Manage at /dashboard/super_admin/organizations.</p>
        </div>
      </div>`;
    sendMailgun('info@convelabs.com', `🤝 Partner inquiry — ${body.practiceName}`, adminNote, body.contactEmail).catch(() => {});

    // 3. AUTO-REPLY TO SUBMITTER (warm founder-voice confirmation)
    const firstName = (body.contactName || '').trim().split(/\s+/)[0] || 'there';
    const submitterReply = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">
        <div style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);color:#fff;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="margin:0;font-size:22px;">Got it — thanks, ${escapeHtml(firstName)}.</h1>
          <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">Founder, ConveLabs Concierge Lab Services</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;padding:28px 24px;border-radius:0 0 12px 12px;color:#111827;line-height:1.65;font-size:14.5px;">
          <p>Your partnership inquiry for <strong>${escapeHtml(body.practiceName)}</strong> just landed in my inbox.</p>
          <p>I read every one personally and reply within 24 hours — usually faster on weekdays. Here's what happens next:</p>

          <ol style="padding-left:20px;margin:14px 0;line-height:1.8;">
            <li>I review your practice info and reply with a short proposal — pricing, timelines, and any questions.</li>
            <li>If it's a fit, we hop on a 10-minute call to finalize the terms and figure out your first week.</li>
            <li>We spin up your branded portal, add your team, and you're live in under 48 hours from "yes."</li>
          </ol>

          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:18px 0;">
            <p style="margin:0 0 4px;font-size:13px;color:#7f1d1d;font-weight:700;">Want to skip the wait?</p>
            <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.5;">
              Call me directly: <a href="tel:+19415279169" style="color:#B91C1C;font-weight:600;">(941) 527-9169</a> &nbsp;·&nbsp;
              Email: <a href="mailto:info@convelabs.com" style="color:#B91C1C;font-weight:600;">info@convelabs.com</a>
            </p>
          </div>

          <p style="margin:20px 0 6px;">Thanks for considering us. The providers who've partnered with ConveLabs aren't just a client list to me — they're the reason this business gets to exist.</p>
          <p style="margin:16px 0 0;">With gratitude,<br>
          <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
          <em>Founder, ConveLabs</em></p>

          <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0 14px;">
          <p style="font-size:11px;color:#9ca3af;text-align:center;margin:0;line-height:1.55;">
            This is an automated confirmation of your partnership inquiry.<br>
            ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169
          </p>
        </div>
      </div>`;
    sendMailgun(body.contactEmail, `Thanks for reaching out — here's what happens next`, submitterReply).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, inquiryId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[submit-partner-inquiry] exception:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
