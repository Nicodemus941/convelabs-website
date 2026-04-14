import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    const now = new Date().toISOString();

    // Get pending sequences that are due
    const { data: pending, error } = await supabase
      .from('post_visit_sequences')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(50);

    if (error) throw error;
    let processed = 0;

    for (const seq of (pending || [])) {
      try {
        const name = seq.patient_email?.split('@')[0] || 'there';

        // Get patient name from appointment
        let patientName = 'there';
        if (seq.patient_id) {
          const { data: patient } = await supabase
            .from('tenant_patients')
            .select('first_name')
            .eq('id', seq.patient_id)
            .maybeSingle();
          if (patient?.first_name) patientName = patient.first_name;
        }

        // Get referral code for referral step
        let referralCode = '';
        if (seq.step === 'referral_prompt' && seq.patient_id) {
          const { data: ref } = await supabase
            .from('referral_codes')
            .select('code')
            .eq('user_id', seq.patient_id)
            .maybeSingle();
          referralCode = ref?.code || '';
        }

        // Execute based on step type
        switch (seq.step) {
          case 'what_to_expect': {
            // Get appointment details for the prep email
            let apptDate = '', apptTime = '', apptAddress = '', serviceName = '';
            if (seq.appointment_id) {
              const { data: appt } = await supabase.from('appointments')
                .select('appointment_date, appointment_time, address, service_name')
                .eq('id', seq.appointment_id).maybeSingle();
              if (appt) {
                try { apptDate = new Date(appt.appointment_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch { apptDate = appt.appointment_date?.substring(0,10) || ''; }
                apptTime = appt.appointment_time || '';
                apptAddress = appt.address || '';
                serviceName = appt.service_name || 'Blood Draw';
              }
            }
            if (MAILGUN_API_KEY && seq.patient_email) {
              await sendEmail(seq.patient_email, `What to Expect — Your ConveLabs Visit${apptDate ? ' on ' + apptDate : ''}`, `
                <div style="font-family:Arial;max-width:600px;margin:0 auto;">
                  <div style="background:linear-gradient(135deg,#1e293b,#334155);color:white;padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h2 style="margin:0;font-size:20px;">Getting Ready for Your Visit</h2>
                    <p style="margin:6px 0 0;opacity:0.8;font-size:13px;">${apptDate}${apptTime ? ' at ' + apptTime : ''}</p>
                  </div>
                  <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
                    <p>Hi ${patientName},</p>
                    <p>Your <strong>${serviceName}</strong> appointment is coming up! Here's how to prepare:</p>
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:16px 0;">
                      <h3 style="margin:0 0 10px;font-size:14px;color:#166534;">✅ Your Prep Checklist</h3>
                      <ul style="margin:0;padding-left:18px;font-size:13px;color:#15803d;line-height:2;">
                        <li><strong>Lab order</strong> — have it printed or on your phone</li>
                        <li><strong>Photo ID</strong> — driver's license or passport</li>
                        <li><strong>Insurance card</strong> — front and back</li>
                        <li><strong>Hydrate</strong> — drink plenty of water today</li>
                        <li><strong>Fasting?</strong> — if required, no food 8-12 hours before</li>
                        <li><strong>Clothing</strong> — wear a short-sleeved shirt</li>
                        <li><strong>Space</strong> — prepare a clean, well-lit area</li>
                      </ul>
                    </div>
                    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:16px 0;text-align:center;">
                      <p style="margin:0;font-size:14px;font-weight:600;">Your Phlebotomist</p>
                      <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Nicodemme "Nico" Jean-Baptiste</p>
                      <p style="margin:2px 0 0;font-size:12px;color:#9ca3af;">Licensed Phlebotomist · ConveLabs</p>
                    </div>
                    <div style="text-align:center;margin:20px 0;">
                      <a href="https://convelabs.com/dashboard" style="display:inline-block;background:#B91C1C;color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;">View My Appointment</a>
                    </div>
                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:16px 0;text-align:center;">
                      <p style="margin:0;font-size:13px;color:#991B1B;">💡 <strong>Bringing a family member?</strong> Add them to the same visit for just $75.</p>
                      <a href="tel:9415279169" style="font-size:12px;color:#B91C1C;">Call (941) 527-9169 to add</a>
                    </div>
                    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810<br>(941) 527-9169 · convelabs.com</p>
                  </div>
                </div>
              `);
            }
            break;
          }
          case 'specimen_confirm': {
            if (TWILIO_ACCOUNT_SID && seq.patient_phone) {
              await sendSMS(seq.patient_phone, `Hi ${patientName}! Your ConveLabs specimens are on the way to the lab. We'll send you a confirmation with your lab-generated tracking ID once delivered. Thank you for choosing ConveLabs!`);
            }
            break;
          }
          case 'survey': {
            if (MAILGUN_API_KEY && seq.patient_email) {
              await sendEmail(seq.patient_email, 'How Was Your ConveLabs Experience?', `
                <div style="font-family:Arial;max-width:600px;margin:0 auto;">
                  <div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                    <h2 style="margin:0;">How Was Your Visit?</h2>
                  </div>
                  <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
                    <p>Hi ${patientName},</p>
                    <p>We hope your ConveLabs experience was exceptional. Your feedback helps us continue providing luxury concierge lab services.</p>
                    <div style="text-align:center;margin:24px 0;">
                      <p style="font-size:14px;color:#666;margin-bottom:12px;">Had a great experience?</p>
                      <a href="https://g.page/r/CQYNAuLgDPeiEAI/review" style="display:inline-block;background:#B91C1C;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;">Leave a Google Review ⭐</a>
                    </div>
                    <div style="text-align:center;margin-top:16px;">
                      <p style="font-size:13px;color:#666;">Have feedback or concerns?</p>
                      <a href="https://convelabs.com/contact" style="color:#B91C1C;font-weight:600;text-decoration:none;">Contact us directly →</a>
                    </div>
                    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
                  </div>
                </div>
              `);
            }
            break;
          }
          case 'review_request': {
            // Send both SMS and email for review requests
            if (TWILIO_ACCOUNT_SID && seq.patient_phone) {
              await sendSMS(seq.patient_phone, `Hi ${patientName}! Thank you for choosing ConveLabs. We'd love to hear about your experience. Leave us a Google review: https://g.page/r/CQYNAuLgDPeiEAI/review`);
            }
            if (MAILGUN_API_KEY && seq.patient_email) {
              await sendEmail(seq.patient_email, 'We\'d Love Your Feedback!', `
                <div style="font-family:Arial;max-width:600px;margin:0 auto;">
                  <div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                    <h2 style="margin:0;">How Did We Do?</h2>
                  </div>
                  <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
                    <p>Hi ${patientName},</p>
                    <p>Thank you for choosing ConveLabs! Your feedback means the world to us and helps other patients discover our luxury mobile phlebotomy services.</p>
                    <div style="text-align:center;margin:24px 0;">
                      <a href="https://g.page/r/CQYNAuLgDPeiEAI/review" style="display:inline-block;background:#B91C1C;color:white;padding:14px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">Leave a Google Review ⭐</a>
                    </div>
                    <p style="text-align:center;font-size:12px;color:#6b7280;">It takes less than 30 seconds and makes a huge difference.</p>
                    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
                  </div>
                </div>
              `);
            }
            break;
          }
          case 'results_checkin': {
            if (MAILGUN_API_KEY && seq.patient_email) {
              await sendEmail(seq.patient_email, 'Checking In — Have Your Results Come In?', `
                <div style="font-family:Arial;max-width:600px;margin:0 auto;">
                  <div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                    <h2 style="margin:0;">Results Check-In</h2>
                  </div>
                  <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
                    <p>Hi ${patientName},</p>
                    <p>We wanted to check in and see if your lab results have appeared in your laboratory's patient portal.</p>
                    <p>Results are available through your lab's portal (LabCorp, Quest, AdventHealth, or Orlando Health). If you haven't received them yet, they may still be processing.</p>
                    <p>If you need help, the specimen tracking ID we sent you can be provided to your doctor to locate your results.</p>
                    <p>Questions? Call us at <strong>(941) 527-9169</strong></p>
                    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
                  </div>
                </div>
              `);
            }
            break;
          }
          case 'membership_upsell': {
            if (MAILGUN_API_KEY && seq.patient_email) {
              await sendEmail(seq.patient_email, 'Save 25% on Every ConveLabs Visit', `
                <div style="font-family:Arial;max-width:600px;margin:0 auto;">
                  <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:white;padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h2 style="margin:0;">Become a ConveLabs Member</h2>
                    <p style="margin:6px 0 0;opacity:0.9;">Save on every visit, every time.</p>
                  </div>
                  <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
                    <p>Hi ${patientName},</p>
                    <p>As a valued ConveLabs patient, we'd like to offer you membership pricing:</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                      <tr style="background:#fef2f2;"><td style="padding:10px;font-weight:600;">Member ($99/yr)</td><td style="padding:10px;text-align:right;">Mobile: $130 <span style="color:#059669;">(save $20)</span></td></tr>
                      <tr><td style="padding:10px;font-weight:600;">VIP ($199/yr)</td><td style="padding:10px;text-align:right;">Mobile: $115 <span style="color:#059669;">(save $35)</span></td></tr>
                      <tr style="background:#fef2f2;"><td style="padding:10px;font-weight:600;">Concierge ($399/yr)</td><td style="padding:10px;text-align:right;">Mobile: $99 <span style="color:#059669;">(save $51)</span></td></tr>
                    </table>
                    <div style="text-align:center;margin:20px 0;">
                      <a href="https://convelabs.com/pricing" style="display:inline-block;background:#B91C1C;color:white;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;">View Membership Plans</a>
                    </div>
                    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
                  </div>
                </div>
              `);
            }
            break;
          }
          case 'referral_prompt': {
            if (TWILIO_ACCOUNT_SID && seq.patient_phone && referralCode) {
              await sendSMS(seq.patient_phone, `Hi ${patientName}! Share ConveLabs with a friend — you both get $25 off your next visit. Your code: ${referralCode}. Share this link: convelabs.com/book-now?ref=${referralCode}`);
            }
            break;
          }
          case 'rebooking_nudge': {
            if (MAILGUN_API_KEY && seq.patient_email) {
              await sendEmail(seq.patient_email, 'Time for Your Next Check-Up?', `
                <div style="font-family:Arial;max-width:600px;margin:0 auto;">
                  <div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                    <h2 style="margin:0;">Ready for Your Next Visit?</h2>
                  </div>
                  <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
                    <p>Hi ${patientName},</p>
                    <p>It's been 30 days since your last ConveLabs visit. Regular blood work is an important part of staying on top of your health.</p>
                    <p>Book your next appointment in under 60 seconds:</p>
                    <div style="text-align:center;margin:20px 0;">
                      <a href="https://convelabs.com/book-now" style="display:inline-block;background:#B91C1C;color:white;padding:14px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">Book Now</a>
                    </div>
                    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
                  </div>
                </div>
              `);
            }
            break;
          }
        }

        // Mark as sent
        await supabase.from('post_visit_sequences').update({
          status: 'sent',
          sent_at: now,
        }).eq('id', seq.id);

        processed++;
      } catch (stepErr) {
        console.error(`Error processing sequence ${seq.id}:`, stepErr);
      }
    }

    console.log(`Post-visit sequences processed: ${processed}/${(pending || []).length}`);

    return new Response(
      JSON.stringify({ success: true, processed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Process sequences error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Helper: send SMS
  async function sendSMS(phone: string, body: string) {
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!;
    const formattedPhone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    const formData = new URLSearchParams();
    formData.append('To', formattedPhone);
    formData.append('From', TWILIO_PHONE_NUMBER);
    formData.append('Body', body);
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });
  }

  // Helper: send email
  async function sendEmail(to: string, subject: string, html: string) {
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY')!;
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
    const formData = new FormData();
    formData.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('html', html);
    await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: formData,
    });
  }
});
