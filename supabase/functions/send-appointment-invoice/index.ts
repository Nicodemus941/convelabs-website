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
    const {
      appointmentId, patientName, patientEmail, patientPhone,
      serviceType, serviceName, servicePrice,
      appointmentDate, appointmentTime, address, isVip,
      memo, orgName,
    } = await req.json();

    if (!appointmentId || !patientEmail) {
      return new Response(
        JSON.stringify({ error: 'appointmentId and patientEmail are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create or find Stripe customer
    let customerId: string;
    const existingCustomers = await stripe.customers.list({ email: patientEmail, limit: 1 });
    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: patientEmail,
        name: patientName,
        phone: patientPhone || undefined,
        metadata: { source: 'manual_appointment', appointment_id: appointmentId },
      });
      customerId = customer.id;
    }

    // Create Stripe Invoice
    const invoiceDescription = memo
      ? `ConveLabs - ${memo}`
      : orgName
      ? `ConveLabs - Patient: ${patientName} (Billed to ${orgName})`
      : `ConveLabs Appointment - ${patientName}`;

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 0,
      description: invoiceDescription,
      metadata: {
        appointment_id: appointmentId,
        service_type: serviceType,
        memo: memo || '',
        org_name: orgName || '',
      },
    });

    // Add line item
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: Math.round(servicePrice * 100), // Convert to cents
      currency: 'usd',
      description: `${serviceName || serviceType} - ${appointmentDate} at ${appointmentTime}`,
    });

    // Finalize and send the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(invoice.id);

    // Update appointment with Stripe invoice ID + hosted pay URL
    await supabase.from('appointments').update({
      stripe_invoice_id: invoice.id,
      stripe_invoice_url: finalizedInvoice.hosted_invoice_url || null,
      invoice_status: 'sent',
      invoice_sent_at: new Date().toISOString(),
    }).eq('id', appointmentId);

    // Also send a branded email via Mailgun
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

    if (MAILGUN_API_KEY && patientEmail) {
      const formattedDate = new Date(appointmentDate + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });

      const paymentUrl = finalizedInvoice.hosted_invoice_url || `https://convelabs.com/book-now`;
      const bookOnlineUrl = 'https://convelabs.com/book-now';

      const emailHtml = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:white;padding:32px;border-radius:16px 16px 0 0;text-align:center;">
      <h1 style="margin:0;font-size:24px;">Your Appointment is Scheduled!</h1>
      <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">ConveLabs Concierge Lab Services</p>
    </div>
    <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 16px 16px;">
      <p style="font-size:16px;color:#374151;">Hello ${patientName},</p>
      <p style="font-size:14px;color:#6b7280;line-height:1.6;">
        Your appointment has been scheduled by the ConveLabs team. Please review the details below and complete your payment to confirm your appointment.
      </p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:20px 0;">
        <h3 style="margin:0 0 12px;color:#B91C1C;font-size:16px;">Appointment Details</h3>
        <table style="width:100%;font-size:14px;color:#374151;">
          <tr><td style="padding:4px 0;color:#6b7280;">Service</td><td style="text-align:right;font-weight:600;">${serviceName || serviceType}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;">Date</td><td style="text-align:right;font-weight:600;">${formattedDate}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;">Time</td><td style="text-align:right;font-weight:600;">${appointmentTime}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;">Location</td><td style="text-align:right;">${address}</td></tr>
          <tr><td colspan="2" style="padding:8px 0 0;"><hr style="border:none;border-top:1px solid #fecaca;"></td></tr>
          <tr><td style="padding:8px 0;color:#B91C1C;font-weight:700;font-size:16px;">Amount Due</td><td style="text-align:right;font-weight:700;font-size:20px;color:#B91C1C;">$${servicePrice.toFixed(2)}</td></tr>
        </table>
      </div>

      <div style="text-align:center;margin:24px 0;">
        <a href="${paymentUrl}" style="display:inline-block;background:#B91C1C;color:white;padding:14px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">
          Pay Now - $${servicePrice.toFixed(2)}
        </a>
      </div>

      <div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:10px;padding:16px;margin:20px 0;">
        <p style="margin:0;font-size:13px;color:#92400e;font-weight:600;">Important: Payment Required Within 12 Hours</p>
        <p style="margin:6px 0 0;font-size:12px;color:#a16207;line-height:1.5;">
          Due to patient volume, payment must be received within 12 hours of this email.
          If payment is not received, your appointment may be cancelled and given to the next patient on standby.
        </p>
      </div>

      ${isVip ? '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px;margin:16px 0;text-align:center;"><p style="margin:0;font-size:13px;color:#166534;font-weight:600;">VIP Patient - Priority Scheduling</p></div>' : ''}

      <p style="font-size:13px;color:#6b7280;margin-top:20px;">
        Prefer to book online? <a href="${bookOnlineUrl}" style="color:#B91C1C;font-weight:600;">Book at convelabs.com</a>
      </p>

      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="font-size:11px;color:#9ca3af;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
        <p style="font-size:11px;color:#9ca3af;">Questions? Call (941) 527-9169</p>
      </div>
    </div>
  </div>
</body>
</html>`;

      const formData = new FormData();
      formData.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
      formData.append('to', patientEmail);
      formData.append('subject', `Your ConveLabs Appointment - Invoice for $${servicePrice.toFixed(2)}`);
      formData.append('html', emailHtml);

      await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: formData,
      });
    }

    console.log('Invoice sent:', invoice.id, 'for appointment:', appointmentId);

    return new Response(
      JSON.stringify({
        success: true,
        invoiceId: invoice.id,
        invoiceUrl: finalizedInvoice.hosted_invoice_url,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Invoice error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
