import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { shouldSendNow } from '../_shared/quiet-hours.ts';

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
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Quiet-hours guardrail — no patient sends 9pm-8am ET.
  const gate = shouldSendNow('post_visit');
  if (!gate.allow) {
    console.log(`[quiet-hours] process-post-visit-sequences deferred: ${gate.reason}`);
    return new Response(JSON.stringify({ deferred: true, reason: gate.reason, nextAllowedAt: gate.nextAllowedAt }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

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
                // Treat appointment_date as a calendar-date string (yyyy-MM-dd)
                // anchored at noon UTC so format never rolls into prior day.
                // (Bug avoided: Hawthorn-pattern off-by-one weekday.)
                try {
                  const dStr = String(appt.appointment_date).substring(0, 10);
                  apptDate = new Date(dStr + 'T12:00:00Z').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
                  });
                } catch { apptDate = appt.appointment_date?.substring(0,10) || ''; }
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
              // Real survey: 1-click 5-star rating links → submit-feedback
              // edge fn captures into feedback_responses, SMS owner on rating <=2,
              // and serves a thank-you page (with comment box) inline.
              const apptId = seq.appointment_id || '';
              const token = apptId.replace(/-/g, '').slice(-8);
              const fnBase = `${Deno.env.get('SUPABASE_URL') || 'https://yluyonhrxxtyuiyrdixl.supabase.co'}/functions/v1/submit-feedback`;
              const starLink = (n: number) =>
                `${fnBase}?appt=${apptId}&rating=${n}&t=${token}`;
              const starCell = (n: number) => `
                <td style="text-align:center;padding:6px;">
                  <a href="${starLink(n)}" style="display:inline-block;width:48px;height:48px;line-height:48px;background:#fef3c7;border:2px solid #fcd34d;border-radius:10px;color:#b45309;text-decoration:none;font-size:20px;font-weight:800;">${n}★</a>
                </td>`;
              await sendEmail(seq.patient_email, 'How was your ConveLabs visit?', `
                <div style="font-family:Arial;max-width:600px;margin:0 auto;">
                  <div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                    <h2 style="margin:0;">How was your visit?</h2>
                  </div>
                  <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
                    <p>Hi ${patientName},</p>
                    <p>Quick favor — how would you rate your ConveLabs visit? Tap a number, that's it.</p>
                    <table cellpadding="0" cellspacing="0" style="margin:18px auto;"><tr>${starCell(1)}${starCell(2)}${starCell(3)}${starCell(4)}${starCell(5)}</tr></table>
                    <p style="text-align:center;font-size:13px;color:#6b7280;">1 = needs work · 5 = exceptional</p>
                    <p style="font-size:13px;color:#6b7280;text-align:center;margin-top:24px;">Or call us directly at <strong>(941) 527-9169</strong></p>
                    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
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
            // Disabled 2026-05-03 — owner opted out of chasing lab-result
            // delivery (the "no" reply triggered an owner SMS asking them
            // to call the lab on the patient's behalf, which they don't
            // want to be responsible for). Mark any leftover pending row
            // as 'skipped' and short-circuit. Step seeding already removed
            // from trigger-post-visit-sequence.
            await admin.from('post_visit_sequences')
              .update({ status: 'skipped' })
              .eq('id', seq.id);
            break;
          }
          // Legacy results_checkin send path — disabled, kept for git history
          case '__results_checkin_legacy': {
            if (MAILGUN_API_KEY && seq.patient_email) {
              // 1-click yes/no → submit-results-checkin edge fn captures into
              // lab_results_checkin and SMS-alerts owner on "no" so they can
              // pull the lab portal directly.
              const apptId = seq.appointment_id || '';
              const token = apptId.replace(/-/g, '').slice(-8);
              const fnBase = `${Deno.env.get('SUPABASE_URL') || 'https://yluyonhrxxtyuiyrdixl.supabase.co'}/functions/v1/submit-results-checkin`;
              const yesUrl = `${fnBase}?appt=${apptId}&got=yes&t=${token}`;
              const noUrl = `${fnBase}?appt=${apptId}&got=no&t=${token}`;
              await sendEmail(seq.patient_email, 'Quick check — got your lab results yet?', `
                <div style="font-family:Arial;max-width:600px;margin:0 auto;">
                  <div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                    <h2 style="margin:0;">Got your results?</h2>
                  </div>
                  <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
                    <p>Hi ${patientName},</p>
                    <p>It's been about 3 days since your visit. Have your results landed in the lab portal yet?</p>
                    <table cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr>
                      <td style="padding:0 8px;"><a href="${yesUrl}" style="display:inline-block;background:#16a34a;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">✓ Yes, got them</a></td>
                      <td style="padding:0 8px;"><a href="${noUrl}" style="display:inline-block;background:#dc2626;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">✗ Still waiting</a></td>
                    </tr></table>
                    <p style="font-size:13px;color:#6b7280;text-align:center;">Tap "still waiting" and we'll chase the lab on your behalf.</p>
                    <p style="margin-top:24px;font-size:13px;color:#6b7280;">Most labs (LabCorp, Quest, AdventHealth, Orlando Health) post results within 48-72h. Questions? Call <strong>(941) 527-9169</strong>.</p>
                    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
                  </div>
                </div>
              `);
            }
            break;
          }
          case 'membership_upsell': {
            if (MAILGUN_API_KEY && seq.patient_email) {
              // ── Hormozi-grade rewrite (post Founding 50 launch) ──
              // 1. Pull live seat count — the scarcity line is real, not fake.
              // 2. If seats are closed, gracefully degrade to standard VIP
              //    pitch (no broken "13 left" line).
              // 3. Direct-to-checkout link routes through /join?tier=vip with
              //    email pre-filled so it's 1-click, not 4.
              let seatsLine = '';
              let seatsOpen = true;
              let seatsRemaining = 50;
              try {
                const { data: seatStatus } = await supabase.rpc('get_founding_seats_status' as any, { p_tier: 'vip' });
                if (seatStatus && typeof seatStatus === 'object') {
                  seatsOpen = !!(seatStatus as any).is_open && (seatStatus as any).remaining > 0;
                  seatsRemaining = (seatStatus as any).remaining || 0;
                }
              } catch (_e) { /* best-effort */ }

              if (seatsOpen) {
                seatsLine = `
                  <div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:2px solid #d97706;border-radius:12px;padding:16px;margin:18px 0;">
                    <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:800;">Founding 50 · still open</p>
                    <p style="margin:0;font-size:15px;color:#451a03;font-weight:700;">
                      ${seatsRemaining === 1 ? 'Last Founding seat available' : `${seatsRemaining} Founding VIP seats left`}
                    </p>
                    <p style="margin:6px 0 0;font-size:13px;color:#78350f;line-height:1.5;">
                      First 50 VIP members lock $199/yr for life — never raises, not even as our standard rate does.
                    </p>
                  </div>
                `;
              }

              const vipCheckoutUrl = `https://convelabs.com/join?tier=vip&email=${encodeURIComponent(seq.patient_email)}`;

              const subject = seatsOpen
                ? `${patientName}, your Founding VIP seat is still open`
                : `${patientName}, a quick thank-you from the ConveLabs team`;

              await sendEmail(seq.patient_email, subject, `
                <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">
                  <div style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);color:#fff;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center;">
                    <h2 style="margin:0;font-size:20px;">A quick note from Nico</h2>
                    <p style="margin:6px 0 0;font-size:13px;color:#fecaca;">Founder · ConveLabs Concierge Lab Services</p>
                  </div>
                  <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:0;padding:28px 24px;border-radius:0 0 12px 12px;color:#111827;line-height:1.65;font-size:14.5px;">
                    <p>Hi ${patientName},</p>
                    <p>Thank you for trusting us with your lab work this week. I wanted to reach out personally to share something worth considering.</p>

                    ${seatsLine}

                    <h3 style="margin:20px 0 8px;color:#B91C1C;font-size:15px;">Your $199 Founding VIP unlocks</h3>
                    <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:10px 0 18px;">
                      <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb;">
                        <td style="padding:12px 14px;font-size:13px;color:#111827;"><strong>12 months of VIP membership</strong><br><span style="color:#6b7280;font-size:12px;">Visits at $115 (save $35 each draw)</span></td>
                        <td style="padding:12px 14px;text-align:right;font-weight:700;color:#111827;font-size:13px;">$199</td>
                      </tr>
                      <tr style="background:#fef3c7;border-bottom:1px solid #fde68a;">
                        <td style="padding:12px 14px;font-size:13px;color:#78350f;"><strong>🔒 Founding rate-lock for life</strong><br><span style="color:#92400e;font-size:12px;">Your $199 never raises</span></td>
                        <td style="padding:12px 14px;text-align:right;font-weight:700;color:#92400e;font-size:13px;">+$50/yr</td>
                      </tr>
                      <tr style="background:#fef3c7;border-bottom:1px solid #fde68a;">
                        <td style="padding:12px 14px;font-size:13px;color:#78350f;"><strong>👪 Free family add-on</strong><br><span style="color:#92400e;font-size:12px;">1 extra household member at no extra cost</span></td>
                        <td style="padding:12px 14px;text-align:right;font-weight:700;color:#92400e;font-size:13px;">+$75</td>
                      </tr>
                      <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb;">
                        <td style="padding:12px 14px;font-size:13px;color:#111827;"><strong>⚡ Priority same-day booking</strong><br><span style="color:#6b7280;font-size:12px;">Skip the +$100 STAT surcharge</span></td>
                        <td style="padding:12px 14px;text-align:right;font-weight:700;color:#111827;font-size:13px;">+$150</td>
                      </tr>
                      <tr style="background:#f9fafb;">
                        <td style="padding:12px 14px;font-size:13px;color:#111827;"><strong>🏅 Founding Member badge + early access</strong><br><span style="color:#6b7280;font-size:12px;">Numbered badge · first access to new offerings</span></td>
                        <td style="padding:12px 14px;text-align:right;font-weight:700;color:#111827;font-size:13px;">priceless</td>
                      </tr>
                      <tr style="background:#ecfdf5;border-top:2px solid #a7f3d0;">
                        <td style="padding:14px;font-size:14px;font-weight:700;color:#065f46;">Stacked value</td>
                        <td style="padding:14px;text-align:right;color:#065f46;font-size:14px;">
                          <span style="text-decoration:line-through;color:#9ca3af;font-weight:400;margin-right:8px;">$474</span>
                          <span style="font-weight:800;">$199</span>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0 0 10px;font-size:14px;color:#374151;"><strong>Pays for itself in 1 visit.</strong> Then the rest of the year is free.</p>

                    <div style="text-align:center;margin:22px 0 10px;">
                      <a href="${vipCheckoutUrl}" style="display:inline-block;background:#B91C1C;color:#ffffff;padding:15px 38px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15.5px;">
                        ${seatsOpen ? 'Claim my Founding seat →' : 'Join VIP — $199/yr →'}
                      </a>
                    </div>
                    <p style="text-align:center;font-size:12px;color:#6b7280;margin:0;">Your email is already on file — one click checkout.</p>

                    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 16px;margin:22px 0 8px;">
                      <p style="margin:0;font-size:13px;color:#14532d;line-height:1.55;">
                        <strong style="color:#166534;">30-day full refund.</strong> If Founding VIP isn't right for you, cancel within 30 days — full refund, no questions. After that it's non-refundable <em>unless</em> you haven't used any benefits.
                      </p>
                    </div>

                    <p style="margin:20px 0 6px;font-size:14px;">Questions? Email <a href="mailto:info@convelabs.com" style="color:#B91C1C;">info@convelabs.com</a> or text me at <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a>. I read every message myself.</p>
                    <p style="margin:16px 0 0;">With gratitude,<br>
                    <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
                    <em>Founder, ConveLabs</em></p>

                    <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0 14px;">
                    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:0;line-height:1.55;">
                      You're receiving this because you recently had a visit with ConveLabs.<br>
                      1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169<br>
                      <a href="https://convelabs.com/unsubscribe?email=${encodeURIComponent(seq.patient_email)}" style="color:#9ca3af;">Unsubscribe from marketing emails</a> — appointment notifications continue either way.
                    </p>
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
          case 'google_review': {
            // H3: Ask for a Google review 48h post-visit.
            // 1. Resolve the review URL — prefer the org's url, fall back to
            //    the corporate default stored in business_metrics.
            // 2. Skip entirely if neither is set (no blind asks).
            // 3. Skip if patient was already asked in the last 90 days.
            let reviewUrl: string | null = null;
            if (seq.appointment_id) {
              const { data: appt } = await supabase
                .from('appointments')
                .select('organization_id, patient_name')
                .eq('id', seq.appointment_id)
                .maybeSingle();
              if (appt?.organization_id) {
                const { data: org } = await supabase
                  .from('organizations')
                  .select('google_review_url, google_review_enabled')
                  .eq('id', appt.organization_id)
                  .maybeSingle();
                if (org?.google_review_enabled && org.google_review_url) {
                  reviewUrl = org.google_review_url;
                }
              }
            }
            if (!reviewUrl) {
              const { data: defaultRow } = await supabase
                .from('business_metrics')
                .select('value_text')
                .eq('metric_key', 'default_google_review_url')
                .maybeSingle();
              reviewUrl = (defaultRow?.value_text || '').trim() || null;
            }
            if (!reviewUrl) {
              console.log(`[google_review] seq ${seq.id}: no review URL configured — skipping`);
              break;
            }

            // Dedup within 90d by patient
            if (seq.patient_id) {
              const { data: priorAsk } = await supabase
                .from('review_request_log')
                .select('id')
                .eq('patient_id', seq.patient_id)
                .gte('sent_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
                .limit(1)
                .maybeSingle();
              if (priorAsk) {
                console.log(`[google_review] seq ${seq.id}: patient ${seq.patient_id} already asked in last 90d — skipping`);
                break;
              }
            }

            const smsText = `Hi ${patientName}, if your ConveLabs visit was a good experience, would you share a quick Google review? Takes 30 seconds: ${reviewUrl}`;
            let smsSent = false;
            let emailSent = false;

            if (TWILIO_ACCOUNT_SID && seq.patient_phone) {
              try {
                await sendSMS(seq.patient_phone, smsText);
                smsSent = true;
              } catch (e) { console.warn(`[google_review] SMS failed:`, e); }
            }

            if (MAILGUN_API_KEY && seq.patient_email) {
              try {
                await sendEmail(seq.patient_email, `One quick favor, ${patientName}?`, `
                  <div style="font-family:Arial;max-width:600px;margin:0 auto;">
                    <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                      <h2 style="margin:0;font-size:20px;">Would you share your ConveLabs experience?</h2>
                    </div>
                    <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
                      <p>Hi ${patientName},</p>
                      <p>If your recent visit went well, a quick Google review helps other patients find us — and is the single biggest thing you can do to support a small business like ours.</p>
                      <div style="text-align:center;margin:24px 0;">
                        <a href="${reviewUrl}" style="display:inline-block;background:#B91C1C;color:white;padding:14px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">Leave a Google Review</a>
                      </div>
                      <p style="font-size:13px;color:#6b7280;">Takes about 30 seconds. Thanks for trusting us with your care.</p>
                      <p style="font-size:12px;color:#9ca3af;margin-top:20px;">If your experience was anything less than 5 stars, please <a href="mailto:info@convelabs.com" style="color:#B91C1C;">reply to this email first</a> so we can make it right before you post.</p>
                    </div>
                  </div>
                `);
                emailSent = true;
              } catch (e) { console.warn(`[google_review] email failed:`, e); }
            }

            if (smsSent || emailSent) {
              // Log the ask so we can measure sent→clicked→rating conversion
              await supabase.from('review_request_log').insert({
                appointment_id: seq.appointment_id,
                patient_id: seq.patient_id,
                patient_email: seq.patient_email,
                patient_phone: seq.patient_phone,
                channel: smsSent && emailSent ? 'both' : smsSent ? 'sms' : 'email',
                google_review_url: reviewUrl,
              });
              // And stamp the appointment so we don't re-queue
              if (seq.appointment_id) {
                await supabase.from('appointments')
                  .update({ review_request_sent_at: now })
                  .eq('id', seq.appointment_id);
              }
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
    formData.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
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
