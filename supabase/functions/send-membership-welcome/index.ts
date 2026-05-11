// send-membership-welcome — Hormozi-structured welcome email sent the
// moment a membership goes active. Fired by stripe-webhook's
// handleMembershipSignup AFTER the user_memberships row exists + the
// founding seat (if any) is claimed.
//
// Body: { userId?, email?, tier ('member'|'vip'|'concierge'),
//         annualPriceCents, nextRenewalDate?, foundingMemberNumber? }
//
// Idempotency: stripe-webhook is the only caller. If admin needs to
// re-send, they can hit this fn directly with a service-role token.
//
// Verify_jwt = false — gate is the auth header (service-role) OR a
// signed appointment context. Without either we 401.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { renderMembershipWelcome } from '../_shared/patient-email-templates.ts';
import { logOrgEmail } from '../_shared/email-log.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const SITE_URL = Deno.env.get('SITE_URL') || 'https://www.convelabs.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Global notifications kill switch
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ success: true, suspended: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const auth = req.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (token !== SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const tier = String(body?.tier || '').toLowerCase() as 'member' | 'vip' | 'concierge';
    if (!['member', 'vip', 'concierge'].includes(tier)) {
      return new Response(JSON.stringify({ error: 'invalid tier' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve patient email + name from userId OR email
    let patientEmail: string = String(body?.email || '').trim();
    let patientFirstName = '';
    let patientUserId: string = String(body?.userId || '').trim();

    if (patientUserId && !patientEmail) {
      const { data: tp } = await supabase
        .from('tenant_patients')
        .select('email, first_name')
        .eq('user_id', patientUserId)
        .maybeSingle();
      if (tp) {
        patientEmail = (tp as any).email || '';
        patientFirstName = (tp as any).first_name || '';
      }
    } else if (patientEmail && !patientFirstName) {
      const { data: tp } = await supabase
        .from('tenant_patients')
        .select('first_name')
        .ilike('email', patientEmail)
        .maybeSingle();
      if (tp) patientFirstName = (tp as any).first_name || '';
    }

    if (!patientEmail) {
      return new Response(JSON.stringify({ error: 'no_email' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const annualPriceCents = Number(body?.annualPriceCents || 0) || (
      tier === 'concierge' ? 39900 : tier === 'vip' ? 19900 : 9900
    );

    let nextRenewalDate = String(body?.nextRenewalDate || '');
    if (!nextRenewalDate) {
      const d = new Date(); d.setFullYear(d.getFullYear() + 1);
      nextRenewalDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    const foundingMemberNumber = body?.foundingMemberNumber ? Number(body.foundingMemberNumber) : null;
    const tierLabel = tier === 'concierge' ? 'Concierge' : tier === 'vip' ? 'VIP' : 'Member';

    const emailHtml = renderMembershipWelcome({
      patientName: patientFirstName || 'there',
      tier,
      annualPriceCents,
      nextRenewalDate,
      foundingMemberNumber,
      dashboardUrl: `${SITE_URL}/dashboard/patient`,
    });

    if (!MAILGUN_API_KEY) {
      return new Response(JSON.stringify({ error: 'mailgun_not_configured' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const fd = new FormData();
    fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
    fd.append('to', patientEmail);
    fd.append('subject', `Welcome to ConveLabs ${tierLabel} — here's everything you get`);
    fd.append('html', emailHtml);
    fd.append('o:tag', 'membership-welcome');
    fd.append('o:tracking-clicks', 'no');

    const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: fd,
    });

    try {
      await logOrgEmail(supabase, {
        toEmail: patientEmail,
        emailType: 'membership_welcome',
        subject: `Welcome to ConveLabs ${tierLabel} — here's everything you get`,
        mailgunResponse: mg,
      });
    } catch (logErr) {
      console.warn('[send-membership-welcome] logOrgEmail failed (non-blocking):', logErr);
    }

    if (!mg.ok) {
      const errBody = await mg.text();
      console.error(`[send-membership-welcome] Mailgun error ${mg.status}: ${errBody}`);
      return new Response(JSON.stringify({ success: false, status: mg.status }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, to: patientEmail, tier }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[send-membership-welcome] crash:', e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
