import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { verifyRecipientEmail, verifyRecipientPhone } from '../_shared/verify-recipient.ts';

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

    // Calculate the target date: exactly 24 hours from now
    // We want appointments happening tomorrow (24hrs ahead), NOT today
    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 1);
    const targetDateStr = targetDate.toISOString().split('T')[0]; // yyyy-MM-dd

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

        const appointmentTime = appt.appointment_time || 'your scheduled time';
        const formattedDate = new Date(targetDateStr + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        });

        const hasLabOrder = !!appt.lab_order_file_path;

        // Send SMS reminder
        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && patientPhone) {
          const phoneCheck = await verifyRecipientPhone(appt.id, patientPhone, patientName);
          if (!phoneCheck.safe) {
            console.warn(`HIPAA guard blocked SMS to ${patientPhone}: ${phoneCheck.reason}`);
          } else {
            const formattedPhone = patientPhone.startsWith('+') ? patientPhone : `+1${patientPhone.replace(/\D/g, '')}`;

            const smsBody = hasLabOrder
              ? `Hi ${patientName}! Your ConveLabs appointment is tomorrow, ${formattedDate} at ${appointmentTime}. Your lab order is on file — we're all set! Please have a sterile, well-lit area ready and wear a short-sleeved shirt. See you soon!`
              : `Hi ${patientName}! Your ConveLabs appointment is tomorrow, ${formattedDate} at ${appointmentTime}. Please have your lab order and insurance card ready. If you'd like to upload them now, visit convelabs.com/dashboard. Prepare a sterile, well-lit area. See you soon!`;

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
          const emailHtml = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:white;padding:28px;border-radius:16px 16px 0 0;text-align:center;">
      <h1 style="margin:0;font-size:22px;">Appointment Reminder</h1>
      <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Your ConveLabs appointment is tomorrow</p>
    </div>
    <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 16px 16px;">
      <p style="font-size:16px;color:#374151;">Hello ${patientName},</p>
      <p style="font-size:14px;color:#6b7280;line-height:1.6;">
        This is a friendly reminder that your ConveLabs appointment is scheduled for tomorrow. Our licensed phlebotomist will arrive at your location at the scheduled time.
      </p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:20px 0;">
        <table style="width:100%;font-size:14px;color:#374151;">
          <tr><td style="padding:6px 0;color:#6b7280;width:35%;">Date</td><td style="font-weight:600;">${formattedDate}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Time</td><td style="font-weight:600;">${appointmentTime}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Location</td><td>${appt.address || 'Your provided address'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Service</td><td style="text-transform:capitalize;">${(appt.service_type || 'blood draw').replace(/_/g, ' ')}</td></tr>
        </table>
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:20px 0;">
        <h3 style="margin:0 0 8px;font-size:14px;color:#166534;">How to Prepare</h3>
        <ul style="margin:0;padding-left:18px;font-size:13px;color:#15803d;line-height:1.8;">
          ${hasLabOrder
            ? '<li>✅ Your <strong>lab order is on file</strong> — we\'re all set!</li>'
            : '<li>Have your <strong>lab order</strong> ready (or <a href="https://convelabs.com/dashboard" style="color:#B91C1C;">upload it now</a>)</li>'}
          <li>Have your <strong>photo ID</strong> and <strong>insurance card</strong> ready</li>
          <li>Prepare a <strong>sterile, well-lit area</strong> for the collection</li>
          <li>If fasting is required, no food 8-12 hours before (water is OK)</li>
          <li>Wear a short-sleeved shirt or one with easily rolled-up sleeves</li>
          <li>Stay well hydrated — drink plenty of water</li>
        </ul>
      </div>

      <div style="text-align:center;margin:24px 0;">
        <a href="https://convelabs.com/login?redirect=/dashboard/patient" style="display:inline-block;background:#B91C1C;color:white;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
          View Your Appointment
        </a>
      </div>

      <p style="font-size:13px;color:#6b7280;text-align:center;">
        Need to reschedule? Call us at <strong>(941) 527-9169</strong>
      </p>

      <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="font-size:11px;color:#9ca3af;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
        <p style="font-size:11px;color:#9ca3af;">Luxury Mobile Phlebotomy Services</p>
      </div>
    </div>
  </div>
</body>
</html>`;

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
