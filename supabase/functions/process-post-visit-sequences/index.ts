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
                    <p style="text-align:center;font-size:32px;letter-spacing:8px;margin:20px 0;">
                      <a href="https://convelabs.com/rate?r=1&a=${seq.appointment_id}" style="text-decoration:none;">1</a>
                      <a href="https://convelabs.com/rate?r=2&a=${seq.appointment_id}" style="text-decoration:none;">2</a>
                      <a href="https://convelabs.com/rate?r=3&a=${seq.appointment_id}" style="text-decoration:none;">3</a>
                      <a href="https://convelabs.com/rate?r=4&a=${seq.appointment_id}" style="text-decoration:none;">4</a>
                      <a href="https://convelabs.com/rate?r=5&a=${seq.appointment_id}" style="text-decoration:none;">5</a>
                    </p>
                    <p style="text-align:center;font-size:11px;color:#9ca3af;">1 = Poor &nbsp;&nbsp; 5 = Excellent</p>
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
