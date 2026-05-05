/**
 * ORG-OUTREACH-ACTION
 *
 * Single endpoint for the discovered-org outreach lifecycle. Used by:
 *   - InboxTab (admin/owner clicks: save email + welcome, or mark unreachable)
 *   - ocr-lab-order (auto-fires welcome when org is created with email present)
 *
 * Body: { organizationId, action, ... }
 *
 * Actions:
 *   1. save_email_send_welcome — admin obtained email; save it + fire welcome
 *      Body: { organizationId, email, sourceLabOrderId? }
 *      → updates org.contact_email + outreach_status='welcomed'
 *      → fires Hormozi welcome email (educational, no signup wall)
 *      → logs 'email_saved' + 'welcome_sent' to org_outreach_log
 *
 *   2. mark_unreachable — admin tried, org refused/no email available
 *      Body: { organizationId, note?: string }
 *      → updates org.outreach_status='unreachable_no_email' + outreach_note
 *      → org stays in organizations tab but disappears from inbox
 *      → logs 'marked_unreachable' to org_outreach_log
 *
 *   3. send_welcome_now — internal callers (ocr-lab-order, auto-cron)
 *      Body: { organizationId, sourceLabOrderId?, samplePatientName? }
 *      → fires welcome if email present + outreach_status not yet 'welcomed'
 *      → logs 'welcome_sent' to org_outreach_log
 *
 *   4. reopen — admin wants to retry an unreachable org
 *      Body: { organizationId }
 *      → outreach_status='pending'; back in inbox
 *
 * Auth: super_admin OR office_manager for actions 1, 2, 4. Service-role
 * key bypasses for action 3 (cron / ocr-lab-order).
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const FROM_EMAIL = `Nicodemme Jean-Baptiste <info@convelabs.com>`;

interface OutreachActor {
  user_id: string | null;
  email: string | null;
  is_service_role: boolean;
}

async function resolveActor(req: Request, admin: SupabaseClient): Promise<OutreachActor | null> {
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  if (jwt === SERVICE_KEY) return { user_id: null, email: null, is_service_role: true };

  const { data: userResp } = await admin.auth.getUser(jwt);
  const u = userResp?.user;
  if (!u) return null;

  // Verify role
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', u.id)
    .in('role', ['super_admin', 'office_manager'])
    .limit(1)
    .maybeSingle();
  if (!roleRow) return null;

  return { user_id: u.id, email: u.email || null, is_service_role: false };
}

async function logAction(
  admin: SupabaseClient,
  organizationId: string,
  action: string,
  actor: OutreachActor,
  note: string | null,
  details: any,
) {
  try {
    await admin.from('org_outreach_log').insert({
      organization_id: organizationId,
      action,
      actor_user_id: actor.user_id,
      actor_email: actor.email,
      note,
      details,
    });
  } catch (e) {
    console.warn('[org-outreach-action] log insert failed (non-blocking):', e);
  }
}

async function sendWelcomeEmail(
  admin: SupabaseClient,
  org: any,
  to: string,
  samplePatientName: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!MAILGUN_API_KEY) return { ok: false, error: 'mailgun_not_configured' };

  const orgName = org.name || 'your practice';
  const ordering = org.ordering_physician || '';
  const greeting = ordering ? `Dr. ${ordering.replace(/^Dr\.?\s*/i, '')}` : 'there';
  const patientLine = samplePatientName
    ? `Your patient ${samplePatientName} just scheduled their lab work with us.`
    : `One of your patients just scheduled their lab work with us.`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:22px 24px;text-align:center;border-radius:12px 12px 0 0;">
    <h2 style="margin:0;font-size:20px;font-weight:700;">A patient of yours just booked at-home bloodwork</h2>
    <p style="margin:6px 0 0;font-size:13px;opacity:0.95;">${orgName}</p>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.55;color:#111827;">
    <p style="margin:0 0 14px;">Hi ${greeting},</p>
    <p style="margin:0 0 14px;">${patientLine} We're <strong>ConveLabs</strong> — a licensed mobile phlebotomy service serving central Florida. Their requisition is already on file.</p>

    <p style="margin:0 0 6px;font-weight:700;color:#374151;">What happens next (you don't have to do anything):</p>
    <ul style="margin:0 0 14px 0;padding-left:20px;color:#111827;">
      <li>We do the draw at the patient's home</li>
      <li>We deliver the specimens to the lab on the requisition (Quest, LabCorp, AdventHealth, etc.)</li>
      <li>You receive an email the moment specimens are delivered, with tracking info</li>
      <li>Results land on your normal lab portal — same as if the patient went in person</li>
      <li>Every Monday you get a one-screen digest summarizing the patients we drew for you that week</li>
    </ul>

    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:#065f46;">
        <strong>Why we're reaching out:</strong> when a patient hands us a requisition with your name on it,
        we want to make sure you know we're handling it — and that you've got a direct line if anything looks off.
        Reply to this email or call <a href="tel:+19415279169" style="color:#065f46;">(941) 527-9169</a> any time.
      </p>
    </div>

    <p style="margin:14px 0 6px;font-weight:700;color:#374151;">Have other patients you'd like us to handle?</p>
    <p style="margin:0 0 8px;font-size:13px;">
      We come to them, draw at home, and route to your usual lab. Members and partner practices get discounted pricing
      (you can route them to us via this link any time):
    </p>
    <div style="text-align:center;margin:16px 0;">
      <a href="${PUBLIC_SITE_URL}/for-providers" style="display:inline-block;background:#B91C1C;color:#fff;padding:11px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px;">Learn more / refer a patient →</a>
    </div>

    <p style="margin:18px 0 0;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;">
      ConveLabs · (941) 527-9169 · info@convelabs.com<br>
      We're licensed, insured, and HIPAA-compliant. If you'd prefer we don't auto-notify your office for future patient bookings, reply STOP.
    </p>
  </div>
</div>`;

  try {
    const fd = new FormData();
    fd.append('from', FROM_EMAIL);
    fd.append('to', to);
    fd.append('subject', `${samplePatientName ? `${samplePatientName} just booked` : 'A patient of yours just booked'} at-home bloodwork`);
    fd.append('html', html);
    fd.append('o:tracking-clicks', 'no');
    const r = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: fd,
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return { ok: false, error: `mailgun_${r.status}: ${errText.substring(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'mailgun_exception' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const actor = await resolveActor(req, admin);
    if (!actor) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { organizationId, action } = body;

    if (!organizationId || !action) {
      return new Response(JSON.stringify({ error: 'organizationId + action required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cron / OCR fns may invoke send_welcome_now without admin auth
    const isInternal = actor.is_service_role;
    if (action !== 'send_welcome_now' && isInternal) {
      // service-role can do everything except hard-delete
    }

    // Load the org
    const { data: org } = await admin
      .from('organizations')
      .select('id, name, contact_email, manager_email, billing_email, contact_phone, outreach_status, outreach_note, ordering_physician, npi')
      .eq('id', organizationId)
      .maybeSingle();
    if (!org) {
      return new Response(JSON.stringify({ error: 'organization_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'save_email_send_welcome') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return new Response(JSON.stringify({ error: 'valid_email_required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update org with email + status
      const { error: upErr } = await admin.from('organizations').update({
        contact_email: email,
        outreach_status: 'welcomed',
        outreached_at: new Date().toISOString(),
      }).eq('id', organizationId);
      if (upErr) throw upErr;

      await logAction(admin, organizationId, 'email_saved', actor, body.note || null, { email });

      // Fire welcome
      const samplePatient = body.samplePatientName || await lastReferralPatient(admin, organizationId);
      const welcomeRes = await sendWelcomeEmail(admin, { ...(org as any), contact_email: email }, email, samplePatient);
      if (welcomeRes.ok) {
        await admin.from('organizations').update({
          welcomed_at: new Date().toISOString(),
        }).eq('id', organizationId);
        await logAction(admin, organizationId, 'welcome_sent', actor, null, { to: email });
        return new Response(JSON.stringify({ ok: true, welcome_sent: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        await logAction(admin, organizationId, 'welcome_failed', actor, welcomeRes.error || null, { to: email });
        return new Response(JSON.stringify({
          ok: true,
          welcome_sent: false,
          warning: `Email saved but welcome failed: ${welcomeRes.error}`,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'mark_unreachable') {
      const note = String(body.note || '').substring(0, 500) || null;
      const { error: upErr } = await admin.from('organizations').update({
        outreach_status: 'unreachable_no_email',
        outreach_note: note || 'Org refused to provide email',
        outreached_at: new Date().toISOString(),
      }).eq('id', organizationId);
      if (upErr) throw upErr;
      await logAction(admin, organizationId, 'marked_unreachable', actor, note, null);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reopen') {
      await admin.from('organizations').update({
        outreach_status: 'pending',
        outreach_note: null,
      }).eq('id', organizationId);
      await logAction(admin, organizationId, 'reopened', actor, null, null);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'send_welcome_now') {
      const email = (org as any).contact_email || (org as any).manager_email || (org as any).billing_email;
      if (!email) {
        return new Response(JSON.stringify({ ok: false, error: 'no_email_on_org' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if ((org as any).outreach_status === 'welcomed') {
        return new Response(JSON.stringify({ ok: true, skipped: 'already_welcomed' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const samplePatient = body.samplePatientName || await lastReferralPatient(admin, organizationId);
      const welcomeRes = await sendWelcomeEmail(admin, org, email, samplePatient);
      if (welcomeRes.ok) {
        await admin.from('organizations').update({
          outreach_status: 'welcomed',
          welcomed_at: new Date().toISOString(),
          outreached_at: new Date().toISOString(),
        }).eq('id', organizationId);
        await logAction(admin, organizationId, 'welcome_sent', actor, null, { to: email });
        return new Response(JSON.stringify({ ok: true, welcome_sent: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        await logAction(admin, organizationId, 'welcome_failed', actor, welcomeRes.error || null, { to: email });
        return new Response(JSON.stringify({ ok: false, error: welcomeRes.error }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: `unknown_action:${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[org-outreach-action] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Best-effort: pull the most recent appointment patient name for this org
// so the welcome email can name-drop "Your patient X just booked..."
async function lastReferralPatient(admin: SupabaseClient, orgId: string): Promise<string | null> {
  try {
    const { data: appt } = await admin
      .from('appointments')
      .select('patient_name')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (appt as any)?.patient_name || null;
  } catch { return null; }
}
