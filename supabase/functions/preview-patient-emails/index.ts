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
  fd.append('from', `Nicodemme Jean-Baptiste <nico@${MAILGUN_DOMAIN}>`);
  fd.append('h:Reply-To', 'info@convelabs.com');
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

    // 1. Confirmation — non-member preview (no savings panel, no scarcity)
    await send(
      to,
      'Preview 1/4 · Confirmation · Non-member (baseline)',
      renderAppointmentConfirmation({
        ...common,
        manageUrl: 'https://www.convelabs.com/dashboard',
        fastingRequired: true,
      }),
      'preview_confirmation_baseline'
    );

    // 1b. Confirmation — VIP member with savings + Founding-50 scarcity
    //     This is the "with new perks" preview the owner asked for.
    await send(
      to,
      'Preview 2/4 · Confirmation · VIP member (savings + Founding scarcity)',
      renderAppointmentConfirmation({
        ...common,
        patientName: 'Mariela Sadrameli',
        manageUrl: 'https://www.convelabs.com/dashboard/patient',
        fastingRequired: false,
        savingsCents: 3500,            // $35 saved this visit at VIP tier
        ytdSavingsCents: 18500,        // $185 saved YTD
        memberTierLabel: 'VIP',
        foundingSeatsRemaining: 48,    // 2 claimed → 48 left
      }),
      'preview_confirmation_vip_founding'
    );

    // 1c. Confirmation — Concierge member, deeper savings, same footer
    await send(
      to,
      'Preview 3/4 · Confirmation · Concierge member (deep savings)',
      renderAppointmentConfirmation({
        ...common,
        patientName: 'Aditya Patel',
        manageUrl: 'https://www.convelabs.com/dashboard/patient',
        fastingRequired: true,
        savingsCents: 5100,            // $51 saved this visit at Concierge tier
        ytdSavingsCents: 30600,        // $306 saved YTD
        memberTierLabel: 'Concierge',
        foundingSeatsRemaining: 48,
      }),
      'preview_confirmation_concierge'
    );

    // 2. Reminder — kept for the visual comparison
    await send(
      to,
      'Preview 4/4 · 24h Reminder',
      renderAppointmentReminder({
        ...common,
        hasLabOrder: false,
        uploadUrl: 'https://www.convelabs.com/dashboard',
        manageUrl: 'https://www.convelabs.com/dashboard',
        fastingRequired: true,
      }),
      'preview_reminder'
    );

    return new Response(JSON.stringify({ ok: true, sent_to: to, count: 4 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[preview-patient-emails]', e?.message);
    return new Response(JSON.stringify({ error: 'preview_failed', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
