/**
 * SEND-SPECIMEN-DELIVERY-NOTIFICATION
 *
 * Fires when phleb marks a specimen delivered via the PWA
 * SpecimenDeliveryModal. Loops through appointment_organizations for
 * the appointment and emails every linked org (primary + cc) with a
 * HIPAA-safe footer. Dedupes via notified_delivery_at to prevent
 * double-notifications on replay.
 *
 * Body params:
 *   { appointmentId, specimenId, labName, tubeCount, deliveredAt }
 *
 * Multi-org safety: WHERE clause scopes by appointment_id so CC orgs
 * never get OTHER appointments' data. Each email is sent individually
 * with the org's specific contact routing.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') || '';

interface Body {
  appointmentId: string;
  appointment_id?: string; // snake_case fallback
  specimenId?: string;
  labName?: string;
  tubeCount?: number;
  deliveredAt?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const apptId = body.appointmentId || body.appointment_id;
    if (!apptId) {
      return new Response(JSON.stringify({ error: 'appointment_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch appointment + linked orgs (primary + cc)
    const { data: appt } = await supabase
      .from('appointments')
      .select('id, patient_name, patient_name_masked, org_reference_id, appointment_date, service_name, service_type, organization_id, patient_phone, patient_email, specimens_delivered_at')
      .eq('id', apptId)
      .maybeSingle();

    if (!appt) {
      return new Response(JSON.stringify({ error: 'appointment_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── STAMP specimens_delivered_at (the canonical column) ───────
    // The PWA modal sets `delivered_at`; dashboards read `specimens_delivered_at`.
    // Stamp both so both consumers agree. Idempotent — uses COALESCE so replay
    // doesn't overwrite an earlier authoritative timestamp.
    const deliveredAtIso = body.deliveredAt || new Date().toISOString();
    if (!appt.specimens_delivered_at) {
      await supabase.from('appointments')
        .update({ specimens_delivered_at: deliveredAtIso })
        .eq('id', apptId);
    }

    // ─── PATIENT SMS + EMAIL ───────────────────────────────────────
    // Previously the PWA modal tried to send these via separate edge fns
    // (send-sms-notification + send-email). Those calls were .catch()-swallowed
    // with no logging — a failure left the patient in the dark. Consolidated
    // here with audit logging to sms_notifications and email_send_log.
    let patientSmsSent = false;
    let patientEmailSent = false;

    if (appt.patient_phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
      try {
        const phone = appt.patient_phone.startsWith('+')
          ? appt.patient_phone
          : `+1${String(appt.patient_phone).replace(/\D/g, '')}`;
        const smsBody = `ConveLabs: Your specimens have been delivered to ${body.labName || 'the lab'}${body.specimenId ? ` (tracking: ${body.specimenId})` : ''}. Results will come through your lab's patient portal. Thanks!`;

        const form = new URLSearchParams();
        form.append('To', phone);
        form.append('From', TWILIO_PHONE_NUMBER);
        form.append('Body', smsBody);

        const twRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: form,
          }
        );

        const twJson = await twRes.json().catch(() => ({}));
        patientSmsSent = twRes.ok;

        // Audit log — so "did Ellen get her SMS" is one SQL query away
        await supabase.from('sms_notifications').insert({
          appointment_id: apptId,
          notification_type: 'specimen_delivered',
          phone_number: phone,
          message_content: smsBody,
          lab_name: body.labName || null,
          tracking_id: body.specimenId || null,
          delivery_status: twRes.ok ? 'sent' : 'failed',
          twilio_message_sid: (twJson as any)?.sid || null,
          sent_at: new Date().toISOString(),
        }).then(() => {}, (e) => console.warn('[specimen-notify] sms log insert failed:', e));
      } catch (e: any) {
        console.error('[specimen-notify] patient SMS failed:', e?.message);
      }
    }

    if (appt.patient_email && MAILGUN_API_KEY) {
      try {
        const labLabel = body.labName || 'the lab';
        const html = `<div style="font-family:Arial;max-width:600px;margin:0 auto;">
  <div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
    <h2 style="margin:0;">Specimen Delivered</h2>
  </div>
  <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
    <p>Hi ${appt.patient_name || 'there'},</p>
    <p>Your specimens have been successfully delivered to <strong>${labLabel}</strong>.</p>
    ${body.specimenId ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:14px;"><strong>Lab-Generated Tracking ID:</strong></p>
      <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#166534;">${body.specimenId}</p>
      <p style="margin:8px 0 0;font-size:12px;color:#6b7280;">Lab: ${labLabel}</p>
      ${body.tubeCount ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Tubes: ${body.tubeCount}</p>` : ''}
    </div>` : ''}
    <p style="font-size:13px;color:#6b7280;">Your results will be available through your lab's patient portal. If your provider does not see results, share the tracking ID above.</p>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169</p>
  </div>
</div>`;

        const fd = new FormData();
        fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
        fd.append('to', appt.patient_email);
        fd.append('subject', `Specimen delivered to ${labLabel}${body.specimenId ? ` · Tracking ${body.specimenId}` : ''}`);
        fd.append('html', html);
        fd.append('o:tag', 'specimen-delivery-patient-notify');

        const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: fd,
        });

        patientEmailSent = mgRes.ok;

        await supabase.from('email_send_log').insert({
          to_email: appt.patient_email,
          campaign_tag: 'specimen_delivered_patient',
          sent_at: new Date().toISOString(),
        }).then(() => {}, (e) => console.warn('[specimen-notify] email log insert failed:', e));
      } catch (e: any) {
        console.error('[specimen-notify] patient email failed:', e?.message);
      }
    }

    const { data: links } = await supabase
      .from('appointment_organizations')
      .select('organization_id, role, notified_delivery_at')
      .eq('appointment_id', apptId);

    // Also include appointments.organization_id fallback if not in junction
    const orgIds = new Set<string>((links || []).map((l: any) => l.organization_id));
    if (appt.organization_id) orgIds.add(appt.organization_id as string);

    if (orgIds.size === 0) {
      // Patient SMS/email already fired above — just return.
      return new Response(JSON.stringify({
        ok: true, orgs_skipped: true, reason: 'no_linked_orgs',
        patient_sms_sent: patientSmsSent, patient_email_sent: patientEmailSent,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, contact_name, contact_email, billing_email, default_billed_to')
      .in('id', Array.from(orgIds));

    const displayPatient = appt.patient_name_masked
      ? (appt.org_reference_id || 'your patient')
      : (appt.patient_name || 'your patient');
    const apptDate = appt.appointment_date
      ? new Date(appt.appointment_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'recently';
    const svc = appt.service_name || appt.service_type || 'lab draw';

    let sent = 0, skipped = 0;
    const trackingLink = body.specimenId ? `<p style="margin:6px 0 0;"><strong>Tracking:</strong> ${body.specimenId}</p>` : '';
    const labLine = body.labName ? `<p style="margin:6px 0 0;"><strong>Delivered to:</strong> ${body.labName}</p>` : '';

    for (const org of (orgs || [])) {
      const recipient = org.contact_email || org.billing_email;
      if (!recipient) { skipped++; continue; }
      if (!MAILGUN_API_KEY) { skipped++; continue; }

      // Dedup via notified_delivery_at on the junction row
      const link = (links || []).find((l: any) => l.organization_id === org.id);
      if (link?.notified_delivery_at) { skipped++; continue; }

      try {
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#059669;color:white;padding:20px;border-radius:10px 10px 0 0;text-align:center;">
    <h2 style="margin:0;font-size:20px;">Specimen Delivered ✓</h2>
    <p style="margin:4px 0 0;opacity:0.9;font-size:13px;">ConveLabs chain-of-custody update</p>
  </div>
  <div style="background:white;border:1px solid #e5e7eb;padding:22px;border-radius:0 0 10px 10px;line-height:1.5;">
    <p>Hi ${org.contact_name || 'team'},</p>
    <p>We've completed the specimen handoff for <strong>${displayPatient}</strong>${appt.patient_name_masked ? ` (reference: ${appt.org_reference_id})` : ''}.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin:14px 0;font-size:14px;">
      <p style="margin:0;"><strong>Visit:</strong> ${svc} on ${apptDate}</p>
      ${labLine}
      ${trackingLink}
    </div>
    <p style="font-size:13px;color:#6b7280;">Results will arrive via the destination lab's standard pipeline. If you need us to resend or re-route, just reply to this email.</p>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;border-top:1px solid #f3f4f6;padding-top:12px;">
      This email contains limited patient-identifier information consistent with HIPAA minimum-necessary standards.<br/>
      ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169
    </p>
  </div>
</div>`;

        const fd = new FormData();
        fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
        fd.append('to', recipient);
        fd.append('subject', `Specimen delivered for ${displayPatient}${body.labName ? ` · ${body.labName}` : ''}`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        fd.append('o:tag', 'specimen-delivery-org-notify');

        const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: fd,
        });

        if (!mgRes.ok) {
          console.error(`[specimen-org-notify] mailgun ${org.name} ${mgRes.status}`);
          skipped++;
          continue;
        }

        // Stamp dedup timestamp on junction row (only if link exists)
        if (link) {
          await supabase.from('appointment_organizations')
            .update({ notified_delivery_at: new Date().toISOString() })
            .eq('appointment_id', apptId)
            .eq('organization_id', org.id);
        }

        // Also stamp on appointment for legacy consumers
        await supabase.from('appointments')
          .update({ org_notified_delivery_at: new Date().toISOString() })
          .eq('id', apptId);

        sent++;
      } catch (e: any) {
        console.error(`[specimen-org-notify] ${org.name} failed:`, e);
        skipped++;
      }
    }

    return new Response(JSON.stringify({
      ok: true, sent, skipped, total_orgs: orgIds.size,
      patient_sms_sent: patientSmsSent, patient_email_sent: patientEmailSent,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[specimen-org-notify] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
