import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { verifyRecipientEmail, verifyRecipientPhone } from '../_shared/verify-recipient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Global notification kill switch
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ success: true, suspended: true, message: 'Notifications suspended' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();

    // Support both formats:
    // 1. { appointmentId } — looks up appointment from DB
    // 2. { patientName, patientEmail, patientPhone, serviceName, appointmentDate, appointmentTime, address, totalAmount } — direct params
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

    let patientName = body.patientName || 'Patient';
    let patientEmail = body.patientEmail;
    let patientPhone = body.patientPhone;
    let serviceName = body.serviceName || 'Blood Draw';
    let appointmentDate = body.appointmentDate;
    let appointmentTime = body.appointmentTime || '';
    let address = body.address || '';
    let totalAmount = body.totalAmount ?? 0;
    let isWaived = body.isWaived || totalAmount === 0;

    // If appointmentId provided, fetch details from DB
    if (body.appointmentId && (!patientEmail || !appointmentDate)) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      );
      const { data: appt } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', body.appointmentId)
        .maybeSingle();

      if (appt) {
        patientName = appt.patient_name || patientName;
        patientEmail = appt.patient_email || patientEmail;
        patientPhone = appt.patient_phone || patientPhone;
        serviceName = appt.service_name || serviceName;
        appointmentDate = appt.appointment_date || appointmentDate;
        appointmentTime = appt.appointment_time || appointmentTime;
        address = appt.address || address;
        totalAmount = appt.total_amount ?? totalAmount;
        isWaived = (appt.payment_status === 'completed' && appt.total_amount === 0) || isWaived;
      }
    }

    const firstName = patientName.split(' ')[0] || 'Patient';

    // Format date
    let displayDate = appointmentDate || '';
    try {
      const d = new Date(appointmentDate);
      if (!isNaN(d.getTime())) {
        displayDate = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      }
    } catch {}

    // Format time (convert 24h to 12h if needed)
    let displayTime = appointmentTime;
    if (appointmentTime && !appointmentTime.includes('AM') && !appointmentTime.includes('PM')) {
      const [h, m] = appointmentTime.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      displayTime = `${h12}:${String(m || 0).padStart(2, '0')} ${period}`;
    }

    const results = { email: false, sms: false };

    // 1. Send confirmation EMAIL via Mailgun
    if (patientEmail && MAILGUN_API_KEY) {
      const emailCheck = await verifyRecipientEmail(body.appointmentId || '', patientEmail, patientName);
      if (!emailCheck.safe) {
        console.warn(`HIPAA guard blocked email to ${patientEmail}: ${emailCheck.reason}`);
      } else {
        const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:white;padding:28px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="margin:0;font-size:22px;">Appointment Confirmed!</h1>
            <p style="margin:6px 0 0;opacity:0.9;">ConveLabs Mobile Phlebotomy</p>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
            <p>Hi ${firstName},</p>
            <p>Your appointment has been confirmed! Here are the details:</p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
              <table style="width:100%;font-size:14px;">
                <tr><td style="padding:6px 0;color:#6b7280;">Service</td><td style="padding:6px 0;font-weight:600;text-align:right;">${serviceName}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;font-weight:600;text-align:right;">${displayDate}</td></tr>
                ${displayTime ? `<tr><td style="padding:6px 0;color:#6b7280;">Time</td><td style="padding:6px 0;font-weight:600;text-align:right;">${displayTime}</td></tr>` : ''}
                ${address && address !== 'TBD' ? `<tr><td style="padding:6px 0;color:#6b7280;">Location</td><td style="padding:6px 0;font-weight:600;text-align:right;">${address}</td></tr>` : ''}
                ${!isWaived ? `<tr style="border-top:1px solid #e5e7eb;"><td style="padding:10px 0 6px;font-weight:600;">Amount</td><td style="padding:10px 0 6px;font-weight:700;font-size:18px;text-align:right;color:#B91C1C;">$${Number(totalAmount).toFixed(2)}</td></tr>` : '<tr style="border-top:1px solid #e5e7eb;"><td style="padding:10px 0 6px;font-weight:600;">Amount</td><td style="padding:10px 0 6px;font-weight:700;text-align:right;color:#059669;">Complimentary</td></tr>'}
              </table>
            </div>
            <p style="font-size:13px;color:#6b7280;"><strong>What to expect:</strong> A licensed phlebotomist will arrive at your location during your scheduled time window. Please have your lab order and insurance card ready.</p>
            <p style="font-size:13px;color:#6b7280;">Need to reschedule? Call us at <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a></p>
            <div style="text-align:center;margin:20px 0;">
              <a href="https://convelabs.com/dashboard" style="display:inline-block;background:#B91C1C;color:white;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;">View My Appointment</a>
            </div>
            <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
          </div>
        </div>`;

        const formData = new FormData();
        formData.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
        formData.append('to', patientEmail);
        formData.append('subject', `Appointment Confirmed - ${displayDate}`);
        formData.append('html', emailHtml);

        const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: formData,
        });

        results.email = mgRes.ok;
        if (mgRes.ok) console.log(`Confirmation email sent to ${patientEmail}`);
        else console.error(`Mailgun error: ${mgRes.status} ${await mgRes.text()}`);
      }
    }

    // 2. Send confirmation SMS via Twilio
    if (patientPhone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const phoneCheck = await verifyRecipientPhone(body.appointmentId || '', patientPhone, patientName);
      if (!phoneCheck.safe) {
        console.warn(`HIPAA guard blocked SMS to ${patientPhone}: ${phoneCheck.reason}`);
      } else {
        let normalizedPhone = patientPhone.replace(/\D/g, '');
        if (normalizedPhone.length === 10) normalizedPhone = `+1${normalizedPhone}`;
        else if (!normalizedPhone.startsWith('+')) normalizedPhone = `+${normalizedPhone}`;

        const smsBody = `ConveLabs: Your appointment is confirmed!\n\n${serviceName}\n${displayDate}${displayTime ? ` at ${displayTime}` : ''}\n${address && address !== 'TBD' ? `Location: ${address}\n` : ''}${!isWaived ? `Amount: $${Number(totalAmount).toFixed(2)}\n` : ''}\nHave your lab order & insurance ready.\nQuestions? Call (941) 527-9169`;

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const twilioBody = new URLSearchParams({
          To: normalizedPhone,
          Body: smsBody,
          ...(TWILIO_MESSAGING_SERVICE_SID
            ? { MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID }
            : { From: TWILIO_PHONE_NUMBER || '+14074104939' }),
        });

        const twilioRes = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: twilioBody.toString(),
        });

        results.sms = twilioRes.ok;
        if (twilioRes.ok) console.log(`Confirmation SMS sent to ${normalizedPhone}`);
        else console.error(`Twilio error: ${twilioRes.status} ${await twilioRes.text()}`);
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Appointment confirmation error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
