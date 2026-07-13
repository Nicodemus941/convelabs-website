/**
 * RESEND-LAB-REQUEST
 *
 * Provider re-sends a lab request whose patient never scheduled — including
 * CANCELLED requests (restore + resend in one click). The payment made on the
 * original request CARRIES OVER: provider_payment_* fields are never touched
 * and the patient's new link contains no payment step.
 *
 * Case that drove this (Michael McHale / Elite Medical Concierge 2026-07-13):
 * org paid $72.25, patient ignored 3 reminders, org's only visible action was
 * Cancel — which stranded the payment on a dead request.
 *
 * Body: { request_id, new_draw_by_date }   // YYYY-MM-DD, must be >= today
 * Auth: provider/office_manager of the request's org (mirrors
 * cancel-lab-request), or admin roles.
 *
 * Effects: un-cancels, status -> pending_schedule, NEW access token (old link
 * dies), new expiry, reminder counters reset (the nudge engine starts over),
 * audit note appended, patient re-notified by SMS + email.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function normalizePhone(p: string): string {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return p?.startsWith('+') ? p : `+${d}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch { return iso; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { request_id, new_draw_by_date } = await req.json().catch(() => ({}));
    if (!request_id || !new_draw_by_date) return json({ error: 'request_id and new_draw_by_date required' }, 400);
    const newDate = String(new_draw_by_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return json({ error: 'new_draw_by_date must be YYYY-MM-DD' }, 400);
    if (newDate < new Date().toISOString().slice(0, 10)) return json({ error: 'date_in_past' }, 400);

    // ── AUTH: provider/office_manager of the request's org, or admin. ──
    // Validate the JWT explicitly with the service client (getUser(jwt)) —
    // the no-arg form is unreliable server-side (add-companion 403 lesson).
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'auth_required' }, 401);
    const { data: u } = await admin.auth.getUser(jwt);
    const user = u?.user;
    if (!user) return json({ error: 'auth_required' }, 401);

    const { data: reqRow } = await admin
      .from('patient_lab_requests')
      .select('id, organization_id, patient_name, patient_email, patient_phone, status, appointment_id, provider_payment_status, billed_to, fasting_required, admin_notes, completed_at')
      .eq('id', request_id)
      .maybeSingle();
    if (!reqRow) return json({ error: 'request_not_found' }, 404);

    const meta: any = user.user_metadata || {};
    const metaRole = String(meta.role || '').toLowerCase();
    const metaOrg = meta.organization_id || meta.org_id || null;
    let authorized = false;
    if (['provider', 'office_manager'].includes(metaRole) && metaOrg && String(metaOrg) === String(reqRow.organization_id)) {
      authorized = true;
    } else {
      // Staff/admin fallback via the user_roles TABLE (source of truth).
      const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', user.id);
      authorized = (roleRows || []).some((r: any) => ['super_admin', 'admin', 'owner', 'office_manager'].includes(String(r.role)));
    }
    if (!authorized) return json({ error: 'forbidden' }, 403);

    // ── GUARDS ──
    if (reqRow.completed_at || reqRow.status === 'completed') return json({ error: 'already_completed' }, 409);
    if (reqRow.status === 'scheduled' && reqRow.appointment_id) {
      return json({ error: 'already_scheduled', detail: 'Patient already booked — reschedule the appointment instead.' }, 409);
    }

    // ── RESTORE + RE-ARM ──
    // Fresh token (same format as create-lab-request) so any stale/leaked
    // old link stops working. Payment fields are DELIBERATELY untouched:
    // paid stays paid, the patient sees no payment step.
    const accessToken = crypto.randomUUID() + '-' + crypto.randomUUID().split('-')[0];
    const expiresAt = new Date(`${newDate}T23:59:59`);
    expiresAt.setDate(expiresAt.getDate() + 2); // small grace window past the deadline
    const noteLine = `[${new Date().toISOString().slice(0, 10)}] Re-sent by ${metaRole || 'staff'} with new draw-by ${newDate}; prior link revoked; payment carried over (${reqRow.provider_payment_status || 'n/a'}).`;

    const { error: upErr } = await admin.from('patient_lab_requests').update({
      status: 'pending_schedule',
      cancelled_at: null,
      draw_by_date: newDate,
      access_token: accessToken,
      access_token_expires_at: expiresAt.toISOString(),
      patient_reminder_count: 0,
      patient_reminded_at: null,
      patient_notified_at: new Date().toISOString(),
      provider_deadline_alert_sent_at: null,
      preoffered_slots: null,
      preoffered_slots_at: null,
      admin_notes: `${reqRow.admin_notes ? reqRow.admin_notes + '\n' : ''}${noteLine}`.slice(0, 4000),
      updated_at: new Date().toISOString(),
    }).eq('id', request_id);
    if (upErr) return json({ error: upErr.message }, 500);

    // ── ORG NAME for the message ──
    const { data: org } = await admin.from('organizations').select('name').eq('id', reqRow.organization_id).maybeSingle();
    const orgName = (org as any)?.name || 'your provider';
    const patientUrl = `${PUBLIC_SITE_URL}/lab-request/${accessToken}`;
    const firstName = String(reqRow.patient_name || 'there').split(' ')[0];
    const covered = reqRow.provider_payment_status === 'completed' || reqRow.billed_to === 'org';
    const coveredLine = covered ? ' Your visit is already covered — no payment needed.' : '';
    const fastingLine = reqRow.fasting_required ? ' Fasting is required before your draw.' : '';

    // ── NOTIFY: SMS + email (best effort, results reported back) ──
    let sentSms = false, sentEmail = false;
    const SID = Deno.env.get('TWILIO_ACCOUNT_SID'), TOK = Deno.env.get('TWILIO_AUTH_TOKEN'), FROM = Deno.env.get('TWILIO_PHONE_NUMBER');
    if (SID && TOK && FROM && reqRow.patient_phone) {
      try {
        const smsBody = `Hi ${firstName} — ConveLabs here. ${orgName} still needs your bloodwork done, now by ${fmtDate(newDate)}.${coveredLine}${fastingLine} Pick your time: ${patientUrl}`;
        const fd = new URLSearchParams({ To: normalizePhone(reqRow.patient_phone), From: FROM, Body: smsBody });
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${btoa(`${SID}:${TOK}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: fd.toString(),
        });
        sentSms = r.ok;
      } catch { /* reported via sent_sms=false */ }
    }
    const MG_KEY = Deno.env.get('MAILGUN_API_KEY'), MG_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
    if (MG_KEY && reqRow.patient_email) {
      try {
        const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:540px;margin:0 auto;">
  <div style="background:#B91C1C;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;"><h2 style="margin:0;font-size:18px;">Your bloodwork still needs scheduling</h2></div>
  <div style="padding:22px;border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111;">
    <p>Hi ${firstName},</p>
    <p><strong>${orgName}</strong> has asked us to complete your bloodwork by <strong>${fmtDate(newDate)}</strong>.${coveredLine ? ` <strong>${coveredLine.trim()}</strong>` : ''}${fastingLine}</p>
    <p style="margin:22px 0;"><a href="${patientUrl}" style="background:#B91C1C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Schedule my draw</a></p>
    <p style="font-size:13px;color:#666;">This link is private to you. Questions? Call (941) 527-9169.</p>
  </div></div>`;
        const fd = new FormData();
        fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
        fd.append('to', reqRow.patient_email);
        fd.append('subject', `Schedule your bloodwork by ${fmtDate(newDate)} — ${orgName}`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        const r = await fetch(`https://api.mailgun.net/v3/${MG_DOMAIN}/messages`, {
          method: 'POST', headers: { Authorization: `Basic ${btoa(`api:${MG_KEY}`)}` }, body: fd,
        });
        sentEmail = r.ok;
      } catch { /* reported via sent_email=false */ }
    }

    return json({
      ok: true, request_id, new_draw_by_date: newDate,
      patient_url: patientUrl, payment_carried_over: covered,
      sent_sms: sentSms, sent_email: sentEmail,
    });
  } catch (e: any) {
    console.error('[resend-lab-request] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
