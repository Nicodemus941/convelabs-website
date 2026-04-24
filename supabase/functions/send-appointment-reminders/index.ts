import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { verifyRecipientEmail, verifyRecipientPhone } from '../_shared/verify-recipient.ts';
import { shouldSendNow } from '../_shared/quiet-hours.ts';
import { renderAppointmentReminder } from '../_shared/patient-email-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Global notification kill switch
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ success: true, suspended: true, message: 'Notifications suspended' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Quiet-hours guardrail — no patient SMS/email 9pm-8am ET.
  const gate = shouldSendNow('reminder');
  if (!gate.allow) {
    console.log(`[quiet-hours] send-appointment-reminders deferred: ${gate.reason}`);
    return new Response(JSON.stringify({ deferred: true, reason: gate.reason, nextAllowedAt: gate.nextAllowedAt }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('Appointment reminder function triggered');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

    // Calculate the target date in America/New_York (the business's timezone).
    // BUG FIX (2026-04-22): previously used UTC `new Date().setDate(+1)` which,
    // when the cron fired late-evening ET (after 8pm), had already rolled forward
    // in UTC. Result: "tomorrow" messaging went out ~36-48 hours ahead of the
    // actual ET appointment. Michael Morelli got "tomorrow Thursday" on Tuesday
    // evening for a Thursday appt — 2 calendar days early. Always anchor to ET.
    const etParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const y = etParts.find(p => p.type === 'year')!.value;
    const m = etParts.find(p => p.type === 'month')!.value;
    const d = etParts.find(p => p.type === 'day')!.value;
    // Build a noon-ET anchor for "today" then add 1 calendar day
    const todayEt = new Date(`${y}-${m}-${d}T12:00:00-04:00`);
    const targetDate = new Date(todayEt);
    targetDate.setDate(targetDate.getDate() + 1);
    // Re-derive target Y/M/D in ET (safe across DST)
    const tgtParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(targetDate);
    const targetDateStr = `${tgtParts.find(p => p.type === 'year')!.value}-${tgtParts.find(p => p.type === 'month')!.value}-${tgtParts.find(p => p.type === 'day')!.value}`;

    // Format "HH:MM:SS" → "8:00 AM" (patient-friendly)
    const formatApptTime = (t: string | null | undefined): string => {
      if (!t) return 'your scheduled time';
      const m = t.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return t;
      let h = parseInt(m[1], 10);
      const min = m[2];
      const period = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${min} ${period}`;
    };

    console.log(`Sending reminders for appointments on: ${targetDateStr}`);

    // Get appointments for the target date that haven't been cancelled
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('*')
      .gte('appointment_date', `${targetDateStr}T00:00:00`)
      .lte('appointment_date', `${targetDateStr}T23:59:59`)
      .in('status', ['scheduled', 'confirmed']);

    if (error) {
      console.error('Error fetching appointments:', error);
      throw error;
    }

    console.log(`Found ${appointments?.length || 0} appointments for ${targetDateStr}`);

    const results: { id: string; status: string; reason?: string }[] = [];

    for (const appt of (appointments || [])) {
      try {
        // Get patient details — priority: appointment columns → tenant_patients → notes
        let patientName = appt.patient_name || 'there';
        let patientPhone: string | null = appt.patient_phone || null;
        let patientEmail: string | null = appt.patient_email || null;

        // Fill gaps from tenant_patients
        if ((!patientPhone || !patientEmail) && appt.patient_id) {
          const { data: patient } = await supabase.from('tenant_patients')
            .select('first_name, last_name, phone, email').eq('id', appt.patient_id).maybeSingle();
          if (patient) {
            if (patientName === 'there') patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'there';
            if (!patientPhone) patientPhone = patient.phone;
            if (!patientEmail) patientEmail = patient.email;
          }
        }

        // Last fallback: notes
        if (patientName === 'there' && appt.notes) {
          const m = appt.notes.match(/Patient:\s*([^|]+)/);
          if (m) patientName = m[1].trim();
        }
        if (!patientPhone && appt.notes) { const m = appt.notes.match(/Phone:\s*([^|\s]+)/); if (m) patientPhone = m[1].trim(); }
        if (!patientEmail && appt.notes) { const m = appt.notes.match(/Email:\s*([^|\s]+)/); if (m) patientEmail = m[1].trim(); }

        const appointmentTime = formatApptTime(appt.appointment_time);
        const formattedDate = new Date(targetDateStr + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        });

        const hasLabOrder = !!appt.lab_order_file_path;
        // Sprint 4 Tier 3: if this visit is part of a recurring subscription
        // (not a prepaid bundle), append the "reply SKIP" self-service hint.
        // Bundles are prepaid — skipping doesn't save the patient money, so
        // the SKIP instruction would be misleading for those.
        const isSubscription = !!appt.recurrence_group_id && !appt.visit_bundle_id;

        // Send SMS reminder
        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && patientPhone) {
          const phoneCheck = await verifyRecipientPhone(appt.id, patientPhone, patientName);
          if (!phoneCheck.safe) {
            console.warn(`HIPAA guard blocked SMS to ${patientPhone}: ${phoneCheck.reason}`);
          } else {
            const formattedPhone = patientPhone.startsWith('+') ? patientPhone : `+1${patientPhone.replace(/\D/g, '')}`;

            const baseBody = hasLabOrder
              ? `Hi ${patientName}! Your ConveLabs appointment is tomorrow, ${formattedDate} at ${appointmentTime}. Your lab order is on file — we're all set! Please have a sterile, well-lit area ready and wear a short-sleeved shirt. See you soon!`
              : `Hi ${patientName}! Your ConveLabs appointment is tomorrow, ${formattedDate} at ${appointmentTime}. Please have your lab order and insurance card ready. If you'd like to upload them now, visit convelabs.com/dashboard. Prepare a sterile, well-lit area. See you soon!`;

            const smsBody = isSubscription
              ? `${baseBody}\n\nThis is a recurring visit. Need to push it? Log in at convelabs.com/dashboard and tap "Skip next" — or reply CALL to talk to us.`
              : baseBody;

            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
            const formData = new URLSearchParams();
            formData.append('To', formattedPhone);
            formData.append('From', TWILIO_PHONE_NUMBER);
            formData.append('Body', smsBody);

            const smsRes = await fetch(twilioUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: formData,
            });

            if (!smsRes.ok) {
              const err = await smsRes.text();
              console.error(`SMS failed for ${appt.id}:`, err);
            } else {
              console.log(`SMS reminder sent for appointment ${appt.id}`);
            }
          }
        }

        // Send email reminder
        if (MAILGUN_API_KEY && patientEmail) {
          const emailCheck = await verifyRecipientEmail(appt.id, patientEmail, patientName);
          if (!emailCheck.safe) {
            console.warn(`HIPAA guard blocked email to ${patientEmail}: ${emailCheck.reason}`);
          } else {
          // Tokenized visit URL — no login needed. Single entry point for upload,
          // reschedule, calendar add, etc. Falls back to dashboard if no token.
          const visitUrl = (appt as any).view_token
            ? `https://convelabs.com/visit/${(appt as any).view_token}`
            : 'https://convelabs.com/login?redirect=/dashboard/patient';

          const emailHtml = renderAppointmentReminder({
            patientName,
            appointmentDate: formattedDate,
            appointmentTime,
            serviceName: (appt.service_name || appt.service_type || 'Mobile Blood Draw').toString().replace(/_/g, ' '),
            address: appt.address || undefined,
            hasLabOrder,
            uploadUrl: visitUrl,
            manageUrl: visitUrl,
          });

          const mgFormData = new FormData();
          mgFormData.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
          mgFormData.append('to', patientEmail);
          mgFormData.append('subject', `Reminder: Your ConveLabs Appointment Tomorrow at ${appointmentTime}`);
          mgFormData.append('html', emailHtml);

          const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
            body: mgFormData,
          });

          if (!mgRes.ok) {
            const err = await mgRes.text();
            console.error(`Email failed for ${appt.id}:`, err);
          } else {
            console.log(`Email reminder sent for appointment ${appt.id}`);
          }
          }
        }

        results.push({ id: appt.id, status: 'sent' });
      } catch (err: any) {
        console.error(`Error processing appointment ${appt.id}:`, err);
        results.push({ id: appt.id, status: 'error', reason: err.message });
      }
    }

    console.log(`Reminders complete: ${results.filter(r => r.status === 'sent').length} sent, ${results.filter(r => r.status === 'error').length} errors`);

    return new Response(
      JSON.stringify({ success: true, date: targetDateStr, processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Reminder function error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
