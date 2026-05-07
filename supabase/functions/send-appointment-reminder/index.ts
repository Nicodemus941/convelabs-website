
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { getRenderedTemplate, sendEmail, logEmailSend, userHasOptedIn } from "../_shared/email/index.ts";
import { shouldSendNow } from "../_shared/quiet-hours.ts";
import { formatApptDateLong, formatApptTime } from "../_shared/format-appt-date.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function can be called manually or triggered via a scheduled job
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Quiet-hours guardrail — no patient SMS/email 9pm-8am ET.
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
    
    // Get individual appointment or process batch
    let appointmentId: string | undefined;
    try {
      const body = await req.json();
      appointmentId = body.appointmentId;
    } catch (e) {
      // No JSON body or parse error, assume batch processing
    }
    
    // Process single appointment if ID provided
    if (appointmentId) {
      return await processSingleAppointment(appointmentId, supabaseClient);
    }
    
    // Otherwise, find all appointments happening in the next 24 hours
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    
    // Get appointments in the next 24 hours
    const { data: appointments, error } = await supabaseClient
      .from('appointments')
      .select(`
        id,
        appointment_date,
        patient_id
      `)
      .eq('status', 'scheduled')
      .gte('appointment_date', now.toISOString())
      .lte('appointment_date', tomorrow.toISOString());
    
    if (error) {
      throw new Error(`Error fetching appointments: ${error.message}`);
    }
    
    // Process each appointment
    const results = [];
    for (const appointment of appointments || []) {
      try {
        const result = await processSingleAppointment(appointment.id, supabaseClient);
        const resultData = await result.json();
        results.push({
          appointmentId: appointment.id,
          success: resultData.success,
          error: resultData.error
        });
      } catch (err) {
        results.push({
          appointmentId: appointment.id,
          success: false,
          error: err.message
        });
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        processedCount: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in appointment reminder function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// Helper function to process a single appointment reminder
async function processSingleAppointment(appointmentId: string, supabaseClient: any) {
  // Get appointment details. The previous JOIN syntax
  // `patient:patient_id (id, email)` doesn't resolve — there's no FK
  // relation registered under that alias, so PostgREST returned
  // "Could not find a relationship between 'appointments' and 'patient_id'
  // in the schema cache" and every reminder silently failed. Fix: use the
  // appointment's own patient_email column and look up the rest via
  // tenant_patients separately.
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

  // Resolve patient email — appointment row carries it directly; fall
  // back to tenant_patients lookup if blank.
  let patientEmail: string | null = appointment.patient_email || null;
  if (!patientEmail && appointment.patient_id) {
    const { data: tp } = await supabaseClient
      .from('tenant_patients').select('email').eq('id', appointment.patient_id).maybeSingle();
    patientEmail = tp?.email || null;
  }
  if (!patientEmail) {
    return new Response(
      JSON.stringify({ success: false, error: 'Patient email not found' }),
      { headers: { 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  // Check if user has opted in for appointment reminders
  const hasOptedIn = await userHasOptedIn(appointment.patient_id, 'appointment_reminders');
  if (!hasOptedIn) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "User has opted out of appointment reminder emails",
        skipped: true
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // ── DATE-BUG FIX (2026-05-06) ────────────────────────────────────
  // appointment_date is stored as `2026-05-08 00:00:00+00` (UTC midnight
  // on the visit day). When that's converted to Date and formatted in
  // America/New_York, DST drops it back to the prior evening
  // (Thursday May 7 8 PM ET) and the patient sees the WRONG WEEKDAY.
  // Hawthorn Mertz got "tomorrow Thursday" on Wednesday for a Friday
  // visit. (2026-05-06.)
  //
  // Fix: treat appointment_date as a CALENDAR-DATE STRING (slice the
  // first 10 chars) and format with timeZone:'UTC' anchored at noon UTC.
  // Noon UTC can't roll into a different day in any worldwide timezone.
  // appointment_time is the patient-facing clock value — render as-is.
  //
  // The shared `_shared/format-appt-date.ts` helper makes this the only
  // correct path forward; every reminder/confirmation/notice email
  // should use it.
  const formattedDate = formatApptDateLong(appointment.appointment_date);
  const formattedTime = formatApptTime(appointment.appointment_time);
  
  // Create data for the template
  const templateData = {
    appointmentDate: formattedDate,
    appointmentTime: formattedTime,
    appointmentLocation: appointment.address.includes('ConveLabs Office') ? 'ConveLabs Office' : 'Your Home',
    serviceType: 'Lab Draw', // You may want to fetch the actual service type
    phlebotomistAssigned: !!appointment.phlebotomist_id,
    phlebotomistName: appointment.phlebotomist ? 
      `${appointment.phlebotomist.firstName} ${appointment.phlebotomist.lastName}` : '',
    appointmentAddress: appointment.address,
    labOrderSubmitted: appointment.lab_order_file_path ? true : false,
    uploadLabOrderUrl: `${Deno.env.get('SITE_URL') || 'https://convelabs.com'}/dashboard/patient/upload-order?appointment=${appointmentId}`,
    rescheduleUrl: `${Deno.env.get('SITE_URL') || 'https://convelabs.com'}/dashboard/patient/reschedule?appointment=${appointmentId}`,
    cancelUrl: `${Deno.env.get('SITE_URL') || 'https://convelabs.com'}/dashboard/patient/cancel?appointment=${appointmentId}`
  };
  
  // Render the reminder email template
  const renderedTemplate = await getRenderedTemplate('appointment_reminder', templateData);

  // ─── INVOICE NUDGE — soft pay-link reminder when invoice is open ───
  // VIPs are normally exempt from dunning, but if the visit is tomorrow
  // and they haven't paid, a friendly nudge with the appointment
  // confirmation IS service, not dunning. Same goes for any patient
  // whose invoice is sent/reminded/final_warning when the visit lands.
  let nudgeHtml = '';
  let nudgeText = '';
  try {
    const isUnpaid =
      appointment.payment_status === 'pending' &&
      ['sent','reminded','final_warning','pending_send'].includes(appointment.invoice_status || '');
    if (isUnpaid) {
      const payUrl: string | null = appointment.stripe_invoice_url || null;
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
        // No hosted Stripe URL on file — surface a callable line instead
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

  // Inject the nudge near the top of the rendered HTML body — between
  // <body> and the actual content. Falls back to prepending if no <body>.
  const finalHtml = nudgeHtml
    ? (renderedTemplate.html.includes('<body')
        ? renderedTemplate.html.replace(/(<body[^>]*>)/i, `$1${nudgeHtml}`)
        : nudgeHtml + renderedTemplate.html)
    : renderedTemplate.html;
  const finalText = (renderedTemplate.text || '') + nudgeText;

  // Send the reminder email
  const result = await sendEmail({
    to: patientEmail,
    subject: renderedTemplate.subject,
    html: finalHtml,
    text: finalText
  });
  
  // Log the email
  await logEmailSend({
    userId: appointment.patient_id,
    recipientEmail: patientEmail,
    subject: renderedTemplate.subject,
    bodyHtml: renderedTemplate.html,
    bodyText: renderedTemplate.text,
    status: result.success ? 'sent' : 'failed',
    error: result.error,
    metadata: {
      appointmentId,
      templateName: 'appointment_reminder'
    }
  });
  
  if (!result.success) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: result.error 
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      id: result.id 
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
