import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { verifyRecipientEmail, verifyRecipientPhone } from '../_shared/verify-recipient.ts';
import { renderAppointmentConfirmation } from '../_shared/patient-email-templates.ts';
import { logOrgEmail } from '../_shared/email-log.ts';

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
    // BUG FIX 2026-05-04 (Westphal): when org-billed, suppress the dollar
    // amount from patient-facing confirmation. The patient owes nothing —
    // showing "$72.25" reads as an invoice and freaks out partners' patients.
    let billedToOrg = false;
    let orgNameForPatient: string | null = null;

    // If appointmentId provided, fetch details from DB
    let viewToken: string | null = null;
    let appointmentId: string | null = body.appointmentId || null;
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
        viewToken = (appt as any).view_token || null;
        billedToOrg = (appt as any).billed_to === 'org' && !!(appt as any).organization_id;
        if (billedToOrg) {
          // Pull org display name so the patient sees "Covered by [Org]"
          const supabase2 = createClient(
            Deno.env.get('SUPABASE_URL') || '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
          );
          const { data: orgRow } = await supabase2.from('organizations')
            .select('name')
            .eq('id', (appt as any).organization_id)
            .maybeSingle();
          orgNameForPatient = (orgRow as any)?.name || 'your provider';
        }
        // Grab OCR'd lab order data so we can render the prep section
        (body as any).__labOrderPanels = Array.isArray((appt as any).lab_order_panels) ? (appt as any).lab_order_panels : [];
        (body as any).__labOrderOcrText = (appt as any).lab_order_ocr_text || '';
        (body as any).__labDestination = (appt as any).lab_destination || '';
        (body as any).__labDestinationPending = !!(appt as any).lab_destination_pending;
      }
    }

    // ─── Build panel-aware prep section for the email body ──────────
    // Mirror of src/lib/phlebHelpers.ts analyzePrepRequirements — kept duplicated
    // here because edge functions can't import src/ files. If you update one,
    // update the other.
    const buildPrepHtml = (): string => {
      const panels: string[] = ((body as any).__labOrderPanels || []) as string[];
      const ocrText: string = String((body as any).__labOrderOcrText || '');
      const destPending: boolean = !!(body as any).__labDestinationPending;
      if (panels.length === 0 && !ocrText && !destPending) return '';

      const everything = [...panels.map(p => String(p).toLowerCase()), ocrText.toLowerCase()].join(' ');
      const reqs: { title: string; body: string; color: string }[] = [];

      if (/\bfasting\b|\bfasted\b|\bnpo\b|lipid|cholesterol|\bcmp\b|comprehensive\s*metabolic|\bbmp\b|basic\s*metabolic|\bglucose\b(?!\s*tolerance)|fasting\s*insulin|iron\s*panel|ferritin|\bhepatic\b/.test(everything)) {
        reqs.push({
          title: '🍽️ Please fast 8–12 hours before your visit',
          body: 'Water and black coffee (no cream, no sugar) are OK. Stop eating no later than 8 hours before your appointment time. If you take medications, continue them unless your doctor told you otherwise.',
          color: '#d97706',
        });
      }

      if (/\b24[-\s]*hour\s*urine\b|creatinine\s*clearance/.test(everything)) {
        reqs.push({
          title: '🧪 24-hour urine collection',
          body: "Your order includes a 24-hour urine test. Your phlebotomist will bring a large collection container. You'll collect every drop of urine over 24 hours. Please call (941) 527-9169 to coordinate the exact start time.",
          color: '#2563eb',
        });
      } else if (/\burine\b|\burinalysis\b|\bua\b|urine\s*culture|\bmicroalbumin\b/.test(everything)) {
        reqs.push({
          title: '🧪 Urine test included',
          body: "Your phlebotomist will arrive with a sterile collection cup and walk you through the clean-catch technique. Try to hold off using the restroom for 30–60 minutes before your appointment so you're ready to collect.",
          color: '#2563eb',
        });
      }

      if (/glucose\s*tolerance|\bgtt\b|oral\s*glucose/.test(everything)) {
        reqs.push({
          title: '⏱️ Glucose Tolerance Test — plan 2–3 hours',
          body: 'This test requires a baseline draw, drinking a glucose solution, and additional timed draws. Please fast 8–12 hours beforehand. Block 2–3 hours at home. Avoid exercise or smoking during the test.',
          color: '#7c3aed',
        });
      }

      if (reqs.length === 0 && !destPending && panels.length === 0) return '';

      let html = `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;margin:16px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#0369a1;font-weight:700;margin-bottom:6px;">✨ Your Personalized Prep</div>
        <p style="margin:0 0 12px;font-size:13px;color:#0c4a6e;">We read your lab order — here's exactly how to prepare for a smooth visit.</p>`;

      if (panels.length > 0) {
        html += `<div style="margin-bottom:12px;font-size:12px;color:#334155;"><strong>Detected tests:</strong> ${panels.slice(0, 8).map(p => `<span style="display:inline-block;background:white;border:1px solid #cbd5e1;border-radius:999px;padding:2px 8px;margin:2px;font-size:11px;color:#334155;">${p}</span>`).join(' ')}</div>`;
      }

      for (const r of reqs) {
        html += `<div style="background:white;border-left:3px solid ${r.color};padding:10px 12px;margin:8px 0;border-radius:4px;">
          <div style="font-weight:700;font-size:13px;color:#111827;margin-bottom:4px;">${r.title}</div>
          <div style="font-size:12px;color:#4b5563;line-height:1.5;">${r.body}</div>
        </div>`;
      }

      if (destPending) {
        html += `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;margin:8px 0;">
          <div style="font-weight:700;font-size:13px;color:#92400e;">📞 We'll call you about your lab destination</div>
          <div style="font-size:12px;color:#78350f;margin-top:4px;">You asked us to help confirm which lab to send your samples to. Our team will reach out within 1 business day. Your appointment is secured.</div>
        </div>`;
      }

      html += `</div>`;
      return html;
    };

    const SITE_URL = Deno.env.get('SITE_URL') || 'https://www.convelabs.com';
    const visitUrl = viewToken ? `${SITE_URL}/visit/${viewToken}` : `${SITE_URL}/dashboard`;

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
        // Detect fasting requirement up front (used by the luxury template).
        // The sophisticated buildPrepHtml() still runs below to APPEND any
        // special-prep cards (24hr urine, glucose tolerance, etc.) that the
        // OCR'd lab order flagged — injected right before the footer.
        const panels: string[] = ((body as any).__labOrderPanels || []) as string[];
        const ocrText: string = String((body as any).__labOrderOcrText || '');
        const everything = [...panels.map(p => String(p).toLowerCase()), ocrText.toLowerCase()].join(' ');
        const fastingRequired = /\bfasting\b|\bfasted\b|\bnpo\b|lipid|cholesterol|\bcmp\b|comprehensive\s*metabolic|\bbmp\b|basic\s*metabolic|\bglucose\b(?!\s*tolerance)|fasting\s*insulin|iron\s*panel|ferritin|\bhepatic\b/.test(everything);

        let emailHtml = renderAppointmentConfirmation({
          patientName: firstName || patientName || 'there',
          appointmentDate: displayDate || undefined,
          appointmentTime: displayTime || undefined,
          serviceName: serviceName || undefined,
          address: (address && address !== 'TBD') ? address : undefined,
          manageUrl: visitUrl,
          fastingRequired,
        });

        // Append any extra special-prep cards the OCR logic detected (24h urine,
        // glucose tolerance tests, etc). We inject right before </body> so the
        // luxury shell stays intact.
        const extraPrepHtml = buildPrepHtml();
        if (extraPrepHtml) {
          emailHtml = emailHtml.replace('</body>', `<!-- extra prep --><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;"><tr><td align="center" style="padding:0 16px 32px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;"><tr><td>${extraPrepHtml}</td></tr></table></td></tr></table></body>`);
        }

        // If waived, surface that subtly at top of body
        if (billedToOrg) {
          emailHtml = emailHtml.replace(
            'Your appointment with ConveLabs is <strong>confirmed</strong>',
            `Your appointment with ConveLabs is <strong>confirmed</strong> · <span style="color:#059669;font-weight:600;">Covered by ${orgNameForPatient || 'your provider'} — no payment due</span>`
          );
        } else if (isWaived) {
          emailHtml = emailHtml.replace(
            'Your appointment with ConveLabs is <strong>confirmed</strong>',
            'Your appointment with ConveLabs is <strong>confirmed</strong> · <span style="color:#059669;font-weight:600;">Complimentary</span>'
          );
        } else if (totalAmount > 0) {
          emailHtml = emailHtml.replace(
            'Your appointment with ConveLabs is <strong>confirmed</strong>',
            `Your appointment with ConveLabs is <strong>confirmed</strong> · <span style="color:#111827;font-weight:600;">$${Number(totalAmount).toFixed(2)}</span>`
          );
        }

        const formData = new FormData();
        formData.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
        formData.append('to', patientEmail);
        formData.append('subject', `Appointment Confirmed - ${displayDate}`);
        formData.append('html', emailHtml);
        formData.append('o:tag', 'appointment-confirmation');
        formData.append('o:tracking-clicks', 'no');

        // ── Attach .ics calendar invite ──────────────────────────────
        // One-tap "Add to Calendar" from every email client.
        // Hormozi: every friction-free nudge toward attendance reduces no-shows.
        try {
          const dateOnly = (appointmentDate || '').slice(0, 10).replace(/-/g, '');
          const parseTime = (t: string): [string, string] => {
            const m = String(t || '09:00 AM').match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
            if (!m) return ['09', '00'];
            let h = parseInt(m[1], 10);
            const period = (m[3] || '').toUpperCase();
            if (period === 'PM' && h !== 12) h += 12;
            if (period === 'AM' && h === 12) h = 0;
            return [String(h).padStart(2, '0'), m[2]];
          };
          const [h, mm] = parseTime(appointmentTime);
          // End = +60 min
          const endMinutes = (parseInt(h, 10) * 60 + parseInt(mm, 10) + 60);
          const eh = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
          const em = String(endMinutes % 60).padStart(2, '0');

          if (/^\d{8}$/.test(dateOnly)) {
            const ics = [
              'BEGIN:VCALENDAR',
              'VERSION:2.0',
              'PRODID:-//ConveLabs//EN',
              'METHOD:PUBLISH',
              'BEGIN:VEVENT',
              `UID:${appointmentId || `cl-${Date.now()}`}@convelabs.com`,
              `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
              `DTSTART;TZID=America/New_York:${dateOnly}T${h}${mm}00`,
              `DTEND;TZID=America/New_York:${dateOnly}T${eh}${em}00`,
              `SUMMARY:ConveLabs - ${serviceName}`,
              `LOCATION:${(address || '').replace(/,/g, '\\,').replace(/\n/g, ' ')}`,
              `DESCRIPTION:Your ConveLabs mobile phlebotomy appointment. Questions? Call (941) 527-9169. View details: ${visitUrl}`,
              'BEGIN:VALARM',
              'ACTION:DISPLAY',
              'DESCRIPTION:ConveLabs visit tomorrow',
              'TRIGGER:-P1D',
              'END:VALARM',
              'END:VEVENT',
              'END:VCALENDAR',
            ].join('\r\n');
            const icsBlob = new Blob([ics], { type: 'text/calendar; charset=utf-8; method=PUBLISH' });
            formData.append('attachment', icsBlob, `convelabs-visit-${dateOnly}.ics`);
          }
        } catch (icsErr) {
          console.warn('ICS attachment build failed (non-blocking):', icsErr);
        }

        const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: formData,
        });

        results.email = mgRes.ok;
        if (mgRes.ok) console.log(`Confirmation email sent to ${patientEmail}`);
        else console.error(`Mailgun error: ${mgRes.status} ${await mgRes.text()}`);

        // Audit log — surfaces on the org's Emails tab + powers Mailgun
        // webhook status updates (opened/clicked/bounced) via mailgun_id.
        await logOrgEmail(supabase, {
          appointmentId: body.appointmentId,
          toEmail: patientEmail,
          emailType: 'appointment_confirmation',
          subject: `Appointment Confirmed - ${displayDate}`,
          mailgunResponse: mgRes,
        });
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

        // SMS: when org-billed, swap "Amount: $X" for "Covered by Org — no payment due"
        const amountLine = billedToOrg
          ? `Covered by ${orgNameForPatient || 'your provider'} — no payment due\n`
          : (!isWaived ? `Amount: $${Number(totalAmount).toFixed(2)}\n` : '');
        const smsBody = `ConveLabs: Your appointment is confirmed!\n\n${serviceName}\n${displayDate}${displayTime ? ` at ${displayTime}` : ''}\n${address && address !== 'TBD' ? `Location: ${address}\n` : ''}${amountLine}\nHave your lab order & insurance ready.\nQuestions? Call (941) 527-9169`;

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
