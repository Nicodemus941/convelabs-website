/**
 * INVITE-PATIENT — admin-side magic-link onboarding for migrated patients.
 *
 * Use case: a tenant_patients row exists (we have the patient on file from
 * a prior visit) but no auth.users row, so the patient can't log in to
 * book / sign up for membership. The public signup form recently spun
 * indefinitely for these patients before the 30s-timeout fix landed
 * (Lynn Whipple's case — 4/30/2026).
 *
 * What this does:
 *   1. Verify the email matches a tenant_patients row (we don't blanket-
 *      invite arbitrary emails; admin-only)
 *   2. admin.inviteUserByEmail — Supabase creates the auth.users row AND
 *      sends a magic-link email (we override the redirect to bring them
 *      back to /pricing or wherever the caller specifies)
 *   3. Link the new user_id back to the tenant_patients row
 *   4. Return a copy of the action_link so the caller can also send by SMS
 *
 * Body: { email, redirectTo? (defaults to /pricing) }
 * Auth: requires service-role caller (cron / admin only). verify_jwt=true.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email: rawEmail, redirectTo: rawRedirect } = await req.json();
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ error: 'email required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const redirectPath = String(rawRedirect || '/pricing');
    const redirectTo = `https://www.convelabs.com${redirectPath.startsWith('/') ? redirectPath : '/' + redirectPath}`;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Look up the tenant_patients row (gate — only invite known patients)
    const { data: tp, error: tpErr } = await supabase
      .from('tenant_patients')
      .select('id, first_name, last_name, phone, user_id')
      .ilike('email', email)
      .maybeSingle();
    if (tpErr) {
      return new Response(JSON.stringify({ error: tpErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!tp) {
      return new Response(JSON.stringify({ error: 'no tenant_patients row for that email' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if ((tp as any).user_id) {
      return new Response(JSON.stringify({
        ok: false,
        reason: 'already_has_auth_user',
        user_id: (tp as any).user_id,
        message: 'Patient already has an account. Send password reset instead.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Generate the invite link (creates the auth.users row if needed)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo,
        data: {
          firstName: tp.first_name,
          lastName: tp.last_name,
          full_name: [tp.first_name, tp.last_name].filter(Boolean).join(' '),
          role: 'patient',
        },
      },
    });
    if (linkErr) {
      // If user already exists (race), fall back to recovery link
      if (String(linkErr.message || '').toLowerCase().includes('already')) {
        const { data: recData } = await supabase.auth.admin.generateLink({
          type: 'recovery', email, options: { redirectTo },
        });
        return new Response(JSON.stringify({
          ok: true,
          mode: 'recovery_fallback',
          action_link: recData?.properties?.action_link || null,
          hashed_token: recData?.properties?.hashed_token || null,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: linkErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Link the newly-created user_id back to tenant_patients
    const newUserId = (linkData as any)?.user?.id;
    if (newUserId) {
      const { error: linkBackErr } = await supabase
        .from('tenant_patients')
        .update({ user_id: newUserId })
        .eq('id', tp.id);
      if (linkBackErr) {
        console.warn('[invite-patient] link-back failed (non-fatal):', linkBackErr.message);
      }
    }

    // 4. Send the actual invite email via Mailgun (we override Supabase's
    // default sender so it matches our brand). The Supabase generateLink
    // above creates the auth row + the action link; we deliver the email
    // ourselves.
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
    const actionLink = (linkData as any)?.properties?.action_link;

    if (MAILGUN_API_KEY && actionLink) {
      const firstName = tp.first_name || 'Patient';
      const html = `<div style="font-family:Arial;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:#fff;padding:28px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="margin:0;font-size:22px;">Welcome to ConveLabs</h1>
          <p style="margin:6px 0 0;opacity:0.9;">Set your password to finish</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
          <p>Hi ${firstName},</p>
          <p>You're already on file with us — we just need you to set a password. Click below to finish creating your account. You'll be brought right back to where you left off.</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${actionLink}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">Set My Password &amp; Continue</a>
          </div>
          <p style="text-align:center;margin:8px 0 20px;font-size:12px;color:#666;word-break:break-all">Or copy this link:<br><a href="${actionLink}" style="color:#B91C1C;text-decoration:underline">${actionLink}</a></p>
          <p style="font-size:13px;color:#6b7280;">This link expires in 24 hours. Questions? Call (941) 527-9169.</p>
        </div>
      </div>`;
      const form = new FormData();
      form.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
      form.append('to', email);
      form.append('subject', 'Finish your ConveLabs account — set your password');
      form.append('html', html);
      form.append('o:tracking-clicks', 'no');
      form.append('o:tag', 'patient-invite');
      try {
        const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + btoa(`api:${MAILGUN_API_KEY}`) },
          body: form,
        });
        if (!mgRes.ok) {
          console.warn('[invite-patient] Mailgun non-200:', mgRes.status, await mgRes.text());
        }
      } catch (e: any) {
        console.warn('[invite-patient] Mailgun exception:', e?.message);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      mode: 'invite_sent',
      user_id: newUserId,
      action_link: actionLink,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[invite-patient] error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
