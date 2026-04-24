/**
 * SEND-ORG-WELCOME
 *
 * Fires immediately after a new organization is created from the admin
 * OrganizationsTab. Builds a Hormozi-structured "force-multiplier gift"
 * welcome email (patient-outcome + provider-ease framing, zero sell),
 * mints an activation magic link, and emails it via Mailgun.
 *
 * Activation link strategy (mirrors request-provider-claim):
 *  - If auth.users row exists → generate 'recovery' magic link
 *  - If not → inviteUserByEmail
 *  - Either way → redirect to /reset-password so they set a password,
 *    then get routed to /dashboard/provider
 *
 * Body: { organization_id: string, resend?: boolean }
 *   - resend=true bypasses the "already welcomed" guard (welcomed_at stamp)
 *
 * Idempotent: a successful send stamps organizations.welcomed_at; re-invokes
 * without resend=true return ok:true, skipped:true.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function findAuthUserByEmail(email: string): Promise<string | null> {
  try {
    for (let page = 1; page <= 10; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (!data?.users?.length) return null;
      const hit = data.users.find((u: any) => (u.email || '').toLowerCase() === email);
      if (hit) return hit.id;
      if (data.users.length < 100) return null;
    }
  } catch { /* noop */ }
  return null;
}

async function mintActivationLink(email: string, orgId: string, orgName: string, contactName: string | null): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const existingId = await findAuthUserByEmail(normalized);

  if (existingId) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: normalized,
      options: { redirectTo: `${PUBLIC_SITE_URL}/reset-password` },
    });
    if (error || !data?.properties?.action_link) {
      throw new Error(`recovery link failed: ${error?.message || 'unknown'}`);
    }
    return data.properties.action_link;
  }

  // SKIP inviteUserByEmail entirely — it depends on Supabase's built-in SMTP
  // which is not configured for this project (we use Mailgun). When SMTP is
  // misconfigured, inviteUserByEmail returns an empty {} error and doesn't
  // create the user at all (observed 2026-04-24 for Solomon Healthcare).
  //
  // Instead: createUser with email_confirm=true (so no confirmation email is
  // attempted) THEN generate a recovery link. Supabase generateLink({type:
  // 'recovery'}) only needs the user to exist and returns an action_link
  // directly — we mail it ourselves via Mailgun, bypassing Supabase SMTP.
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email: normalized,
    email_confirm: true,
    user_metadata: { role: 'provider', org_id: orgId, full_name: contactName || orgName, org_name: orgName },
  });

  if (createErr) {
    // If the error really is "already exists", try listing again and proceed
    // (race between findAuthUserByEmail pagination and createUser). If not,
    // surface the full context.
    const msg = String(createErr.message || '').toLowerCase();
    if (!/already|registered|exists|duplicate/.test(msg)) {
      throw new Error(`createUser failed: ${createErr.message || JSON.stringify(createErr)}`);
    }
  }

  const { data: recData, error: recErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: normalized,
    options: { redirectTo: `${PUBLIC_SITE_URL}/reset-password` },
  });
  if (recErr || !recData?.properties?.action_link) {
    throw new Error(`recovery link failed after create: ${recErr?.message || 'no action_link'}`);
  }
  return recData.properties.action_link;
}

function buildHtml(params: {
  orgName: string;
  contactName: string | null;
  activationUrl: string;
}): string {
  const { orgName, contactName, activationUrl } = params;
  const greeting = contactName ? `Dr. ${contactName.split(' ').slice(-1)[0]}` : 'there';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome to ConveLabs</title>
</head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

      <!-- Hero header -->
      <tr><td style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);padding:40px 32px;text-align:center;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#fecaca;margin-bottom:8px;">ConveLabs</div>
        <h1 style="margin:0;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:normal;">The tool your patients will thank you for.</h1>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:36px 32px 24px;">
        <p style="margin:0 0 16px;color:#111827;font-size:16px;line-height:1.6;">Hi ${greeting} — Nico here, founder of ConveLabs.</p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;"><strong>${orgName}</strong> is now in our provider network — which means any patient you see today can have their blood drawn at their kitchen table, on their schedule.</p>
        <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">You don't pay us anything. Your practice stays out of the billing loop. We just help your patients actually show up to their blood work.</p>

        <!-- Billing clarity — up front so no surprises -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:28px;">
          <tr><td style="padding:14px 18px;">
            <p style="margin:0;color:#78350f;font-size:13px;line-height:1.6;"><strong style="color:#92400e;">One thing to know:</strong> we don't bill insurance for our service. Your patient pays a flat out-of-pocket fee for the at-home draw (their insurance still covers the actual lab tests via LabCorp / Quest / AdventHealth). Most patients tell us it's cheaper than their copay + time off work.</p>
          </td></tr>
        </table>

        <!-- What patients get -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:20px 22px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#B91C1C;font-weight:bold;margin-bottom:12px;">What your patients get</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding:6px 0;color:#374151;font-size:14px;">🏠&nbsp;&nbsp;Licensed phlebotomist at their door</td></tr>
              <tr><td style="padding:6px 0;color:#374151;font-size:14px;">📅&nbsp;&nbsp;Same-day or morning/evening slots</td></tr>
              <tr><td style="padding:6px 0;color:#374151;font-size:14px;">💳&nbsp;&nbsp;Their insurance still covers the lab tests</td></tr>
              <tr><td style="padding:6px 0;color:#374151;font-size:14px;">📲&nbsp;&nbsp;SMS tracking from draw → lab → results</td></tr>
              <tr><td style="padding:6px 0;color:#374151;font-size:14px;">⭐&nbsp;&nbsp;<strong>5.0</strong> · 164 reviews · NFL-trusted</td></tr>
            </table>
          </td></tr>
        </table>

        <!-- What you do in 30s -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:28px;">
          <tr><td style="padding:20px 22px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#166534;font-weight:bold;margin-bottom:12px;">What you do — in 30 seconds</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding:6px 0;color:#15803d;font-size:14px;"><strong>1️⃣</strong>&nbsp;&nbsp;Click "Refer this patient" in your dashboard</td></tr>
              <tr><td style="padding:6px 0;color:#15803d;font-size:14px;"><strong>2️⃣</strong>&nbsp;&nbsp;Enter name + phone — we text them the booking link</td></tr>
              <tr><td style="padding:6px 0;color:#15803d;font-size:14px;"><strong>3️⃣</strong>&nbsp;&nbsp;Get a ping the moment their specimen hits the lab</td></tr>
            </table>
            <p style="margin:12px 0 0;color:#166534;font-size:13px;line-height:1.6;">That's it. We handle the draw, the delivery, the follow-up. You just stop losing patients to "I'll go next week."</p>
          </td></tr>
        </table>

        <!-- Reminder flywheel — the #1 provider pain-point fix -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:2px solid #B91C1C;border-radius:12px;margin-bottom:28px;">
          <tr><td style="padding:20px 22px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#B91C1C;font-weight:bold;margin-bottom:6px;">★ The no-show killer</div>
            <p style="margin:0 0 12px;color:#111827;font-size:15px;line-height:1.6;font-weight:600;">We stop your patients from forgetting their blood work.</p>
            <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.7;">Every referred patient gets auto-reminders to schedule with us — SMS + email, on a cadence you control. You pick the deadline: "draw required within 7 days of their next appointment" or "2 weeks before follow-up."</p>
            <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.7;"><strong style="color:#B91C1C;">If the patient doesn't schedule by your deadline</strong>, your dashboard lights up with an overdue flag and your team gets an email with the patient's name and last reminder date. Your MA or front desk can reach out while there's still time to reschedule the appointment or get the labs done — no more "we'll have to reschedule you, your labs aren't back."</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
              <tr>
                <td style="width:33%;text-align:center;padding:10px 6px;background:#fef2f2;border-radius:8px;">
                  <div style="font-size:22px;margin-bottom:4px;">📩</div>
                  <div style="font-size:11px;color:#991B1B;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">Patient reminded</div>
                  <div style="font-size:11px;color:#6b7280;margin-top:2px;">SMS + email</div>
                </td>
                <td style="width:4%;"></td>
                <td style="width:29%;text-align:center;padding:10px 6px;background:#fef2f2;border-radius:8px;">
                  <div style="font-size:22px;margin-bottom:4px;">⏰</div>
                  <div style="font-size:11px;color:#991B1B;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">Deadline hits</div>
                  <div style="font-size:11px;color:#6b7280;margin-top:2px;">You set it</div>
                </td>
                <td style="width:4%;"></td>
                <td style="width:30%;text-align:center;padding:10px 6px;background:#fef2f2;border-radius:8px;">
                  <div style="font-size:22px;margin-bottom:4px;">🔔</div>
                  <div style="font-size:11px;color:#991B1B;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">You're notified</div>
                  <div style="font-size:11px;color:#6b7280;margin-top:2px;">Team follows up</div>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- From collection to lab — visibility chain -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;margin-bottom:28px;">
          <tr><td style="padding:20px 22px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#075985;font-weight:bold;margin-bottom:12px;">From draw → lab — you stay in the loop</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding:6px 0;color:#0c4a6e;font-size:14px;line-height:1.6;"><strong>✓ Draw complete</strong> — you see it the minute the phleb finishes</td></tr>
              <tr><td style="padding:6px 0;color:#0c4a6e;font-size:14px;line-height:1.6;"><strong>✓ En route to lab</strong> — carrier + expected drop-off time on your dashboard</td></tr>
              <tr><td style="padding:6px 0;color:#0c4a6e;font-size:14px;line-height:1.6;"><strong>✓ Specimen delivered</strong> — you get an email with the <strong>lab-generated tracking ID</strong> the moment it's accepted at LabCorp / Quest / AdventHealth</td></tr>
              <tr><td style="padding:6px 0;color:#0c4a6e;font-size:14px;line-height:1.6;"><strong>✓ Results rail</strong> — results flow to you via your normal lab results pipeline, same as always</td></tr>
            </table>
            <p style="margin:12px 0 0;color:#075985;font-size:13px;line-height:1.6;">That tracking ID is your receipt. If a patient ever says "I don't see my results" or your team needs to locate a sample, you have the ID one click away.</p>
          </td></tr>
        </table>

        <!-- CTA 1 -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
          <tr><td align="center">
            <a href="${activationUrl}" style="display:inline-block;background:#B91C1C;color:#ffffff;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:0.3px;box-shadow:0 4px 12px rgba(185,28,28,0.25);">Activate my dashboard →</a>
          </td></tr>
        </table>

        <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#6b7280;font-weight:bold;">What you'll see inside</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
          <tr><td style="padding:6px 0;color:#374151;font-size:14px;">👤&nbsp;&nbsp;<strong>"Refer a patient"</strong> — send their booking link in one tap</td></tr>
          <tr><td style="padding:6px 0;color:#374151;font-size:14px;">⏰&nbsp;&nbsp;<strong>Reminder cadence per patient</strong> — set the deadline for their draw</td></tr>
          <tr><td style="padding:6px 0;color:#374151;font-size:14px;">🚨&nbsp;&nbsp;<strong>Overdue alerts</strong> — see which patients haven't scheduled yet</td></tr>
          <tr><td style="padding:6px 0;color:#374151;font-size:14px;">📋&nbsp;&nbsp;Next-appointment reminders per patient</td></tr>
          <tr><td style="padding:6px 0;color:#374151;font-size:14px;">🔔&nbsp;&nbsp;"Sample delivered" pings — with tracking ID</td></tr>
          <tr><td style="padding:6px 0;color:#374151;font-size:14px;">📊&nbsp;&nbsp;Every patient you've referred, in one list</td></tr>
          <tr><td style="padding:6px 0;color:#374151;font-size:14px;">👥&nbsp;&nbsp;Add your staff (MA, front desk) — zero seat cost</td></tr>
        </table>

        <!-- FAQ -->
        <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#6b7280;font-weight:bold;">Three quick answers</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
          <tr><td style="padding:8px 0;color:#374151;font-size:13px;border-bottom:1px solid #f3f4f6;"><strong>Do you bill insurance?</strong><br><span style="color:#6b7280;">No — our at-home draw fee is out-of-pocket for the patient. Their insurance still covers the actual lab tests via the lab's normal rail.</span></td></tr>
          <tr><td style="padding:8px 0;color:#374151;font-size:13px;border-bottom:1px solid #f3f4f6;"><strong>Does my practice pay anything?</strong><br><span style="color:#6b7280;">No. Ever.</span></td></tr>
          <tr><td style="padding:8px 0;color:#374151;font-size:13px;"><strong>What if they already have Quest?</strong><br><span style="color:#6b7280;">We deliver to Quest too. Results rail stays intact.</span></td></tr>
        </table>

        <!-- CTA 2 -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr><td align="center">
            <a href="${activationUrl}" style="display:inline-block;background:#B91C1C;color:#ffffff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Activate my dashboard</a>
          </td></tr>
        </table>

        <!-- Signature -->
        <p style="margin:24px 0 4px;color:#111827;font-size:15px;">— Nico Ferdinand</p>
        <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">Founder, ConveLabs<br>(941) 527-9169 · I read every reply</p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#faf7f2;padding:20px 32px;text-align:center;border-top:1px solid #f3f4f6;">
        <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">ConveLabs, Inc. · 1800 Pembrook Dr, Suite 300, Orlando FL 32810<br>Licensed mobile phlebotomy · HIPAA compliant</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { organization_id, resend } = await req.json();
    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: org } = await admin.from('organizations')
      .select('id, name, contact_name, contact_email, billing_email, cc_emails, portal_enabled, welcomed_at')
      .eq('id', organization_id)
      .maybeSingle();

    if (!org) {
      return new Response(JSON.stringify({ error: 'organization_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (org.welcomed_at && !resend) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'already_welcomed' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const recipient = org.contact_email || org.billing_email;
    if (!recipient) {
      return new Response(JSON.stringify({ error: 'no_contact_email', message: 'Add a contact_email before welcoming this org.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Make sure portal is enabled so the activation link actually lands somewhere
    if (!org.portal_enabled) {
      await admin.from('organizations').update({ portal_enabled: true }).eq('id', org.id);
    }

    // Mint activation magic link
    const activationUrl = await mintActivationLink(recipient, org.id, org.name, org.contact_name);

    // Build + send email
    if (!MAILGUN_API_KEY) {
      return new Response(JSON.stringify({ error: 'mailgun_not_configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = buildHtml({ orgName: org.name, contactName: org.contact_name, activationUrl });
    // CC any additional staff emails stored on the org row
    const ccList: string[] = Array.isArray((org as any).cc_emails)
      ? ((org as any).cc_emails as string[]).filter(e => e && e.includes('@') && e.toLowerCase() !== recipient.toLowerCase())
      : [];

    const fd = new FormData();
    fd.append('from', `Nico Ferdinand <nico@${MAILGUN_DOMAIN}>`);
    fd.append('h:Reply-To', 'nico@convelabs.com');
    fd.append('to', recipient);
    for (const cc of ccList) fd.append('cc', cc);
    fd.append('subject', `${org.contact_name ? 'Dr. ' + org.contact_name.split(' ').slice(-1)[0] + ' — ' : ''}your patient referral tool is live`);
    fd.append('html', html);
    fd.append('o:tag', 'org_welcome');
    fd.append('o:tracking-clicks', 'yes');

    const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: fd,
    });

    if (!mgRes.ok) {
      const errBody = await mgRes.text().catch(() => '');
      console.error('[org-welcome] mailgun failed', mgRes.status, errBody.slice(0, 200));
      return new Response(JSON.stringify({ error: 'mailgun_failed', status: mgRes.status }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stamp welcomed_at + audit log
    await admin.from('organizations').update({ welcomed_at: new Date().toISOString() }).eq('id', org.id);
    await admin.from('email_send_log').insert({
      to_email: recipient,
      campaign_tag: 'org_welcome',
      sent_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok: true, sent_to: recipient, activation_url: activationUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[org-welcome] unhandled:', e?.message);
    return new Response(JSON.stringify({ error: 'unhandled', message: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
