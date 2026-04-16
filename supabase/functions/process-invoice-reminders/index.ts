import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from '../_shared/stripe.ts';
import { verifyRecipientEmail, verifyRecipientPhone } from '../_shared/verify-recipient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/**
 * Hormozi-style SMART invoice escalation v2
 *
 * KEY PRINCIPLES:
 * 1. Urgency scales with appointment proximity — someone booked 3 weeks out
 *    gets gentle nudges; someone booked tomorrow gets aggressive follow-up.
 * 2. QUIET HOURS: No messages before 8 AM or after 8 PM Eastern.
 *    If a message is due at 5:45 AM, it waits until 8 AM.
 * 3. VIP patients are excluded from ALL reminders and auto-cancellation.
 *
 * ESCALATION (phase-gap based — prevents tier-shift bug):
 *
 * Phase 1 — Gentle Reminder:
 *   Triggers X hours after invoice sent (urgent=3h, soon=6h, relaxed=24h)
 *
 * Phase 2 — Final Warning:
 *   Triggers ≥12 hours after the reminder was sent (not invoice!)
 *
 * Phase 3 — Auto-Cancel:
 *   Triggers ≥24 hours after the final warning was sent (not invoice!)
 *   AND appointment must be within 7 days (no urgency to cancel far-out appts)
 *
 * MINIMUM TIMELINE: invoice → 3h → reminder → 12h → warning → 24h → cancel
 * = At least 39 hours from invoice to cancellation (urgent tier).
 * = Patient always gets 24h after the "your appt will be cancelled" message.
 *
 * invoice_status lifecycle: sent → reminded → final_warning → paid | cancelled
 */

// ── Quiet hours: 8 AM – 8 PM Eastern ─────────────────────────────
const QUIET_START_HOUR = 20; // 8 PM ET
const QUIET_END_HOUR = 8;   // 8 AM ET

function isQuietHours(): boolean {
  // Get current hour in America/New_York
  const etNow = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etHour = new Date(etNow).getHours();
  // Quiet = 8 PM (20) through 7:59 AM (< 8)
  return etHour >= QUIET_START_HOUR || etHour < QUIET_END_HOUR;
}

// ── Appointment proximity tier ────────────────────────────────────
type Tier = 'urgent' | 'soon' | 'relaxed';

function getApptTier(appointmentDate: string, appointmentTime: string): Tier {
  // Build the actual appointment datetime
  const dateStr = appointmentDate.split('T')[0]; // "2026-05-11"
  const apptMs = new Date(`${dateStr}T${appointmentTime}Z`).getTime();
  const hoursUntil = (apptMs - Date.now()) / (1000 * 60 * 60);

  if (hoursUntil <= 48) return 'urgent';
  if (hoursUntil <= 168) return 'soon'; // 7 days
  return 'relaxed';
}

// Hours after invoice_sent_at before first reminder triggers
const REMINDER_THRESHOLDS = {
  urgent:  3,   // ≤48h to appt: remind 3h after invoice
  soon:    6,   // 2-7 days:     remind 6h after invoice
  relaxed: 24,  // 7+ days:      remind 24h after invoice
} as const;

// MINIMUM hours after the PREVIOUS phase before escalating.
// This prevents the tier-shift bug where changing from relaxed→urgent
// would immediately trigger all phases in one cron run.
const MIN_HOURS_REMINDER_TO_WARNING = 12;   // At least 12h between reminder and final warning
const MIN_HOURS_WARNING_TO_CANCEL = 24;     // At least 24h between final warning and cancel

// Never auto-cancel an appointment that's more than 7 days away.
// There's no urgency to free the slot — just keep reminding.
const NO_CANCEL_IF_MORE_THAN_HOURS = 168; // 7 days

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Global notification kill switch
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ success: true, suspended: true, message: 'Notifications suspended' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE_NUMBER');
    const now = Date.now();

    // ── QUIET HOURS GATE ──────────────────────────────────────────
    // If it's outside 8 AM – 8 PM Eastern, skip ALL messaging.
    // The cron still runs (to keep checking), but no messages go out.
    if (isQuietHours()) {
      console.log('Quiet hours (before 8 AM or after 8 PM ET) — skipping all messages.');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'quiet_hours' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let gentleReminders = 0;
    let finalWarnings = 0;
    let cancellations = 0;
    let skippedRelaxed = 0;

    // ── Helper: resolve patient contact info ──────────────────────
    const getContact = (appt: any) => {
      let name = appt.patient_name || '';
      let email = appt.patient_email || '';
      let phone = appt.patient_phone || '';

      // Fall back to notes parsing for older appointments
      if (!name) { const m = appt.notes?.match(/Patient:\s*([^|]+)/); if (m) name = m[1].trim(); }
      if (!email) { const m = appt.notes?.match(/Email:\s*([^|]+)/); if (m) email = m[1].trim(); }
      if (!phone) { const m = appt.notes?.match(/Phone:\s*([^|]+)/); if (m) phone = m[1].trim(); }

      return { name: name || 'there', email, phone };
    };

    // ── Helper: get appointment datetime in ms ────────────────────
    const getApptTimeMs = (appt: any): number => {
      const dateStr = (appt.appointment_date || '').split('T')[0];
      const timeStr = appt.appointment_time || '12:00:00';
      return new Date(`${dateStr}T${timeStr}Z`).getTime();
    };

    // ── Helper: send email ────────────────────────────────────────
    const sendEmail = async (to: string, subject: string, html: string) => {
      if (!MAILGUN_API_KEY || !to) return;
      const fd = new FormData();
      fd.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
      fd.append('to', to);
      fd.append('subject', subject);
      fd.append('html', html);
      await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: fd,
      });
    };

    // ── Helper: send SMS ──────────────────────────────────────────
    const sendSMS = async (to: string, body: string) => {
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE || !to) return;
      const cleanPhone = to.replace(/\D/g, '');
      if (cleanPhone.length < 10) return;
      const formattedPhone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;
      const params = new URLSearchParams({ To: formattedPhone, From: TWILIO_PHONE, Body: body });
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });
    };

    // ── Helper: Stripe pay link ───────────────────────────────────
    const getPayLink = async (appt: any): Promise<string> => {
      if (appt.stripe_invoice_url) return appt.stripe_invoice_url;
      if (appt.stripe_invoice_id) {
        try {
          const inv = await stripe.invoices.retrieve(appt.stripe_invoice_id);
          if (inv.hosted_invoice_url) {
            await supabase.from('appointments').update({
              stripe_invoice_url: inv.hosted_invoice_url,
            }).eq('id', appt.id);
            return inv.hosted_invoice_url;
          }
        } catch (e) {
          console.error(`Failed to fetch Stripe invoice ${appt.stripe_invoice_id}:`, e);
        }
      }
      return 'https://convelabs.com/book-now';
    };

    // ── Helper: email wrapper ─────────────────────────────────────
    const emailWrapper = (headerBg: string, headerText: string, body: string) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:${headerBg};color:white;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
          <h2 style="margin:0;">${headerText}</h2>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
          ${body}
          <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:24px;">
            ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810<br/>
            Questions? Call (941) 527-9169
          </p>
        </div>
      </div>`;

    // ════════════════════════════════════════════════════════════════
    // PHASE 1: Gentle Reminder
    // Trigger: invoice_status = 'sent' AND enough time has passed
    //   urgent (≤48h to appt):  3h after invoice
    //   soon   (2-7 days):      6h after invoice
    //   relaxed (7+ days):      24h after invoice
    // ════════════════════════════════════════════════════════════════
    const { data: sentAppts } = await supabase
      .from('appointments')
      .select('*')
      .eq('invoice_status', 'sent')
      .eq('is_vip', false)
      .not('status', 'eq', 'cancelled');

    for (const appt of (sentAppts || [])) {
      const tier = getApptTier(appt.appointment_date, appt.appointment_time);
      const thresholdHours = REMINDER_THRESHOLDS[tier];
      const invoiceSentAt = new Date(appt.invoice_sent_at).getTime();
      const hoursSinceSent = (now - invoiceSentAt) / (1000 * 60 * 60);

      if (hoursSinceSent < thresholdHours) continue; // Not time yet

      const { name, email, phone } = getContact(appt);
      const payLink = await getPayLink(appt);
      const amount = `$${(appt.total_amount || 0).toFixed(2)}`;

      await supabase.from('appointments').update({
        invoice_status: 'reminded',
        invoice_reminder_sent_at: new Date().toISOString(),
      }).eq('id', appt.id);

      const emailCheck1 = await verifyRecipientEmail(appt.id, email, name);
      if (!emailCheck1.safe) {
        console.warn(`HIPAA guard blocked email to ${email}: ${emailCheck1.reason}`);
      } else {
        await sendEmail(email, `Friendly Reminder — Your ${amount} ConveLabs Invoice`, emailWrapper(
          '#1e40af', 'Friendly Reminder',
          `<p>Hi ${name},</p>
           <p>Just a quick reminder — your invoice of <strong>${amount}</strong> for your upcoming ConveLabs visit is still open.</p>
           <p>You can pay in under 30 seconds using the link below:</p>
           <div style="text-align:center;margin:20px 0;">
             <a href="${payLink}" style="display:inline-block;background:#1e40af;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;">Pay ${amount} Now</a>
           </div>
           <p style="font-size:13px;color:#6b7280;">If you've already paid, please disregard this message. We're looking forward to seeing you!</p>`
        ));
      }

      const phoneCheck1 = await verifyRecipientPhone(appt.id, phone, name);
      if (!phoneCheck1.safe) {
        console.warn(`HIPAA guard blocked SMS to ${phone}: ${phoneCheck1.reason}`);
      } else {
        await sendSMS(phone,
          `Hi ${name}! Friendly reminder — your ConveLabs invoice (${amount}) is still open. Pay here: ${payLink} — Looking forward to your visit!`
        );
      }

      console.log(`[REMINDER] ${name} (${tier} tier, ${hoursSinceSent.toFixed(1)}h since invoice)`);
      gentleReminders++;
    }

    // ════════════════════════════════════════════════════════════════
    // PHASE 2: Final Warning
    // Trigger: invoice_status = 'reminded' AND ≥12h since reminder sent
    // ════════════════════════════════════════════════════════════════
    const { data: remindedAppts } = await supabase
      .from('appointments')
      .select('*')
      .eq('invoice_status', 'reminded')
      .eq('is_vip', false)
      .not('status', 'eq', 'cancelled');

    for (const appt of (remindedAppts || [])) {
      // Use time since the REMINDER was sent, not since original invoice.
      // This prevents the tier-shift bug where a relaxed→urgent transition
      // would immediately satisfy thresholds based on invoice age.
      const reminderSentAt = appt.invoice_reminder_sent_at
        ? new Date(appt.invoice_reminder_sent_at).getTime()
        : new Date(appt.invoice_sent_at).getTime(); // fallback
      const hoursSinceReminder = (now - reminderSentAt) / (1000 * 60 * 60);

      // Must wait at least MIN_HOURS_REMINDER_TO_WARNING since the reminder
      if (hoursSinceReminder < MIN_HOURS_REMINDER_TO_WARNING) continue;

      const { name, email, phone } = getContact(appt);
      const payLink = await getPayLink(appt);
      const amount = `$${(appt.total_amount || 0).toFixed(2)}`;

      // Patient always gets at least 24h after the final warning before cancellation
      const cancelTimeLabel = '24 hours';

      await supabase.from('appointments').update({
        invoice_status: 'final_warning',
        invoice_final_warning_at: new Date().toISOString(),
      }).eq('id', appt.id);

      const emailCheck2 = await verifyRecipientEmail(appt.id, email, name);
      if (!emailCheck2.safe) {
        console.warn(`HIPAA guard blocked email to ${email}: ${emailCheck2.reason}`);
      } else {
        await sendEmail(email, `Action Required — Your Appointment Will Be Cancelled`, emailWrapper(
          '#d97706', '⏰ Final Notice',
          `<p>Hi ${name},</p>
           <p>Your ConveLabs invoice of <strong>${amount}</strong> is still unpaid.</p>
           <p style="color:#b45309;font-weight:600;font-size:15px;">Your appointment will be automatically cancelled in ${cancelTimeLabel} if payment is not received.</p>
           <p>We don't want to cancel — please pay now to keep your spot:</p>
           <div style="text-align:center;margin:20px 0;">
             <a href="${payLink}" style="display:inline-block;background:#d97706;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;">Pay ${amount} — Keep My Appointment</a>
           </div>
           <p style="font-size:13px;color:#6b7280;">If you're having trouble paying or need assistance, call us at (941) 527-9169.</p>`
        ));
      }

      const phoneCheck2 = await verifyRecipientPhone(appt.id, phone, name);
      if (!phoneCheck2.safe) {
        console.warn(`HIPAA guard blocked SMS to ${phone}: ${phoneCheck2.reason}`);
      } else {
        await sendSMS(phone,
          `${name}, your ConveLabs appointment will be cancelled in ${cancelTimeLabel} due to unpaid invoice (${amount}). Pay now to keep your spot: ${payLink}`
        );
      }

      console.log(`[FINAL WARNING] ${name} (${tier} tier, ${hoursUntilAppt.toFixed(1)}h until appt)`);
      finalWarnings++;
    }

    // ════════════════════════════════════════════════════════════════
    // PHASE 3: Auto-Cancel
    // Trigger: invoice_status = 'final_warning' AND ≥24h since warning
    //          AND appointment is within 7 days (no urgency otherwise)
    // ════════════════════════════════════════════════════════════════
    const { data: warningAppts } = await supabase
      .from('appointments')
      .select('*')
      .eq('invoice_status', 'final_warning')
      .eq('is_vip', false)
      .not('status', 'eq', 'cancelled');

    for (const appt of (warningAppts || [])) {
      const apptTimeMs = getApptTimeMs(appt);
      const hoursUntilAppt = (apptTimeMs - now) / (1000 * 60 * 60);

      // SAFEGUARD: Never auto-cancel if the appointment is more than 7 days away.
      // There's no urgency — just keep the final_warning status and wait.
      if (hoursUntilAppt > NO_CANCEL_IF_MORE_THAN_HOURS) {
        console.log(`Skipping cancel for appt ${appt.id} — ${hoursUntilAppt.toFixed(0)}h away, no urgency`);
        skippedRelaxed++;
        continue;
      }

      // Use time since the FINAL WARNING was sent, not since original invoice.
      const warningSentAt = appt.invoice_final_warning_at
        ? new Date(appt.invoice_final_warning_at).getTime()
        : new Date(appt.invoice_sent_at).getTime(); // fallback
      const hoursSinceWarning = (now - warningSentAt) / (1000 * 60 * 60);

      // Must wait at least MIN_HOURS_WARNING_TO_CANCEL since the final warning
      if (hoursSinceWarning < MIN_HOURS_WARNING_TO_CANCEL) {
        skippedRelaxed++;
        continue;
      }

      const { name, email, phone } = getContact(appt);

      // Cancel appointment
      await supabase.from('appointments').update({
        status: 'cancelled',
        invoice_status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: `Auto-cancelled: invoice unpaid (${tier} tier)`,
      }).eq('id', appt.id);

      // Void Stripe invoice
      if (appt.stripe_invoice_id) {
        try {
          await stripe.invoices.voidInvoice(appt.stripe_invoice_id);
          console.log(`Voided Stripe invoice ${appt.stripe_invoice_id}`);
        } catch (err: any) {
          console.error(`Failed to void ${appt.stripe_invoice_id}:`, err.message);
        }
      }

      const emailCheck3 = await verifyRecipientEmail(appt.id, email, name);
      if (!emailCheck3.safe) {
        console.warn(`HIPAA guard blocked email to ${email}: ${emailCheck3.reason}`);
      } else {
        await sendEmail(email, `Your ConveLabs Appointment Has Been Cancelled`, emailWrapper(
          '#991B1B', 'Appointment Cancelled',
          `<p>Hi ${name},</p>
           <p>Your ConveLabs appointment has been cancelled because payment was not received within the required timeframe.</p>
           <p>Your appointment slot has been released and is now available for other patients.</p>
           <p><strong>Want to rebook?</strong> We'd love to continue serving you:</p>
           <div style="text-align:center;margin:20px 0;">
             <a href="https://convelabs.com/book-now" style="display:inline-block;background:#B91C1C;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;">Book a New Appointment</a>
           </div>`
        ));
      }

      const phoneCheck3 = await verifyRecipientPhone(appt.id, phone, name);
      if (!phoneCheck3.safe) {
        console.warn(`HIPAA guard blocked SMS to ${phone}: ${phoneCheck3.reason}`);
      } else {
        await sendSMS(phone,
          `Hi ${name}, your ConveLabs appointment has been cancelled due to non-payment. You can easily rebook at convelabs.com/book-now — we'd love to see you!`
        );
      }

      console.log(`[CANCELLED] ${name} (${hoursUntilAppt.toFixed(1)}h until appt, ${hoursSinceWarning.toFixed(1)}h since warning)`);
      cancellations++;
    }

    console.log(`Invoice processing: ${gentleReminders} reminders, ${finalWarnings} final warnings, ${cancellations} cancellations, ${skippedRelaxed} not yet due`);

    return new Response(
      JSON.stringify({
        success: true,
        gentleReminders,
        finalWarnings,
        cancellations,
        skippedRelaxed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Invoice processing error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
