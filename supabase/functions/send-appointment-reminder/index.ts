import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { getRenderedTemplate, userHasOptedIn } from "../_shared/email/index.ts";
import { createOrRefreshAppointmentPayLink } from "../_shared/appointment-pay-link.ts";
import { shouldSendNow } from "../_shared/quiet-hours.ts";
import { formatApptDateLong, formatApptTime, todayInETPlusDays } from "../_shared/format-appt-date.ts";
import { verifyRecipientEmail, verifyRecipientPhone } from "../_shared/verify-recipient.ts";
import { logOrgEmail } from "../_shared/email-log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEND_WINDOW_START_ET = 8;
const SEND_WINDOW_END_ET = 9;

function isUSEasternDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  const marchStart = (() => {
    const d = new Date(Date.UTC(year, 2, 1));
    const firstSun = 1 + ((7 - d.getUTCDay()) % 7);
    return Date.UTC(year, 2, firstSun + 7, 7);
  })();
  const novEnd = (() => {
    const d = new Date(Date.UTC(year, 10, 1));
    const firstSun = 1 + ((7 - d.getUTCDay()) % 7);
    return Date.UTC(year, 10, firstSun, 6);
  })();
  const t = date.getTime();
  return t >= marchStart && t < novEnd;
}

function etOffsetHours(date: Date): number {
  return isUSEasternDST(date) ? -4 : -5;
}

function hourET(now: Date = new Date()): number {
  const shifted = new Date(now.getTime() + etOffsetHours(now) * 3600 * 1000);
  return shifted.getUTCHours();
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

type ReminderStatus = 'already_sent' | 'sent' | 'retryable_failure' | 'blocked' | 'unavailable';

interface ChannelResult {
  channel: 'email' | 'sms';
  status: ReminderStatus;
  detail?: string;
}

interface ExistingReminderState {
  emailSent: boolean;
  smsSent: boolean;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ success: true, suspended: true, message: 'Notifications suspended' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const gate = shouldSendNow('reminder');
  if (!gate.allow) {
    console.log(`[quiet-hours] send-appointment-reminder deferred: ${gate.reason}`);
    return new Response(JSON.stringify({ deferred: true, reason: gate.reason, nextAllowedAt: gate.nextAllowedAt }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    let appointmentId: string | undefined;
    let force = false;
    try {
      const body = await req.json();
      appointmentId = body?.appointmentId;
      force = !!body?.force;
    } catch {
      // Batch processing without a JSON body.
    }

    const etHour = hourET();
    if (!force && (etHour < SEND_WINDOW_START_ET || etHour >= SEND_WINDOW_END_ET)) {
      return new Response(JSON.stringify({
        skipped: true,
        reason: 'outside-morning-send-window',
        etHour,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (appointmentId) {
      return await processSingleAppointment(appointmentId, supabaseClient);
    }

    const targetDateStr = todayInETPlusDays(1);
    const { data: appointments, error } = await supabaseClient
      .from('appointments')
      .select(`
        id,
        appointment_date,
        patient_id
      `)
      .in('status', ['scheduled', 'confirmed'])
      .gte('appointment_date', `${targetDateStr}T00:00:00`)
      .lte('appointment_date', `${targetDateStr}T23:59:59`);

    if (error) {
      throw new Error(`Error fetching appointments: ${error.message}`);
    }

    const results = [];
    for (const appointment of appointments || []) {
      try {
        const result = await processSingleAppointment(appointment.id, supabaseClient);
        const resultData = await result.json();
        results.push({
          appointmentId: appointment.id,
          success: resultData.success,
          skipped: resultData.skipped || false,
          channels: resultData.channels || [],
          error: resultData.error,
        });
      } catch (err) {
        results.push({
          appointmentId: appointment.id,
          success: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processedCount: results.length,
        sentCount: results.filter((r) => r.success && !r.skipped).length,
        skippedCount: results.filter((r) => r.skipped).length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in appointment reminder function:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function processSingleAppointment(appointmentId: string, supabaseClient: any) {
  const { data: appointment, error } = await supabaseClient
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single();

  if (error || !appointment) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || 'Appointment not found'
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 404,
      }
    );
  }

  let patientName = appointment.patient_name || 'there';
  let patientEmail: string | null = appointment.patient_email || null;
  let patientPhone: string | null = appointment.patient_phone || null;

  if ((patientName === 'there' || !patientEmail || !patientPhone) && appointment.patient_id) {
    const { data: tp } = await supabaseClient
      .from('tenant_patients')
      .select('first_name, last_name, email, phone')
      .eq('id', appointment.patient_id)
      .maybeSingle();
    if (tp) {
      if (patientName === 'there') {
        patientName = `${tp.first_name || ''} ${tp.last_name || ''}`.trim() || 'there';
      }
      patientEmail = patientEmail || tp.email || null;
      patientPhone = patientPhone || tp.phone || null;
    }
  }

  if (patientName === 'there' && appointment.notes) {
    const match = String(appointment.notes).match(/Patient:\s*([^|]+)/);
    if (match) patientName = match[1].trim();
  }

  const existing = await getExistingReminderState(supabaseClient, appointmentId, appointment.patient_id);
  const channels: ChannelResult[] = [];

  const hasOptedIn = await userHasOptedIn(appointment.patient_id, 'appointment_reminders');
  if (!hasOptedIn) {
    channels.push({ channel: 'email', status: 'blocked', detail: 'patient opted out of appointment reminder emails' });
  }

  const formattedDate = formatApptDateLong(appointment.appointment_date);
  const formattedTime = formatApptTime(appointment.appointment_time);
  const visitUrl = appointment.view_token
    ? `${Deno.env.get('SITE_URL') || 'https://convelabs.com'}/visit/${appointment.view_token}`
    : `${Deno.env.get('SITE_URL') || 'https://convelabs.com'}/dashboard/patient`;

  const templateData = {
    appointmentDate: formattedDate,
    appointmentTime: formattedTime,
    appointmentLocation: (appointment.address || '').includes('ConveLabs Office') ? 'ConveLabs Office' : 'Your Home',
    serviceType: 'Lab Draw',
    phlebotomistAssigned: !!appointment.phlebotomist_id,
    phlebotomistName: appointment.phlebotomist ?
      `${appointment.phlebotomist.firstName} ${appointment.phlebotomist.lastName}` : '',
    appointmentAddress: appointment.address,
    labOrderSubmitted: appointment.lab_order_file_path ? true : false,
    uploadLabOrderUrl: visitUrl,
    rescheduleUrl: visitUrl,
    cancelUrl: visitUrl
  };

  const renderedTemplate = await getRenderedTemplate('appointment_reminder', templateData);

  let nudgeHtml = '';
  let nudgeText = '';
  try {
    const isUnpaid =
      appointment.payment_status === 'pending' &&
      ['sent', 'reminded', 'final_warning', 'pending_send'].includes(appointment.invoice_status || '');
    if (isUnpaid) {
      let payUrl: string | null = null;
      try {
        payUrl = (await createOrRefreshAppointmentPayLink(supabaseClient, appointment.id)).url;
      } catch (err) {
        console.warn('[appt-reminder] branded pay link fallback:', err);
        payUrl = appointment.stripe_invoice_url || null;
      }
      const amount = `$${Number(appointment.total_amount || 0).toFixed(2)}`;
      if (payUrl) {
        nudgeHtml = `
          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:14px 16px;margin:18px 0;font-family:Arial,sans-serif;">
            <p style="margin:0 0 6px;font-weight:700;color:#92400e;font-size:14px;">Quick reminder: invoice still open</p>
            <p style="margin:0 0 10px;font-size:13px;color:#78350f;line-height:1.5;">
              Your ${amount} invoice for tomorrow's visit hasn't been paid yet. Pay now so we can confirm:
            </p>
            <div style="text-align:center;">
              <a href="${payUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Pay ${amount} →</a>
            </div>
          </div>`;
        nudgeText = `\n\nQuick reminder: your ${amount} invoice is still open. Pay: ${payUrl}\n`;
      } else {
        nudgeHtml = `
          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:14px 16px;margin:18px 0;font-family:Arial,sans-serif;">
            <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5;">
              Your ${amount} invoice is still open. Call <strong>(941) 527-9169</strong> to settle before your visit.
            </p>
          </div>`;
        nudgeText = `\n\nYour ${amount} invoice is still open. Call (941) 527-9169 to settle.\n`;
      }
    }
  } catch (e) {
    console.warn('[appt-reminder] nudge build failed (non-blocking):', e);
  }

  const baseHtml = nudgeHtml
    ? (renderedTemplate.html.includes('<body')
        ? renderedTemplate.html.replace(/(<body[^>]*>)/i, `$1${nudgeHtml}`)
        : nudgeHtml + renderedTemplate.html)
    : renderedTemplate.html;

  const promoHtml = elabusAppPromo();
  const finalHtml = baseHtml.includes('</body>')
    ? baseHtml.replace('</body>', `${promoHtml}</body>`)
    : baseHtml + promoHtml;
  const finalText = (renderedTemplate.text || '') + nudgeText
    + '\n\nWant to understand your lab results? Download E-Labus — App Store: https://apps.apple.com/app/id6784433707 · Google Play: https://play.google.com/store/apps/details?id=com.elabus.app\n';

  if (existing.emailSent) {
    channels.push({ channel: 'email', status: 'already_sent' });
  } else if (!patientEmail) {
    channels.push({ channel: 'email', status: 'unavailable', detail: 'patient email not found' });
  } else if (!hasOptedIn) {
    // already recorded above
  } else {
    const emailCheck = await verifyRecipientEmail(appointmentId, patientEmail, patientName);
    if (!emailCheck.safe) {
      channels.push({ channel: 'email', status: 'blocked', detail: emailCheck.reason });
    } else {
      const emailResult = await sendReminderEmail({
        appointmentId,
        patientEmail,
        subject: renderedTemplate.subject,
        html: finalHtml,
        text: finalText,
        supabaseClient,
      });
      channels.push(emailResult);
    }
  }

  if (existing.smsSent) {
    channels.push({ channel: 'sms', status: 'already_sent' });
  } else if (!patientPhone) {
    channels.push({ channel: 'sms', status: 'unavailable', detail: 'patient phone not found' });
  } else {
    const phoneCheck = await verifyRecipientPhone(appointmentId, patientPhone, patientName);
    if (!phoneCheck.safe) {
      channels.push({ channel: 'sms', status: 'blocked', detail: phoneCheck.reason });
    } else {
      const smsResult = await sendReminderSms({
        appointment,
        patientName,
        patientPhone,
        formattedDate,
        formattedTime,
        supabaseClient,
      });
      channels.push(smsResult);
    }
  }

  const materiallySent = channels.some((channel) =>
    channel.status === 'sent' || channel.status === 'already_sent'
  );

  return new Response(
    JSON.stringify({
      success: materiallySent,
      skipped: channels.every((channel) => channel.status === 'already_sent'),
      channels,
      error: materiallySent ? null : 'No reminder channel could be delivered',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

async function getExistingReminderState(supabaseClient: any, appointmentId: string, patientId?: string | null): Promise<ExistingReminderState> {
  const [emailLogResult, legacyEmailResult, smsResult] = await Promise.all([
    supabaseClient
      .from('email_send_log')
      .select('status')
      .eq('appointment_id', appointmentId)
      .eq('email_type', 'appointment_reminder')
      .limit(10),
    patientId
      ? supabaseClient
          .from('email_logs')
          .select('status, metadata')
          .eq('user_id', patientId)
          .limit(25)
      : Promise.resolve({ data: [], error: null }),
    supabaseClient
      .from('sms_notifications')
      .select('delivery_status')
      .eq('appointment_id', appointmentId)
      .eq('notification_type', 'appointment_reminder')
      .limit(10),
  ]);

  const emailStatuses = new Set(['sent', 'opened', 'clicked']);
  const smsStatuses = new Set(['queued', 'accepted', 'sending', 'sent', 'delivered']);

  const emailSent =
    !!emailLogResult.data?.some((row: any) => emailStatuses.has(String(row.status || '').toLowerCase())) ||
    !!legacyEmailResult.data?.some((row: any) => {
      const metadata = row?.metadata || {};
      return metadata?.appointmentId === appointmentId &&
        metadata?.templateName === 'appointment_reminder' &&
        String(row.status || '').toLowerCase() === 'sent';
    });

  const smsSent = !!smsResult.data?.some((row: any) => smsStatuses.has(String(row.delivery_status || '').toLowerCase()));

  return { emailSent, smsSent };
}

async function sendReminderEmail(args: {
  appointmentId: string;
  patientEmail: string;
  subject: string;
  html: string;
  text: string;
  supabaseClient: any;
}): Promise<ChannelResult> {
  const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
  const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

  if (!MAILGUN_API_KEY) {
    return { channel: 'email', status: 'unavailable', detail: 'Mailgun not configured' };
  }

  const formData = new FormData();
  formData.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
  formData.append('to', args.patientEmail);
  formData.append('subject', args.subject);
  formData.append('html', args.html);
  formData.append('text', args.text);

  const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: formData,
  });

  await logOrgEmail(args.supabaseClient, {
    appointmentId: args.appointmentId,
    toEmail: args.patientEmail,
    emailType: 'appointment_reminder',
    subject: args.subject,
    mailgunResponse: mgRes,
    retryPayload: { appointmentId: args.appointmentId, force: true },
  });

  if (!mgRes.ok) {
    const err = await mgRes.text().catch(() => 'Mailgun request failed');
    return { channel: 'email', status: 'retryable_failure', detail: err.substring(0, 500) };
  }

  return { channel: 'email', status: 'sent' };
}

async function sendReminderSms(args: {
  appointment: any;
  patientName: string;
  patientPhone: string;
  formattedDate: string;
  formattedTime: string;
  supabaseClient: any;
}): Promise<ChannelResult> {
  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
  const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    return { channel: 'sms', status: 'unavailable', detail: 'Twilio not configured' };
  }

  const isFasting = !!args.appointment.fasting_required;
  const needsUrine = !!args.appointment.urine_required;
  const hasLabOrder = !!args.appointment.lab_order_file_path;
  const isSubscription = !!args.appointment.recurrence_group_id && !args.appointment.visit_bundle_id;
  const prepLine = isFasting && needsUrine
    ? ` Fasting required (8h) and bring a morning urine sample. Full fasting details arrive tonight at 8 PM ET.`
    : isFasting
      ? ` Fasting required (8h before draw). Full details arrive tonight at 8 PM ET.`
      : needsUrine
        ? ` Bring a morning urine sample for tomorrow's visit.`
        : '';

  const baseBody = hasLabOrder
    ? `Hi ${args.patientName}! Your ConveLabs appointment is tomorrow, ${args.formattedDate} at ${args.formattedTime}. Your lab order is on file.${prepLine} Please have a clean, well-lit area ready and wear a short-sleeved shirt.`
    : `Hi ${args.patientName}! Your ConveLabs appointment is tomorrow, ${args.formattedDate} at ${args.formattedTime}. Please have your lab order and insurance card ready.${prepLine} If you need to manage your visit, use convelabs.com/dashboard.`;

  const smsBody = isSubscription
    ? `${baseBody}\n\nThis is a recurring visit. Need to push it? Log in and tap "Skip next" or reply CALL to talk to us.`
    : baseBody;

  const formattedPhone = normalizePhone(args.patientPhone);
  const formData = new URLSearchParams();
  formData.append('To', formattedPhone);
  formData.append('From', TWILIO_PHONE_NUMBER);
  formData.append('Body', smsBody);

  const statusCallback = `${Deno.env.get('SUPABASE_URL') || ''}/functions/v1/twilio-status-callback`;
  if (statusCallback.startsWith('http')) {
    formData.append('StatusCallback', statusCallback);
  }

  const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  let deliveryStatus = 'failed';
  let smsSid: string | null = null;
  if (smsRes.ok) {
    deliveryStatus = 'sent';
    try {
      smsSid = (await smsRes.json())?.sid ?? null;
    } catch {
      smsSid = null;
    }
  }

  try {
    await args.supabaseClient.from('sms_notifications').insert({
      appointment_id: args.appointment.id,
      notification_type: 'appointment_reminder',
      phone_number: formattedPhone,
      message_content: smsBody,
      sent_at: new Date().toISOString(),
      delivery_status: deliveryStatus,
      twilio_message_sid: smsSid,
      metadata: { source: 'send-appointment-reminder' },
    });
  } catch (logErr) {
    console.warn('appt reminder SMS log insert failed (non-blocking)', args.appointment.id, logErr);
  }

  if (!smsRes.ok) {
    const err = await smsRes.text().catch(() => 'Twilio request failed');
    return { channel: 'sms', status: 'retryable_failure', detail: err.substring(0, 500) };
  }

  return { channel: 'sms', status: 'sent' };
}

function elabusAppPromo(): string {
  return `
  <div style="margin-top:24px;padding:18px 16px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;font-family:Arial,sans-serif;">
    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">Understand your results after your draw</p>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#374151;">
      Download E-Labus to track biomarkers, view trends, and get AI-guided explanations once your labs are ready.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;">
      App Store:
      <a href="https://apps.apple.com/app/id6784433707" style="color:#B91C1C;text-decoration:none;">Download</a>
      <br />
      Google Play:
      <a href="https://play.google.com/store/apps/details?id=com.elabus.app" style="color:#B91C1C;text-decoration:none;">Download</a>
    </p>
  </div>`;
}
