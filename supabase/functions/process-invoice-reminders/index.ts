import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from '../_shared/stripe.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/**
 * Hormozi-style invoice escalation:
 *
 * T+0h   → Invoice sent (handled by send-appointment-invoice)
 * T+6h   → Gentle reminder — friendly nudge, pay link
 * T+11h  → Final warning — "cancelling in 1 hour"
 * T+12h  → Auto-cancel — void Stripe invoice, cancel appointment
 *
 * VIP patients are excluded from ALL reminders and auto-cancellation.
 * They pay on their own time.
 *
 * invoice_status lifecycle: sent → reminded → final_warning → paid | cancelled
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE_NUMBER');
    const now = Date.now();

    let gentleReminders = 0;
    let finalWarnings = 0;
    let cancellations = 0;

    // ── Helper: resolve patient contact info ──────────────────────
    const getContact = (appt: any) => {
      // Prefer direct columns (populated by ScheduleAppointmentModal)
      let name = appt.patient_name || '';
      let email = appt.patient_email || '';
      let phone = appt.patient_phone || '';

      // Fall back to notes parsing for older appointments
      if (!name) { const m = appt.notes?.match(/Patient:\s*([^|]+)/); if (m) name = m[1].trim(); }
      if (!email) { const m = appt.notes?.match(/Email:\s*([^|]+)/); if (m) email = m[1].trim(); }
      if (!phone) { const m = appt.notes?.match(/Phone:\s*([^|]+)/); if (m) phone = m[1].trim(); }

      return { name: name || 'there', email, phone };
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
    // Prefer stored URL → fetch from Stripe → fallback to booking page
    const getPayLink = async (appt: any): Promise<string> => {
      // 1. Use stored hosted URL (set by send-appointment-invoice)
      if (appt.stripe_invoice_url) return appt.stripe_invoice_url;

      // 2. Fetch from Stripe for older invoices without stored URL
      if (appt.stripe_invoice_id) {
        try {
          const inv = await stripe.invoices.retrieve(appt.stripe_invoice_id);
          if (inv.hosted_invoice_url) {
            // Backfill the URL for next time
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
    // PHASE 1: Gentle Reminder (invoice sent 6+ hours ago, not VIP)
    // ════════════════════════════════════════════════════════════════
    const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000).toISOString();

    const { data: gentleAppts } = await supabase
      .from('appointments')
      .select('*')
      .eq('invoice_status', 'sent')
      .eq('is_vip', false)
      .lt('invoice_sent_at', sixHoursAgo)
      .not('status', 'eq', 'cancelled');

    for (const appt of (gentleAppts || [])) {
      const { name, email, phone } = getContact(appt);
      const payLink = await getPayLink(appt);
      const amount = `$${(appt.total_amount || 0).toFixed(2)}`;

      await supabase.from('appointments').update({
        invoice_status: 'reminded',
        invoice_reminder_sent_at: new Date().toISOString(),
      }).eq('id', appt.id);

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

      await sendSMS(phone,
        `Hi ${name}! Friendly reminder — your ConveLabs invoice (${amount}) is still open. Pay here: ${payLink} — Looking forward to your visit!`
      );

      gentleReminders++;
    }

    // ════════════════════════════════════════════════════════════════
    // PHASE 2: Final Warning (reminded 5+ hours ago = ~11h total)
    // ════════════════════════════════════════════════════════════════
    const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000).toISOString();

    const { data: warningAppts } = await supabase
      .from('appointments')
      .select('*')
      .eq('invoice_status', 'reminded')
      .eq('is_vip', false)
      .lt('invoice_reminder_sent_at', fiveHoursAgo)
      .not('status', 'eq', 'cancelled');

    for (const appt of (warningAppts || [])) {
      const { name, email, phone } = getContact(appt);
      const payLink = await getPayLink(appt);
      const amount = `$${(appt.total_amount || 0).toFixed(2)}`;

      await supabase.from('appointments').update({
        invoice_status: 'final_warning',
      }).eq('id', appt.id);

      await sendEmail(email, `Action Required — Your Appointment Will Be Cancelled in 1 Hour`, emailWrapper(
        '#d97706', '⏰ Final Notice',
        `<p>Hi ${name},</p>
         <p>Your ConveLabs invoice of <strong>${amount}</strong> is still unpaid.</p>
         <p style="color:#b45309;font-weight:600;font-size:15px;">Your appointment will be automatically cancelled in approximately 1 hour if payment is not received.</p>
         <p>We don't want to cancel — please pay now to keep your spot:</p>
         <div style="text-align:center;margin:20px 0;">
           <a href="${payLink}" style="display:inline-block;background:#d97706;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;">Pay ${amount} — Keep My Appointment</a>
         </div>
         <p style="font-size:13px;color:#6b7280;">If you're having trouble paying or need assistance, call us at (941) 527-9169.</p>`
      ));

      await sendSMS(phone,
        `${name}, your ConveLabs appointment will be cancelled in ~1 hour due to unpaid invoice (${amount}). Pay now to keep your spot: ${payLink}`
      );

      finalWarnings++;
    }

    // ════════════════════════════════════════════════════════════════
    // PHASE 3: Auto-Cancel (final_warning sent 1+ hour ago = ~12h)
    // ════════════════════════════════════════════════════════════════
    const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();

    const { data: cancelAppts } = await supabase
      .from('appointments')
      .select('*')
      .eq('invoice_status', 'final_warning')
      .eq('is_vip', false)
      .lt('invoice_reminder_sent_at', oneHourAgo)   // reminder_sent_at was set during Phase 1
      .not('status', 'eq', 'cancelled');

    for (const appt of (cancelAppts || [])) {
      const { name, email, phone } = getContact(appt);

      // Cancel appointment
      await supabase.from('appointments').update({
        status: 'cancelled',
        invoice_status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: 'Auto-cancelled: invoice unpaid after 12 hours',
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

      await sendSMS(phone,
        `Hi ${name}, your ConveLabs appointment has been cancelled due to non-payment. You can easily rebook at convelabs.com/book-now — we'd love to see you!`
      );

      cancellations++;
    }

    console.log(`Invoice processing: ${gentleReminders} gentle reminders, ${finalWarnings} final warnings, ${cancellations} cancellations`);

    return new Response(
      JSON.stringify({
        success: true,
        gentleReminders,
        finalWarnings,
        cancellations,
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
