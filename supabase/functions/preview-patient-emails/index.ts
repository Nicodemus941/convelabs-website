/**
 * PREVIEW-PATIENT-EMAILS
 *
 * One-shot preview: renders all 3 patient-facing emails (confirmation,
 * reminder, specimen-delivered) with sample data and fires them to a
 * given recipient so you can visually review the luxury template.
 *
 * Body: { to: string } — e.g. info@convelabs.com
 */

import {
  renderAppointmentConfirmation,
  renderAppointmentReminder,
  renderSpecimenDelivered,
} from '../_shared/patient-email-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

async function send(to: string, subject: string, html: string, tag: string) {
  const fd = new FormData();
  // Same sender format as the working org-welcome email (good reputation)
  fd.append('from', `Nico Ferdinand <nico@${MAILGUN_DOMAIN}>`);
  fd.append('h:Reply-To', 'nico@convelabs.com');
  fd.append('to', to);
  fd.append('subject', subject);
  fd.append('html', html);
  fd.append('o:tag', tag);
  fd.append('o:tracking-clicks', 'yes');
  const res = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: fd,
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`mailgun ${res.status}: ${bodyText.slice(0, 300)}`);
  }
  // Mailgun returns a JSON body with id on success; log for traceability
  console.log(`[preview] ${tag} → ${to} | mailgun ${res.status} ${bodyText.slice(0, 150)}`);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!MAILGUN_API_KEY) {
      return new Response(JSON.stringify({ error: 'mailgun_not_configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { to } = await req.json();
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return new Response(JSON.stringify({ error: 'valid_email_required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Shared sample data
    const common = {
      patientName: 'Sarah Mitchell',
      appointmentDate: 'Thursday, April 30, 2026',
      appointmentTime: '8:00 AM',
      serviceName: 'Mobile Blood Draw',
      address: '1234 Oak Street, Orlando, FL 32801',
    };

    // 1. Confirmation
    await send(
      to,
      'Preview:Your ConveLabs appointment is confirmed',
      renderAppointmentConfirmation({
        ...common,
        manageUrl: 'https://www.convelabs.com/dashboard',
        fastingRequired: true,
      }),
      'preview_confirmation'
    );

    // 2. Reminder
    await send(
      to,
      'Preview:Reminder: your ConveLabs appointment is tomorrow at 8:00 AM',
      renderAppointmentReminder({
        ...common,
        hasLabOrder: false,
        uploadUrl: 'https://www.convelabs.com/dashboard',
        manageUrl: 'https://www.convelabs.com/dashboard',
        fastingRequired: true,
      }),
      'preview_reminder'
    );

    // 3. Specimen delivered
    await send(
      to,
      'Preview:Your specimens have been delivered to LabCorp',
      renderSpecimenDelivered({
        ...common,
        labName: 'LabCorp',
        trackingId: 'LC-2026-04-30-8841',
        tubeCount: 3,
        resultsTimeline: '48-72 hours',
      }),
      'preview_specimen'
    );

    return new Response(JSON.stringify({ ok: true, sent_to: to, count: 3 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[preview-patient-emails]', e?.message);
    return new Response(JSON.stringify({ error: 'preview_failed', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
