/**
 * REQUEST-APPOINTMENT-LAB-ORDER
 *
 * Admin/phleb-triggered: send the patient an SMS + email with a magic
 * link to upload their lab order. Token-only auth (no password wall).
 *
 * Body: { appointmentId }
 * Response: { ok, request_id, access_token, patient_url, sms_sent, email_sent }
 *
 * Behaviors:
 *  - Idempotent: if a pending request already exists for this appointment,
 *    reuses its token and resends (rate-limited to 1 send per 6h, max 3).
 *  - Quiet-hours gated (9pm-8am ET): defers send, marks last_send_status,
 *    leaves status='pending' so the reminder cron can pick up at 8 AM.
 *  - Loss-aversion SMS copy ("Without it we can't draw the right tubes")
 *    per Hormozi rating in the design doc.
 *  - Snapshot patient email + phone at send time for audit.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { shouldSendNow } from '../_shared/quiet-hours.ts';

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

const MAX_SEND_ATTEMPTS = 3;
const MIN_SECS_BETWEEN_SENDS = 6 * 60 * 60; // 6h

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

function fmtApptShort(dateIso: string, time?: string | null): string {
  try {
    const d = new Date(String(dateIso).substring(0, 10) + 'T12:00:00');
    const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return time ? `${day} at ${time}` : day;
  } catch { return String(dateIso); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Allow cron / internal callers using the service-role key to skip the
    // user-JWT check. The auto-request cron uses this path. External admin
    // / phleb callers still get user-JWT verification.
    const isServiceRole = !!SERVICE_KEY && jwt === SERVICE_KEY;
    let requesterId: string | null = null;
    if (!isServiceRole) {
      const { data: userResp } = await admin.auth.getUser(jwt);
      const requester = userResp?.user;
      if (!requester) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      requesterId = requester.id;
    }

    const body = await req.json().catch(() => ({}));
    const appointmentId: string = body?.appointmentId;
    if (!appointmentId) {
      return new Response(JSON.stringify({ error: 'appointmentId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load appointment + check it's a real visit needing the request
    const { data: appt } = await admin
      .from('appointments')
      .select('id, patient_id, patient_name, patient_email, patient_phone, appointment_date, appointment_time, lab_order_file_path, status, service_type, organization_id')
      .eq('id', appointmentId)
      .maybeSingle();
    if (!appt) {
      return new Response(JSON.stringify({ error: 'appointment_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let patientEmail = (appt.patient_email || '').toLowerCase().trim() || null;
    let patientPhone = (appt.patient_phone || '').trim() || null;

    // Stale-contact fallback: if appointment row is missing phone OR email,
    // pull from tenant_patients (the canonical record) and quietly write back
    // so the appointment row stays in sync. Eliminates the silent "SMS to
    // old number" failure mode when admin updated the patient record but
    // not the appointment.
    if ((!patientEmail || !patientPhone) && appt.patient_id) {
      const { data: tp } = await admin
        .from('tenant_patients')
        .select('email, phone')
        .or(`id.eq.${appt.patient_id},user_id.eq.${appt.patient_id}`)
        .limit(1)
        .maybeSingle();
      const fallbackEmail = (tp as any)?.email ? String((tp as any).email).toLowerCase().trim() : null;
      const fallbackPhone = (tp as any)?.phone ? String((tp as any).phone).trim() : null;
      const updates: Record<string, string> = {};
      if (!patientEmail && fallbackEmail) {
        patientEmail = fallbackEmail;
        updates.patient_email = fallbackEmail;
      }
      if (!patientPhone && fallbackPhone) {
        patientPhone = fallbackPhone;
        updates.patient_phone = fallbackPhone;
      }
      if (Object.keys(updates).length > 0) {
        await admin.from('appointments').update(updates).eq('id', appt.id);
        console.log(`[request-lab-order] backfilled appt ${appt.id} contact from tenant_patients: ${Object.keys(updates).join(', ')}`);
      }
    }

    if (!patientEmail && !patientPhone) {
      return new Response(JSON.stringify({
        error: 'no_contact',
        message: 'Patient has neither email nor phone on file — add one before requesting.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Find OR create the request row. Idempotent: one pending request per
    // appointment.
    const { data: existing } = await admin
      .from('appointment_lab_order_requests')
      .select('*')
      .eq('appointment_id', appointmentId)
      .in('status', ['pending', 'sent', 'opened'])
      .gt('expires_at', new Date().toISOString())
      .order('requested_at', { ascending: false })
      .maybeSingle();

    let requestId: string;
    let accessToken: string;
    let sendAttempts = 0;

    if (existing) {
      requestId = (existing as any).id;
      accessToken = (existing as any).access_token;
      sendAttempts = (existing as any).send_attempts || 0;

      // Throttle resends
      if (sendAttempts >= MAX_SEND_ATTEMPTS) {
        return new Response(JSON.stringify({
          error: 'send_cap_reached',
          message: `Already sent ${sendAttempts}× — patient hasn't responded. Try a different channel or call them.`,
          access_token: accessToken,
          patient_url: `${PUBLIC_SITE_URL}/appt/${accessToken}/upload-order`,
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const lastSendAt = (existing as any).last_send_at;
      if (lastSendAt) {
        const secsSince = (Date.now() - new Date(lastSendAt).getTime()) / 1000;
        if (secsSince < MIN_SECS_BETWEEN_SENDS) {
          const hoursLeft = Math.ceil((MIN_SECS_BETWEEN_SENDS - secsSince) / 3600);
          return new Response(JSON.stringify({
            error: 'too_soon',
            message: `Last send was ${Math.round(secsSince/60)} min ago. Wait ~${hoursLeft}h before resending.`,
            access_token: accessToken,
          }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    } else {
      // Generate a 40-char URL-safe token
      const bytes = new Uint8Array(30);
      crypto.getRandomValues(bytes);
      accessToken = btoa(String.fromCharCode(...bytes))
        .replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c] || ''))
        .substring(0, 40);

      // Token expires at min(appointment_time, +14d)
      const apptDate = appt.appointment_date as string;
      const apptTimeStr = appt.appointment_time as string | null;
      let apptCutoff: Date | null = null;
      try {
        const d = new Date(String(apptDate).substring(0, 10) + 'T23:59:59-04:00');
        if (!isNaN(d.getTime())) apptCutoff = d;
      } catch { /* noop */ }
      const fourteenDays = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const expiresAt = apptCutoff && apptCutoff < fourteenDays ? apptCutoff : fourteenDays;

      const { data: inserted, error: insErr } = await admin
        .from('appointment_lab_order_requests')
        .insert({
          appointment_id: appointmentId,
          access_token: accessToken,
          expires_at: expiresAt.toISOString(),
          status: 'pending',
          requested_by: requesterId,
          patient_email_at_send: patientEmail,
          patient_phone_at_send: patientPhone,
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        return new Response(JSON.stringify({ error: 'insert_failed', message: insErr?.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      requestId = (inserted as any).id;
    }

    const patientUrl = `${PUBLIC_SITE_URL}/appt/${accessToken}/upload-order`;
    const patientFirst = String(appt.patient_name || 'there').split(' ')[0];
    const apptShort = fmtApptShort(String(appt.appointment_date), appt.appointment_time);

    // Quiet-hours gate. Defer if outside 8 AM – 9 PM ET.
    const sendOk = shouldSendNow('post_visit'); // closest existing channel; same 9pm-8am window
    if (!sendOk) {
      await admin.from('appointment_lab_order_requests')
        .update({
          send_attempts: sendAttempts + 1,
          last_send_at: new Date().toISOString(),
          last_send_status: 'deferred:quiet_hours',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);
      return new Response(JSON.stringify({
        ok: true, deferred: true,
        request_id: requestId,
        access_token: accessToken,
        patient_url: patientUrl,
        message: 'Quiet hours active (9 PM – 8 AM ET). Will send at 8 AM.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Send SMS + email in parallel
    let smsSent = false;
    let emailSent = false;
    const errs: string[] = [];

    if (patientPhone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      try {
        // Hormozi: loss aversion > gain framing.
        const smsBody = `Hi ${patientFirst} — ConveLabs here. We're prepping for your visit ${apptShort} but don't have your lab order yet. Without it we can't draw the right tubes. Two ways to send it: tap ${patientUrl} OR just text a photo back to this number.`;
        const fd = new URLSearchParams({
          To: normalizePhone(patientPhone),
          From: TWILIO_FROM,
          Body: smsBody,
        });
        const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: fd.toString(),
        });
        smsSent = tw.ok;
        if (!tw.ok) errs.push(`twilio:${tw.status}`);
      } catch (e: any) { errs.push(`twilio:${e?.message || 'crash'}`); }
    }

    if (patientEmail && MAILGUN_API_KEY) {
      try {
        const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;margin:0;padding:20px;background:#f4f4f5;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:22px 24px;text-align:center;">
    <h1 style="margin:0;font-size:20px;">Quick — upload your lab order</h1>
    <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">Before your ConveLabs visit</p>
  </div>
  <div style="padding:24px;line-height:1.6;color:#111827;">
    <p>Hi ${patientFirst},</p>
    <p>We're locked in for <strong>${apptShort}</strong>. To make sure we draw the right tubes for what your provider ordered, please upload your lab order before your appointment.</p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:#78350f;">📷 <strong>Photo or PDF</strong> — both work. Takes about 30 seconds.</p>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${patientUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">📄 Upload my lab order →</a>
    </div>
    <p style="font-size:13px;color:#6b7280;">Don't have it yet? Ask your doctor's office to fax it to <strong>(941) 251-8467</strong> — we'll match it to your visit automatically.</p>
    <p style="margin-top:18px;">— Nico, ConveLabs</p>
  </div>
  <div style="background:#f9fafb;padding:12px 24px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;">
    This link is for your appointment only and expires at visit time. ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810
  </div>
</div></body></html>`;
        const fd = new FormData();
        fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
        fd.append('to', patientEmail);
        fd.append('subject', `Quick — upload your lab order before ${apptShort}`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: fd,
        });
        emailSent = mg.ok;
        if (!mg.ok) errs.push(`mailgun:${mg.status}`);
      } catch (e: any) { errs.push(`mailgun:${e?.message || 'crash'}`); }
    }

    const sendStatus = errs.length > 0 ? `partial:${errs.join(',')}` : 'sent';
    await admin.from('appointment_lab_order_requests')
      .update({
        send_attempts: sendAttempts + 1,
        last_send_at: new Date().toISOString(),
        last_send_status: sendStatus,
        status: (smsSent || emailSent) ? 'sent' : 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return new Response(JSON.stringify({
      ok: true,
      request_id: requestId,
      access_token: accessToken,
      patient_url: patientUrl,
      sms_sent: smsSent,
      email_sent: emailSent,
      attempts: sendAttempts + 1,
      errors: errs,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[request-lab-order] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
