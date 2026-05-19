/**
 * SEND-MEMBERSHIP-OFFER
 *
 * Admin clicks "Send Membership Offer" next to a patient's chart. We fire
 * a Hormozi-structured SMS + email pair with the Founding-50 scarcity hook
 * and a 1-click CTA that routes the patient to /join?tier=<t>&email=<e>.
 *
 * /join is the existing JoinTier page — it reads tier+email from the URL,
 * looks up the membership_plans row, calls create-checkout-session, and
 * sends the patient to Stripe Checkout. On payment, stripe-webhook's
 * handleMembershipSignup activates the membership (Founding-50 number
 * claim included).
 *
 * Body:
 *   { patient_email, patient_name, patient_phone?, tier, personal_note? }
 * Returns:
 *   { ok, seats_remaining, invite_url, sms_sent, email_sent }
 *
 * Auth: admin / super_admin / office_manager. verify_jwt=false; own auth.
 *
 * Hormozi structure embedded in the copy:
 *   - Scarcity (Founding 50 seat count)
 *   - Stacked value ($474 of value for $199)
 *   - Trust ceremony (you're a current patient + we'd love to have you)
 *   - Friendly out (call us; no pressure)
 *   - One CTA (the link)
 *   - Personal note woven in if admin provides it
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

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
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

interface TierMeta {
  label: string;
  price: number;
  monthly: number;
  stackedValue: number;
  perks: { label: string; value: string }[];
  payoff: string;
}

// Hormozi value-stack per tier. The stacked-value sum is intentionally
// larger than the price so the patient sees an obvious win.
const TIER_META: Record<string, TierMeta> = {
  member: {
    label: 'ConveLabs Member',
    price: 99, monthly: 8.25,
    stackedValue: 254,
    perks: [
      { label: '12 months of Member-tier discounts', value: '$99' },
      { label: 'Morning + Saturday booking access', value: '$50' },
      { label: 'Member-rate family add-ons', value: '$30' },
      { label: 'Free recollection if your draw is rejected', value: 'priceless' },
      { label: 'Lab-history dashboard', value: '$75' },
    ],
    payoff: 'Pays for itself in 2 visits.',
  },
  vip: {
    label: 'VIP Founding Member',
    price: 199, monthly: 16.58,
    stackedValue: 474,
    perks: [
      { label: '12 months of VIP-tier savings', value: '$199' },
      { label: 'Founding rate-lock for life (never raises)', value: '$50/yr' },
      { label: 'Free family add-on — 1 extra member', value: '$75' },
      { label: 'Priority same-day booking (no surcharge)', value: '$150' },
      { label: 'Founding Member # badge + first access to future offerings', value: 'priceless' },
    ],
    payoff: 'Pays for itself in 1 visit.',
  },
  concierge: {
    label: 'Concierge',
    price: 399, monthly: 33.25,
    stackedValue: 925,
    perks: [
      { label: '12 months of Concierge-tier — every visit fee waived', value: '$399' },
      { label: 'Dedicated phlebotomist for your draws', value: '$200' },
      { label: 'Same-day + after-hours included', value: '$250' },
      { label: 'Quarterly lab-results review (white-glove)', value: 'priceless' },
      { label: 'Family + companion add-ons at no extra cost', value: '$76' },
    ],
    payoff: 'For patients who want zero friction.',
  },
};

function escHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) return { ok: false, error: 'mailgun_not_configured' };
  const form = new FormData();
  form.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
  form.append('to', to);
  form.append('subject', subject);
  form.append('html', html);
  form.append('o:tracking-clicks', 'yes');
  const r = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: form,
  });
  if (!r.ok) return { ok: false, error: `mailgun ${r.status}: ${(await r.text()).substring(0, 200)}` };
  return { ok: true };
}

async function sendSMS(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN) return { ok: false, error: 'twilio_not_configured' };
  let normalized = to.replace(/\D/g, '');
  if (normalized.length === 10) normalized = `+1${normalized}`;
  else if (!normalized.startsWith('+')) normalized = `+${normalized}`;
  const form = new URLSearchParams();
  form.append('To', normalized);
  if (TWILIO_MESSAGING_SID) form.append('MessagingServiceSid', TWILIO_MESSAGING_SID);
  else form.append('From', TWILIO_FROM);
  form.append('Body', message);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!r.ok) return { ok: false, error: `twilio ${r.status}: ${(await r.text()).substring(0, 200)}` };
  return { ok: true };
}

function buildEmail(params: {
  patientName: string;
  tier: TierMeta;
  tierKey: string;
  inviteUrl: string;
  personalNote: string | null;
  seatsRemaining: number | null;
}): { subject: string; html: string } {
  const { patientName, tier, tierKey, inviteUrl, personalNote, seatsRemaining } = params;
  const firstName = patientName.split(' ')[0] || 'there';
  const showScarcity = tierKey === 'vip' && seatsRemaining !== null && seatsRemaining > 0 && seatsRemaining <= 50;

  const scarcityBanner = showScarcity
    ? `<div style="background:#FFFBEB;border:2px solid #F59E0B;border-radius:10px;padding:14px;margin:18px 0;text-align:center;">
         <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#92400E;font-weight:700;">Founding 50 — Limited</div>
         <div style="font-size:24px;font-weight:800;color:#7F1D1D;margin-top:4px;">${50 - seatsRemaining} / 50 seats claimed · ${seatsRemaining} left</div>
         <div style="font-size:13px;color:#92400E;margin-top:4px;">Founding members lock the rate for life</div>
       </div>`
    : '';

  const perksRows = tier.perks.map(p =>
    `<tr>
       <td style="padding:8px 0;color:#1F1A17;font-size:14px;">${escHtml(p.label)}</td>
       <td style="padding:8px 0;color:#6B5E54;font-size:14px;text-align:right;font-weight:600;">${escHtml(p.value)}</td>
     </tr>`
  ).join('');

  const noteBlock = personalNote
    ? `<div style="background:#FAF4E8;border-left:3px solid #C9A961;padding:14px 18px;margin:20px 0;border-radius:6px;">
         <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#7F1D1D;font-weight:700;margin-bottom:6px;">A note from your phlebotomy team</div>
         <div style="font-size:14.5px;color:#1F1A17;line-height:1.55;font-style:italic;">${escHtml(personalNote)}</div>
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F5F0E5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1F1A17;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:0.18em;color:#C9A961;font-weight:700;text-transform:uppercase;">ConveLabs</div>
      <h1 style="font-size:28px;color:#7F1D1D;margin:6px 0 0;font-weight:800;line-height:1.2;">An invitation, just for you</h1>
    </div>

    <div style="background:white;border:1px solid #E5DCC8;border-radius:14px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <p style="font-size:16px;margin:0 0 14px;">Hi ${escHtml(firstName)},</p>
      <p style="font-size:15px;line-height:1.6;color:#1F1A17;margin:0 0 14px;">
        I wanted to personally invite you to look at our <strong>${escHtml(tier.label)}</strong> plan. Based on your visits with us, I think it would save you real money over the next 12 months while making every appointment a little more seamless.
      </p>

      ${noteBlock}
      ${scarcityBanner}

      <div style="background:#FBF8F2;border:1px solid #C9A961;border-radius:10px;padding:20px;margin:24px 0;">
        <div style="text-align:center;margin-bottom:14px;">
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#7F1D1D;font-weight:700;">${escHtml(tier.label)} · $${tier.price}/yr</div>
          <div style="font-size:13px;color:#6B5E54;margin-top:4px;">that's ~$${tier.monthly.toFixed(2)}/mo</div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${perksRows}
          <tr><td colspan="2" style="border-top:1.5px solid rgba(201,169,97,0.5);padding-top:10px;"></td></tr>
          <tr>
            <td style="padding:6px 0;color:#7F1D1D;font-weight:700;font-size:15px;">Stacked value</td>
            <td style="padding:6px 0;text-align:right;font-weight:700;font-size:15px;color:#7F1D1D;text-decoration:line-through;">$${tier.stackedValue}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-weight:700;font-size:18px;">Your price</td>
            <td style="padding:4px 0;text-align:right;font-weight:800;font-size:22px;color:#7F1D1D;">$${tier.price}</td>
          </tr>
        </table>
        <p style="margin:14px 0 0;text-align:center;font-size:13px;color:#6B5E54;">${escHtml(tier.payoff)}</p>
      </div>

      <div style="text-align:center;margin:28px 0 16px;">
        <a href="${inviteUrl}" style="display:inline-block;background:#7F1D1D;color:white;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:17px;">
          See the plan + activate →
        </a>
      </div>

      <p style="font-size:13px;color:#6B5E54;text-align:center;margin:0 0 6px;">
        No commitment to click. You'll land on your dashboard, see the full plan side-by-side, and choose if you want to subscribe.
      </p>
      <p style="font-size:13px;color:#6B5E54;text-align:center;margin:0;">
        Questions? Text or call us at <strong style="color:#7F1D1D;">(941) 527-9169</strong> or just reply to this email.
      </p>
    </div>

    <p style="text-align:center;margin:24px 0 0;font-size:13px;color:#6B5E54;">
      Warmly,<br/>
      <strong style="color:#7F1D1D;">Nicodemme Jean-Baptiste</strong><br/>
      ConveLabs · Mobile Phlebotomy
    </p>
  </div>
</body></html>`;

  const subject = tierKey === 'vip'
    ? `${firstName} — your VIP Founding seat (${seatsRemaining ?? 'a few'} left)`
    : `${firstName} — a quick invitation to look at ${tier.label}`;

  return { subject, html };
}

function buildSMS(params: {
  patientName: string;
  tier: TierMeta;
  tierKey: string;
  inviteUrl: string;
  seatsRemaining: number | null;
}): string {
  const { patientName, tier, tierKey, inviteUrl, seatsRemaining } = params;
  const firstName = patientName.split(' ')[0] || 'there';
  const showScarcity = tierKey === 'vip' && seatsRemaining !== null && seatsRemaining > 0;
  const scarcity = showScarcity ? ` Only ${seatsRemaining} Founding seats left.` : '';
  return `Hi ${firstName}! Nico from ConveLabs. I'd love to get you on our ${tier.label} ($${tier.price}/yr — ${tier.payoff.toLowerCase().replace('.', '')}).${scarcity} Tap to see it: ${inviteUrl} — or text back here if you have any questions.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));

    // Auth path A — cron_secret bypass for ops/diagnostic (live-test path).
    // Lets owner ops fire the offer from a script without holding a fresh
    // admin browser session. Same secret used by the daily sweep cron etc.
    let userId: string | null = null;
    const cronSecret = body?.cron_secret;
    const isCronAuth = cronSecret && cronSecret === Deno.env.get('CRON_SECRET');

    if (!isCronAuth) {
      // Auth path B — admin / super_admin / office_manager browser session
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) return new Response(JSON.stringify({ error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const role = (user.user_metadata?.role || user.app_metadata?.role || '').toString();
      if (!['super_admin', 'admin', 'office_manager'].includes(role)) {
        return new Response(JSON.stringify({ error: 'admin_only', role }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = user.id;
    }
    const patientEmail: string = String(body?.patient_email || '').trim().toLowerCase();
    const patientName: string = String(body?.patient_name || '').trim();
    const patientPhoneRaw: string | null = body?.patient_phone ? String(body.patient_phone) : null;
    const tierKey: string = String(body?.tier || 'vip').toLowerCase().trim();
    const personalNote: string | null = body?.personal_note ? String(body.personal_note).trim() : null;

    if (!patientEmail || !patientName) {
      return new Response(JSON.stringify({ error: 'patient_email and patient_name required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const tier = TIER_META[tierKey];
    if (!tier) {
      return new Response(JSON.stringify({ error: 'unknown_tier', tier: tierKey, supported: Object.keys(TIER_META) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Rate limit: don't re-send to the same email within the last hour
    // unless { force: true } is passed. Prevents double-click double-send
    // and accidental harassment. (Gap #9 from the audit.)
    if (!body?.force) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await admin
        .from('membership_offers_sent')
        .select('id, sent_at')
        .eq('patient_email', patientEmail)
        .gte('sent_at', oneHourAgo)
        .limit(1)
        .maybeSingle();
      if (recent) {
        return new Response(JSON.stringify({
          error: 'rate_limited',
          message: `Already sent an offer to ${patientEmail} in the last hour. Pass force:true to override.`,
          last_sent_at: (recent as any).sent_at,
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Pull patient phone from tenant_patients if not provided
    let phone: string | null = patientPhoneRaw;
    if (!phone) {
      const { data: tp } = await admin
        .from('tenant_patients')
        .select('phone, mobile_phone')
        .ilike('email', patientEmail)
        .limit(1)
        .maybeSingle();
      phone = (tp as any)?.mobile_phone || (tp as any)?.phone || null;
    }
    if (!phone) {
      const { data: appt } = await admin
        .from('appointments')
        .select('patient_phone')
        .ilike('patient_email', patientEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      phone = (appt as any)?.patient_phone || null;
    }

    // Founding-50 seats remaining (VIP only). RPC param is `p_tier`, not
    // `tier` — earlier version of this function silently fell back to the
    // default ('vip') which masked the param-name mismatch. Fix + add a
    // direct-query fallback so a renamed RPC doesn't silently kill scarcity.
    let seatsRemaining: number | null = null;
    if (tierKey === 'vip') {
      try {
        const { data: seats } = await admin.rpc('get_founding_seats_status' as any, { p_tier: 'vip' });
        // RPC returns jsonb directly, not an array. Read .remaining off the obj.
        const row: any = seats && typeof seats === 'object' && !Array.isArray(seats) ? seats : (Array.isArray(seats) ? seats[0] : null);
        if (typeof row?.remaining === 'number') seatsRemaining = row.remaining;
      } catch (e: any) {
        console.warn('[send-membership-offer] founding RPC failed:', e?.message);
      }
      if (seatsRemaining === null) {
        // Fallback: count claimed founding member numbers directly.
        const { data: claimed } = await admin
          .from('user_memberships')
          .select('id', { count: 'exact', head: true })
          .not('founding_member_number', 'is', null);
        const claimedN = (claimed as any)?.length ?? (claimed as any)?.count ?? null;
        if (typeof claimedN === 'number') seatsRemaining = Math.max(0, 50 - claimedN);
      }
    }

    // Tracking token — populated in the URL so JoinTier can call the
    // public click-tracking endpoint on mount. Also lets stripe-webhook
    // attribute the eventual conversion to THIS specific offer.
    const trackingToken = crypto.randomUUID().replace(/-/g, '');

    // Construct invite URL — routes to existing JoinTier page which prefills
    // email + maps tier → membership_plans → create-checkout-session.
    // UTM params added so analytics can split organic vs invited conversions
    // (gap #3 from the audit).
    const params = new URLSearchParams({
      tier: tierKey,
      email: patientEmail,
      billing: 'annual',
      src: 'admin_invite',
      invite: trackingToken,
      utm_source: 'admin_chart',
      utm_medium: 'sms_email',
      utm_campaign: 'membership_offer',
      utm_content: tierKey,
    });
    const inviteUrl = `${PUBLIC_SITE_URL}/join?${params.toString()}`;

    // Fire SMS + email in parallel
    const { subject, html } = buildEmail({ patientName, tier, tierKey, inviteUrl, personalNote, seatsRemaining });
    const smsText = buildSMS({ patientName, tier, tierKey, inviteUrl, seatsRemaining });

    const [emailResult, smsResult] = await Promise.all([
      sendEmail(patientEmail, subject, html),
      phone ? sendSMS(phone, smsText) : Promise.resolve({ ok: false, error: 'no_phone_on_file' as string }),
    ]);

    // Audit row — token included so click + conversion can attribute back.
    try {
      await admin.from('membership_offers_sent').insert({
        patient_email: patientEmail,
        patient_name: patientName,
        patient_phone: phone,
        tier: tierKey,
        personal_note: personalNote,
        invite_url: inviteUrl,
        tracking_token: trackingToken,
        sms_sent: smsResult.ok,
        email_sent: emailResult.ok,
        sms_error: smsResult.ok ? null : smsResult.error,
        email_error: emailResult.ok ? null : emailResult.error,
        sent_by: userId,
      });
    } catch (auditErr: any) {
      console.warn('[send-membership-offer] audit insert failed:', auditErr?.message);
    }

    return new Response(JSON.stringify({
      ok: emailResult.ok || smsResult.ok,
      seats_remaining: seatsRemaining,
      invite_url: inviteUrl,
      tracking_token: trackingToken,
      sms_sent: smsResult.ok,
      email_sent: emailResult.ok,
      sms_error: smsResult.ok ? null : smsResult.error,
      email_error: emailResult.ok ? null : emailResult.error,
      phone_used: phone ? `***${phone.replace(/\D/g, '').slice(-4)}` : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[send-membership-offer] unhandled', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
