import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from '../_shared/stripe.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    const now = new Date().toISOString();

    let remindersCount = 0;
    let cancellationsCount = 0;

    // 1. Find overdue invoices that need a reminder (past due, not VIP, status = 'sent')
    const { data: overdueAppts } = await supabase
      .from('appointments')
      .select('*')
      .eq('invoice_status', 'sent')
      .eq('is_vip', false)
      .lt('invoice_due_at', now)
      .not('status', 'eq', 'cancelled');

    for (const appt of (overdueAppts || [])) {
      // Parse patient info from notes
      const nameMatch = appt.notes?.match(/Patient:\s*([^|]+)/);
      const emailMatch = appt.notes?.match(/Email:\s*([^|]+)/);
      const phoneMatch = appt.notes?.match(/Phone:\s*([^|]+)/);
      const patientName = nameMatch ? nameMatch[1].trim() : 'Patient';
      const patientEmail = emailMatch ? emailMatch[1].trim() : null;
      const patientPhone = phoneMatch ? phoneMatch[1].trim() : null;

      // Update to reminded
      await supabase.from('appointments').update({
        invoice_status: 'reminded',
        invoice_reminder_sent_at: now,
      }).eq('id', appt.id);

      // Send reminder email
      if (MAILGUN_API_KEY && patientEmail) {
        const formData = new FormData();
        formData.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
        formData.append('to', patientEmail);
        formData.append('subject', `REMINDER: Payment Due for Your ConveLabs Appointment`);
        formData.append('html', `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:#B91C1C;color:white;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
              <h2 style="margin:0;">Payment Reminder</h2>
            </div>
            <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
              <p>Hello ${patientName},</p>
              <p>Your payment of <strong>$${(appt.total_amount || 0).toFixed(2)}</strong> for your upcoming ConveLabs appointment is overdue.</p>
              <p style="color:#B91C1C;font-weight:600;">If payment is not received within 30 minutes, your appointment will be cancelled and given to the next patient on standby.</p>
              <div style="text-align:center;margin:20px 0;">
                <a href="https://convelabs.com/book-now" style="display:inline-block;background:#B91C1C;color:white;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;">Pay Now or Book Online</a>
              </div>
              <p style="font-size:12px;color:#9ca3af;text-align:center;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
            </div>
          </div>
        `);

        await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: formData,
        });
      }

      // Send SMS reminder
      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && patientPhone) {
        const smsBody = `ConveLabs: Your appointment payment of $${(appt.total_amount || 0).toFixed(2)} is overdue. Pay within 30 minutes or your appointment may be cancelled. Book online: convelabs.com/book-now`;
        const twilioFormData = new URLSearchParams();
        twilioFormData.append('To', patientPhone);
        twilioFormData.append('From', TWILIO_PHONE_NUMBER);
        twilioFormData.append('Body', smsBody);

        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: twilioFormData,
        });
      }

      remindersCount++;
    }

    // 2. Cancel appointments that were reminded 30+ minutes ago and still unpaid
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: cancelAppts } = await supabase
      .from('appointments')
      .select('*')
      .eq('invoice_status', 'reminded')
      .eq('is_vip', false)
      .lt('invoice_reminder_sent_at', thirtyMinAgo)
      .not('status', 'eq', 'cancelled');

    for (const appt of (cancelAppts || [])) {
      const nameMatch = appt.notes?.match(/Patient:\s*([^|]+)/);
      const emailMatch = appt.notes?.match(/Email:\s*([^|]+)/);
      const phoneMatch = appt.notes?.match(/Phone:\s*([^|]+)/);
      const patientName = nameMatch ? nameMatch[1].trim() : 'Patient';
      const patientEmail = emailMatch ? emailMatch[1].trim() : null;
      const patientPhone = phoneMatch ? phoneMatch[1].trim() : null;

      // Cancel appointment
      await supabase.from('appointments').update({
        status: 'cancelled',
        invoice_status: 'cancelled',
      }).eq('id', appt.id);

      // Void the Stripe invoice if it exists
      if (appt.stripe_invoice_id) {
        try {
          await stripe.invoices.voidInvoice(appt.stripe_invoice_id);
          console.log(`Voided Stripe invoice ${appt.stripe_invoice_id} for appointment ${appt.id}`);
        } catch (voidErr: any) {
          console.error(`Failed to void Stripe invoice ${appt.stripe_invoice_id}:`, voidErr.message);
        }
      }

      // Send cancellation email
      if (MAILGUN_API_KEY && patientEmail) {
        const formData = new FormData();
        formData.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
        formData.append('to', patientEmail);
        formData.append('subject', 'Your ConveLabs Appointment Has Been Cancelled');
        formData.append('html', `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:#991B1B;color:white;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
              <h2 style="margin:0;">Appointment Cancelled</h2>
            </div>
            <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
              <p>Hello ${patientName},</p>
              <p>Unfortunately, your ConveLabs appointment has been cancelled due to non-payment.</p>
              <p>Your appointment slot has been released and is now available for other patients.</p>
              <p>We'd love to continue serving you! You can easily book a new appointment online:</p>
              <div style="text-align:center;margin:20px 0;">
                <a href="https://convelabs.com/book-now" style="display:inline-block;background:#B91C1C;color:white;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;">Book a New Appointment</a>
              </div>
              <p style="font-size:12px;color:#9ca3af;text-align:center;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
            </div>
          </div>
        `);

        await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: formData,
        });
      }

      // Send cancellation SMS
      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && patientPhone) {
        const smsBody = `ConveLabs: Your appointment has been cancelled due to non-payment. Book a new appointment online: convelabs.com/book-now`;
        const twilioFormData = new URLSearchParams();
        twilioFormData.append('To', patientPhone);
        twilioFormData.append('From', TWILIO_PHONE_NUMBER);
        twilioFormData.append('Body', smsBody);

        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: twilioFormData,
        });
      }

      cancellationsCount++;
    }

    console.log(`Invoice processing: ${remindersCount} reminders sent, ${cancellationsCount} appointments cancelled`);

    return new Response(
      JSON.stringify({ success: true, reminders: remindersCount, cancellations: cancellationsCount }),
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
