/**
 * INVITE-ORG-MANAGER — admin OR org-self-serve onboarding for a new
 * manager / front-desk staffer at a partner practice. Creates an
 * auth.users row stamped with { organization_id, role:'office_manager' }
 * in user_metadata so RPCs (e.g. the provider dashboard's
 * get_org_linked_patients) Just Work for them.
 *
 * Body: { email, organizationId, fullName?, roleLabel?, redirectTo? }
 * Returns: { ok, user_id, action_link, email_status, email_log_id }
 *
 * Auth: caller must be either
 *   (a) platform staff (super_admin / admin / owner), OR
 *   (b) an office_manager / provider whose user_metadata.organization_id
 *       matches the requested organizationId (org self-serve, 2026-05-07).
 * Cross-org invites by org-staff are explicitly rejected.
 *
 * Sends a branded Mailgun invite email with a "Set My Password" CTA.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { sendInviteEmail } from '../_shared/invite-email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const organizationId = String(body?.organizationId || '');
    const fullName = String(body?.fullName || '').trim() || null;
    const roleLabel = String(body?.roleLabel || '').trim() || null;
    const redirectTo = String(body?.redirectTo || '/dashboard/provider');
    if (!email || !organizationId) {
      return new Response(JSON.stringify({ error: 'email and organizationId are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ─── AUTH GATE ────────────────────────────────────────────────
    // Resolve caller from the Authorization header. If they aren't
    // platform staff, require their JWT user_metadata.organization_id
    // to match the requested one (org self-serve). Cross-org invites
    // by org-staff are rejected with 403.
    {
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: callerData } = await supabase.auth.getUser(token);
      const caller = callerData?.user;
      if (!caller) {
        return new Response(JSON.stringify({ error: 'Invalid auth token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const callerRole = String(caller.user_metadata?.role || '').toLowerCase();
      const callerOrg = caller.user_metadata?.organization_id || null;
      const isPlatform = ['super_admin','admin','owner'].includes(callerRole);
      const isOrgSelfServe =
        ['office_manager','provider'].includes(callerRole) &&
        callerOrg && String(callerOrg) === organizationId;
      if (!isPlatform && !isOrgSelfServe) {
        return new Response(JSON.stringify({
          error: 'forbidden',
          detail: 'caller cannot invite staff for this organization',
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Confirm the org exists
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, contact_email, manager_email')
      .eq('id', organizationId)
      .maybeSingle();
    if (orgErr || !org) {
      return new Response(JSON.stringify({ error: 'organization not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fullRedirect = `https://www.convelabs.com${redirectTo.startsWith('/') ? redirectTo : '/' + redirectTo}`;

    // Generate the invite link (creates auth.users if not exists, stamps metadata)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: fullRedirect,
        data: {
          organization_id: organizationId,
          role: 'office_manager',
          full_name: fullName,
          firstName: fullName ? fullName.split(' ')[0] : null,
          lastName: fullName ? fullName.split(' ').slice(1).join(' ') : null,
          role_label: roleLabel,
        },
      },
    });
    let actionLink: string | null = (linkData as any)?.properties?.action_link || null;
    let userId: string | null = (linkData as any)?.user?.id || null;
    let mode: 'invite' | 'recovery' = 'invite';

    // If user already exists, fall back to recovery link
    if (linkErr && String(linkErr.message || '').toLowerCase().includes('already')) {
      const { data: rec, error: recErr } = await supabase.auth.admin.generateLink({
        type: 'recovery', email, options: { redirectTo: fullRedirect },
      });
      if (recErr) {
        return new Response(JSON.stringify({ error: recErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      actionLink = (rec as any)?.properties?.action_link || null;
      userId = (rec as any)?.user?.id || null;
      mode = 'recovery';
    } else if (linkErr) {
      return new Response(JSON.stringify({ error: linkErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stamp manager_email on the org if it's empty
    if (!org.manager_email) {
      try {
        await supabase.from('organizations').update({ manager_email: email }).eq('id', organizationId);
      } catch (e) { console.warn('[invite-org-manager] org manager_email update failed:', e); }
    }

    // ─── ACTUALLY SEND THE EMAIL ───────────────────────────────────────
    // Prior to 2026-05-06 this function ONLY generated the action_link
    // and returned it to the caller. No email was ever sent — recipients
    // never received the invite. (James Davis case 2026-05-06.)
    // Now: route through the unified send-invite-email pipeline so the
    // send is persisted to email_send_log + retried + auditable.
    let emailResult: any = { status: 'skipped' };
    if (actionLink) {
      const greetingName = fullName || (email.split('@')[0]);
      const subjectLine = mode === 'recovery'
        ? `Reset your access to ${org.name}'s ConveLabs portal`
        : `You're invited to ${org.name}'s ConveLabs portal`;
      const headerLine = mode === 'recovery'
        ? 'Reset your password'
        : `You're invited to ${org.name}'s portal`;
      const bodyCopy = mode === 'recovery'
        ? `You already have an account on the ConveLabs provider portal for <strong>${org.name}</strong>. Click below to reset your password and continue.`
        : `You've been added to <strong>${org.name}</strong>'s ConveLabs provider portal. You can now schedule lab visits, view your patients, track specimens, and manage billing.`;

      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="margin:0;font-size:20px;">${headerLine}</h1>
          <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">ConveLabs Concierge Lab Services</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 12px 12px;line-height:1.6;">
          <p>Hi ${greetingName},</p>
          <p>${bodyCopy}</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${actionLink}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">${mode === 'recovery' ? 'Reset password →' : 'Open my portal →'}</a>
          </div>
          <p style="font-size:12px;color:#6b7280;text-align:center;word-break:break-all;">
            Or copy this link:<br>
            <a href="${actionLink}" style="color:#B91C1C;">${actionLink}</a>
          </p>
          <p style="font-size:12px;color:#6b7280;">This link expires in 24 hours. Questions? Reply to this email or call (941) 527-9169.</p>
          <p style="margin:16px 0 0;">— Nicodemme "Nico" Jean-Baptiste<br><em>Founder, ConveLabs Concierge Lab Services</em></p>
        </div>
      </div>`;

      emailResult = await sendInviteEmail({
        to: email,
        subject: subjectLine,
        html,
        inviteKind: 'org_manager_invite',
        organizationId,
        actionLink,
        senderLabel: 'ConveLabs',
        supabase,
      });

      if (!emailResult.ok) {
        console.error(`[invite-org-manager] email send FAILED for ${email}: ${emailResult.error}`);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      mode,
      user_id: userId,
      action_link: actionLink,
      organization_id: organizationId,
      organization_name: org.name,
      email_status: emailResult.status,           // 'sent' | 'failed' | 'skipped'
      email_log_id: emailResult.logId || null,
      email_error: emailResult.error || null,     // surface to admin UI on failure
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
