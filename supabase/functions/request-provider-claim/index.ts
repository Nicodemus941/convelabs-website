// request-provider-claim
// Provider enters their email on the login page. If we have them on file
// (organizations.contact_email / billing_email OR patient_referring_providers),
// email them a tokenized claim link that activates their portal.
//
// Hormozi UX: one field, instant feedback, warm negative path.
//   - Match → send claim link, show "check your email"
//   - No match → friendly "not on file yet — let's get you started" w/ partner-link
//   - Rate-limited: same email 3x in 10 min = friendly cooldown
//
// BUG FIX 2026-04-22: prior version only worked if the provider had never been
// invited. If auth.users already had the email (common after a prior invite or
// manual account creation), inviteUserByEmail returned a 422 whose shape the
// "already registered" regex didn't catch → 500, empty detail, spinner died
// with no message. Elite Medical Concierge hit this.
// New flow: probe auth.users first. If exists → generate a recovery link. Else
// → invite. Either way we send our branded email with a working link.

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
  // Supabase doesn't offer a direct lookup by email; paginate admin.listUsers
  // until found or exhausted. Bounded to ~1000 users — fine for B2B scale.
  try {
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (error || !data?.users?.length) return null;
      const hit = data.users.find((u: any) => (u.email || '').toLowerCase() === email);
      if (hit) return hit.id;
      if (data.users.length < 100) return null;
    }
  } catch { /* fall through */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ ok: false, reason: 'bad_email' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const normalized = email.trim().toLowerCase();

    // Rate-limit: same email 3+ requests in 10 min → cooldown
    const { count: recentCount } = await admin.from('email_send_log')
      .select('id', { count: 'exact', head: true })
      .eq('to_email', normalized)
      .eq('campaign_tag', 'provider_claim_request')
      .gte('sent_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());
    if ((recentCount || 0) >= 3) {
      return new Response(JSON.stringify({ ok: false, reason: 'cooldown' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // PATH 1 — look in organizations table
    const { data: orgByEmail } = await admin.from('organizations')
      .select('id, name, contact_email, billing_email, contact_name, portal_enabled, is_active')
      .or(`contact_email.ilike.${normalized},billing_email.ilike.${normalized}`)
      .limit(1)
      .maybeSingle();

    // PATH 2 — look in patient_referring_providers (acquisition loop)
    const { data: refProvider } = await admin.from('patient_referring_providers')
      .select('id, provider_name, practice_name, practice_email, practice_phone, claim_token, matched_org_id, status')
      .ilike('practice_email', normalized)
      .is('matched_org_id', null)
      .order('discovered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!orgByEmail && !refProvider) {
      return new Response(JSON.stringify({
        ok: false, reason: 'not_found',
        partner_url: `${PUBLIC_SITE_URL}/partner-with-us`,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let claimUrl: string;
    let displayName: string;

    if (orgByEmail) {
      displayName = orgByEmail.name;
      const existingUserId = await findAuthUserByEmail(normalized);

      if (existingUserId) {
        // User already exists — generate a recovery (password-reset) magic link.
        // This works whether or not they've ever set a password.
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email: normalized,
          options: { redirectTo: `${PUBLIC_SITE_URL}/dashboard/provider` },
        });
        if (linkErr || !linkData?.properties?.action_link) {
          console.error('[request-provider-claim] recovery link failed', linkErr);
          return new Response(JSON.stringify({
            ok: false, reason: 'link_failed',
            detail: linkErr?.message || 'Could not generate recovery link',
          }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        claimUrl = linkData.properties.action_link;
      } else {
        // Net-new user — invite creates the row + sends Supabase's default email;
        // we also fire a branded one with the action link.
        const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(normalized, {
          data: { role: 'provider', org_id: orgByEmail.id, full_name: orgByEmail.contact_name || orgByEmail.name },
          redirectTo: `${PUBLIC_SITE_URL}/dashboard/provider`,
        });
        // Belt-and-suspenders: if invite somehow fails with already-exists, retry recovery path
        if (inviteErr) {
          const msg = String(inviteErr.message || '').toLowerCase();
          const looksAlreadyRegistered = /already|registered|exists|duplicate/.test(msg) || (inviteErr as any)?.status === 422;
          if (looksAlreadyRegistered) {
            const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
              type: 'recovery',
              email: normalized,
              options: { redirectTo: `${PUBLIC_SITE_URL}/dashboard/provider` },
            });
            if (linkErr || !linkData?.properties?.action_link) {
              return new Response(JSON.stringify({ ok: false, reason: 'link_failed', detail: linkErr?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            claimUrl = linkData.properties.action_link;
          } else {
            console.error('[request-provider-claim] invite failed', inviteErr);
            return new Response(JSON.stringify({ ok: false, reason: 'invite_failed', detail: inviteErr.message || 'unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        } else {
          claimUrl = `${PUBLIC_SITE_URL}/dashboard/provider`;
        }
      }
    } else {
      // Referring provider (not yet an org) — mint claim token + send /join link
      let token = refProvider!.claim_token;
      if (!token) {
        const { data: newTok } = await admin.rpc('generate_claim_token' as any);
        token = String(newTok || crypto.randomUUID());
        await admin.from('patient_referring_providers').update({
          claim_token: token,
          claim_token_expires_at: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
        }).eq('id', refProvider!.id);
      }
      claimUrl = `${PUBLIC_SITE_URL}/join/${token}`;
      displayName = refProvider!.practice_name || refProvider!.provider_name || 'your practice';
    }

    // Fire email with the claim link
    if (MAILGUN_API_KEY) {
      const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;margin:0;padding:20px;background:#f4f4f5;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:24px;text-align:center;">
    <h1 style="margin:0;font-size:21px;">Your ConveLabs provider portal</h1>
    <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">${displayName}</p>
  </div>
  <div style="padding:26px;line-height:1.7;color:#111827;font-size:14px;">
    <p>You requested access to your ConveLabs provider portal.</p>
    <p>Click below to set your password and sign in. The link is valid for 60 minutes — if it expires, just request a new one from the login page.</p>
    <div style="text-align:center;margin:26px 0;">
      <a href="${claimUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 34px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Activate my portal →</a>
    </div>
    <p style="font-size:13px;color:#6b7280;">Didn't request this? You can safely ignore — nothing happens unless you click the link.</p>
    <p style="margin-top:20px;">— Nico<br/><em style="color:#6b7280;font-size:13px;">Founder, ConveLabs</em></p>
  </div>
  <div style="background:#f9fafb;padding:14px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;">
    ConveLabs, Inc. · 1800 Pembrook Dr, Suite 300, Orlando FL 32810 · (941) 527-9169
  </div>
</div></body></html>`;
      const fd = new FormData();
      fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
      fd.append('to', normalized);
      fd.append('subject', `Activate your ConveLabs provider portal`);
      fd.append('html', html);
      fd.append('o:tag', 'provider_claim_link');
      fd.append('o:tracking-clicks', 'yes');
      await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd,
      });

      await admin.from('email_send_log').insert({
        to_email: normalized,
        campaign_tag: 'provider_claim_request',
        sent_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }

    return new Response(JSON.stringify({
      ok: true, match_type: orgByEmail ? 'org' : 'referring_provider',
      display_name: displayName,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[request-provider-claim] error', e);
    return new Response(JSON.stringify({ ok: false, reason: 'error', detail: e?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
