// invite-team-member
// Lets an existing provider (role='provider') invite a teammate to their org.
// Creates the auth user with role='provider' + org_id in user_metadata, then
// sends a welcome SMS (if phone) + email with a magic login link.
//
// Request: { email, name, phone?, org_id }  (authenticated as a provider whose
//          user_metadata.org_id matches this org_id — verified server-side)
// Response: { success: true, user_id, magic_link? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const { email, name, phone, org_id } = body;
    if (!email || !org_id) return new Response(JSON.stringify({ error: 'email and org_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const normalizedEmail = String(email).trim().toLowerCase();

    // Verify caller is authenticated and belongs to org_id
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: caller } = await admin.auth.getUser(token);
    const callerOrg = caller?.user?.user_metadata?.org_id;
    const callerRole = caller?.user?.user_metadata?.role;
    if (!caller?.user || callerOrg !== org_id || callerRole !== 'provider') {
      return new Response(JSON.stringify({ error: 'Not authorized to invite to this org' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify org exists and is active
    const { data: org } = await admin.from('organizations').select('id, name').eq('id', org_id).eq('is_active', true).maybeSingle();
    if (!org) return new Response(JSON.stringify({ error: 'Organization not found or inactive' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Find existing user or create new
    const allUsers: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data: pg } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      const u = pg?.users || [];
      allUsers.push(...u);
      if (u.length < 1000) break;
    }
    const existing = allUsers.find((u: any) => u.email?.toLowerCase() === normalizedEmail);

    let userId: string;
    const metadata = { role: 'provider', org_id, org_name: org.name, invited_by: caller.user.email, source: 'team_invite', ...(name ? { full_name: name } : {}) };

    if (existing) {
      userId = existing.id;
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...existing.user_metadata, ...metadata },
        ...(phone ? { phone: normalizePhone(phone), phone_confirm: true } : {}),
        email_confirm: true,
      });
    } else {
      const createPayload: any = {
        email: normalizedEmail,
        email_confirm: true,
        user_metadata: metadata,
      };
      if (phone) {
        createPayload.phone = normalizePhone(phone);
        createPayload.phone_confirm = true;
      }
      const { data: created, error: createErr } = await admin.auth.admin.createUser(createPayload);
      if (createErr || !created?.user) {
        return new Response(JSON.stringify({ error: createErr?.message || 'Failed to create user' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = created.user.id;
    }

    // Generate a magic link
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: 'magiclink', email: normalizedEmail,
      options: { redirectTo: `${PUBLIC_SITE_URL}/dashboard/provider` },
    });
    const magicLink = linkData?.properties?.action_link || `${PUBLIC_SITE_URL}/provider?email=${encodeURIComponent(normalizedEmail)}`;

    // Send welcome email via Mailgun
    if (MAILGUN_API_KEY) {
      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="margin:0;font-size:20px;">You're invited to ${org.name}'s portal</h1>
          <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">ConveLabs Concierge Lab Services</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 12px 12px;line-height:1.6;">
          <p>Hi${name ? ' ' + name : ''},</p>
          <p><strong>${caller.user.user_metadata?.full_name || caller.user.email}</strong> added you to <strong>${org.name}</strong>'s ConveLabs provider portal.</p>
          <p>You can now schedule lab visits, see patients, track specimens, and manage billing on behalf of ${org.name}.</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${magicLink}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Open my portal →</a>
          </div>
          <p style="font-size:12px;color:#6b7280;">This link signs you in directly. After, you'll be able to set a password or use phone sign-in like everyone else on the team.</p>
          <p style="margin-top:20px;">Questions? Email <a href="mailto:info@convelabs.com" style="color:#B91C1C;">info@convelabs.com</a> or call (941) 527-9169.</p>
          <p style="margin:16px 0 0;">— Nicodemme "Nico" Jean-Baptiste<br><em>Founder, ConveLabs Concierge Lab Services</em></p>
        </div>
      </div>`;
      const fd = new FormData();
      fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
      fd.append('to', normalizedEmail);
      fd.append('subject', `You've been added to ${org.name}'s ConveLabs portal`);
      fd.append('html', html);
      fd.append('o:tracking-clicks', 'no');
      await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: fd,
      });
    }

    // Optional: SMS too if phone provided
    if (phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      try {
        const smsBody = `ConveLabs: ${caller.user.user_metadata?.full_name || 'Your team'} added you to ${org.name}'s portal. Open: ${PUBLIC_SITE_URL}/provider?email=${encodeURIComponent(normalizedEmail)}`;
        const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
        const formBody = new URLSearchParams({ To: normalizePhone(phone), From: TWILIO_FROM, Body: smsBody });
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody.toString(),
        });
      } catch (e) { console.warn('SMS invite failed:', e); }
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('invite-team-member error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
