// Create a scoped staff invitation.
// Requires authenticated caller with role_level >= invitee's role_level, or super_admin.
// Sends a Mailgun email with the full offer stack (pay, start date, location, role).
//
// Body: { email, firstName, lastName, phone?, role, roleLevel,
//         tenantId?, locationId?, territoryId?,
//         payRateCents?, startDate?, inviteType?, referredBy?, referralBountyCents? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LEVEL_ORDER: Record<string, number> = {
  staff: 10,
  supervisor: 20,
  manager: 30,
  director: 40,
  executive: 50,
};

const SUPER_ADMIN = 100;

const SITE_URL = Deno.env.get('SITE_URL') || 'https://convelabs.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve the calling user from their JWT
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !caller) return json({ error: 'Invalid token' }, 401);

    const callerRole = (caller.user_metadata?.role as string | undefined) || '';
    const callerIsSuper = callerRole === 'super_admin' || callerRole === 'admin' || callerRole === 'owner';

    // Resolve caller's role_level from staff_profiles → staff_role_definitions (if not super)
    let callerLevelRank = callerIsSuper ? SUPER_ADMIN : 0;
    if (!callerIsSuper) {
      const { data: profile } = await admin
        .from('staff_profiles')
        .select('id, specialty')
        .eq('user_id', caller.id)
        .maybeSingle();
      if (profile?.specialty) {
        const { data: rd } = await admin
          .from('staff_role_definitions')
          .select('role_level')
          .eq('role_name', profile.specialty)
          .maybeSingle();
        callerLevelRank = LEVEL_ORDER[rd?.role_level || 'staff'] || 0;
      }
    }

    const body = await req.json();
    const {
      email, firstName, lastName, phone, role, roleLevel,
      tenantId, locationId, territoryId,
      payRateCents, startDate, inviteType = 'hire',
      referredBy, referralBountyCents,
    } = body;

    if (!email || !firstName || !lastName || !role || !roleLevel) {
      return json({ error: 'email, firstName, lastName, role, roleLevel are required' }, 400);
    }

    const inviteeLevelRank = LEVEL_ORDER[roleLevel] || 0;
    if (!inviteeLevelRank) return json({ error: `Invalid roleLevel: ${roleLevel}` }, 400);

    // Caller must be at or above invitee's level
    if (callerLevelRank < inviteeLevelRank) {
      return json({
        error: `You don't have authority to invite at level "${roleLevel}". Your level rank is ${callerLevelRank}, needed ${inviteeLevelRank}.`,
      }, 403);
    }

    // Reject if email already has an active (pending) invite or is already a staff user
    const { data: existing } = await admin
      .from('staff_invitations')
      .select('id, status, expires_at')
      .eq('email', email.toLowerCase())
      .in('status', ['pending', 'sent'])
      .maybeSingle();
    if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
      return json({ error: 'An active invitation already exists for this email' }, 409);
    }

    const { data: existingAuth } = await admin.auth.admin.listUsers();
    const emailLower = email.toLowerCase();
    const alreadyUser = existingAuth?.users?.find(u => u.email?.toLowerCase() === emailLower);
    if (alreadyUser) {
      const { data: profile } = await admin
        .from('staff_profiles')
        .select('id')
        .eq('user_id', alreadyUser.id)
        .maybeSingle();
      if (profile) return json({ error: 'This user already has a staff profile' }, 409);
    }

    // Generate invitation token (128-bit random, URL-safe)
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72h

    const { data: invite, error: insertErr } = await admin
      .from('staff_invitations')
      .insert({
        email: emailLower,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        role,
        invitation_token: token,
        status: 'sent',
        expires_at: expiresAt,
        sent_at: new Date().toISOString(),
        invited_by: caller.id,
        tenant_id: tenantId || null,
        location_id: locationId || null,
        territory_id: territoryId || null,
        pay_rate_cents: payRateCents ?? null,
        start_date: startDate || null,
        invite_type: inviteType,
        referred_by: referredBy || null,
        referral_bounty_cents: referralBountyCents ?? null,
      })
      .select('*')
      .single();

    if (insertErr) throw insertErr;

    // Send Mailgun email with the full offer stack
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

    if (MAILGUN_API_KEY) {
      const acceptUrl = `${SITE_URL}/accept-invite?token=${token}`;
      const pay = payRateCents ? `$${(payRateCents / 100).toFixed(2)}/hr` : null;

      const formData = new FormData();
      formData.append('from', 'ConveLabs Hiring <hiring@mg.convelabs.com>');
      formData.append('to', email);
      formData.append('subject', `Your offer at ConveLabs — ${role}${pay ? `, ${pay}` : ''}`);
      formData.append('html', renderOfferEmail({
        firstName, role, pay, startDate, acceptUrl,
        referralBountyCents,
      }));

      const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: formData,
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.error('Mailgun send failed:', errText);
      }
    }

    // Audit log (fire-and-forget)
    await admin.from('staff_audit_logs').insert({
      change_type: 'invitation_created',
      new_values: { invitation_id: invite.id, invitee_email: email, role, invite_type: inviteType },
      changed_by: caller.id,
    }).then(() => {}, () => {});

    return json({
      success: true,
      invitation: {
        id: invite.id,
        email: invite.email,
        expires_at: invite.expires_at,
        accept_url: `${SITE_URL}/accept-invite?token=${token}`,
      },
    });
  } catch (e: any) {
    console.error('create-staff-invitation error:', e);
    return json({ error: e.message || 'Unknown error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function renderOfferEmail(opts: {
  firstName: string;
  role: string;
  pay: string | null;
  startDate: string | null;
  acceptUrl: string;
  referralBountyCents?: number | null;
}) {
  const { firstName, role, pay, startDate, acceptUrl, referralBountyCents } = opts;
  const startLine = startDate ? `<li><strong>Start date:</strong> ${startDate}</li>` : '';
  const payLine = pay ? `<li><strong>Pay:</strong> ${pay}</li>` : '';
  const bountyLine = referralBountyCents
    ? `<li><strong>Referral bonus:</strong> $${(referralBountyCents / 100).toFixed(0)} after your 10th billable visit</li>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;font-size:24px;">Welcome to ConveLabs, ${firstName}!</h1>
        <p style="margin:8px 0 0;font-size:14px;opacity:0.9;">Your offer is ready</p>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
        <p style="font-size:16px;">We're excited to bring you on as a <strong>${role}</strong>.</p>

        <div style="background:#F9FAFB;border-left:4px solid #B91C1C;padding:16px;margin:16px 0;border-radius:4px;">
          <ul style="margin:0;padding-left:20px;line-height:1.8;">
            <li><strong>Role:</strong> ${role}</li>
            ${payLine}
            ${startLine}
            ${bountyLine}
          </ul>
        </div>

        <p>Click below to accept and complete your onboarding in under 10 minutes:</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${acceptUrl}" style="background:#B91C1C;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
            Accept Offer & Start Onboarding →
          </a>
        </p>

        <p style="font-size:13px;color:#6b7280;">This invitation expires in 72 hours. Once accepted, you'll get access to your dashboard, training videos, and your first scheduled shifts.</p>
        <p style="font-size:13px;color:#6b7280;">Questions? Reply to this email or call (941) 527-9169.</p>
        <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
      </div>
    </div>`;
}
