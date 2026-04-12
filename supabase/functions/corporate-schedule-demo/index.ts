import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0';
import { getEmailTemplate } from '../_shared/email/index.ts';
import { sendEmail } from '../_shared/email/providers.ts';
import { logEmailSend } from '../_shared/email/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DemoRequestData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  industry: 'healthcare' | 'talent' | 'sports' | 'corporate';
  preferredTime: string;
  message?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestData: DemoRequestData = await req.json();
    console.log('Processing demo request:', { company: requestData.company, email: requestData.email });

    // Validate required fields
    const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'company', 'industry', 'preferredTime'];
    for (const field of requiredFields) {
      if (!requestData[field]) {
        return new Response(
          JSON.stringify({ error: `Missing required field: ${field}` }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    // Insert demo request into database
    const { data: demoRequest, error: insertError } = await supabase
      .from('corporate_demo_requests')
      .insert({
        first_name: requestData.firstName,
        last_name: requestData.lastName,
        email: requestData.email,
        phone: requestData.phone,
        company: requestData.company,
        industry: requestData.industry,
        preferred_time: requestData.preferredTime,
        message: requestData.message || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting demo request:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save demo request' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    console.log('Demo request saved:', demoRequest.id);

    // Send notification email to sales team
    try {
      const salesEmailContent = `
        <h2>🎯 New Corporate Demo Request</h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Contact Information</h3>
          <p><strong>Name:</strong> ${requestData.firstName} ${requestData.lastName}</p>
          <p><strong>Email:</strong> ${requestData.email}</p>
          <p><strong>Phone:</strong> ${requestData.phone}</p>
          <p><strong>Company:</strong> ${requestData.company}</p>
          <p><strong>Industry:</strong> ${requestData.industry}</p>
          <p><strong>Preferred Time:</strong> ${requestData.preferredTime}</p>
          ${requestData.message ? `<p><strong>Message:</strong> ${requestData.message}</p>` : ''}
        </div>
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4>⚡ Action Required</h4>
          <p>Contact this prospect within 24 hours for optimal conversion.</p>
          <p><strong>Demo Request ID:</strong> ${demoRequest.id}</p>
        </div>
      `;

      await sendEmail({
        to: ['info@convelabs.com'],
        subject: `🎯 New Corporate Demo Request - ${requestData.company}`,
        html: salesEmailContent,
        replyTo: requestData.email
      });

      console.log('Sales notification email sent');

      // Log the email send
      await logEmailSend({
        templateId: 'corporate-demo-notification',
        recipientEmail: 'info@convelabs.com',
        subject: `New Corporate Demo Request - ${requestData.company}`,
        bodyHtml: salesEmailContent,
        status: 'sent',
        metadata: {
          demo_request_id: demoRequest.id,
          company: requestData.company,
          industry: requestData.industry
        }
      });

    } catch (emailError) {
      console.error('Error sending notification email:', emailError);
      // Don't fail the request if email fails
    }

    // Send confirmation email to prospect
    try {
      const confirmationEmailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Thank You for Your Interest in ConveLabs</h1>
          
          <p>Hi ${requestData.firstName},</p>
          
          <p>Thank you for requesting a corporate demo. We're excited to show you how ConveLabs can transform your workplace wellness program.</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>What Happens Next?</h3>
            <ul style="padding-left: 20px;">
              <li>Our corporate solutions specialist will contact you within 24 hours</li>
              <li>We'll schedule a 30-minute personalized demo</li>
              <li>You'll receive a custom ROI analysis for your organization</li>
              <li>We'll discuss implementation timeline and next steps</li>
            </ul>
          </div>
          
          <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
            <h4 style="color: #dc2626; margin-top: 0;">Your Demo Request Details</h4>
            <p><strong>Company:</strong> ${requestData.company}</p>
            <p><strong>Industry:</strong> ${requestData.industry}</p>
            <p><strong>Preferred Time:</strong> ${requestData.preferredTime}</p>
          </div>
          
          <p>Questions before our call? Reply to this email or call us at <strong>(941) 527-9169</strong>.</p>
          
          <p>Best regards,<br>
          The ConveLabs Corporate Solutions Team</p>
          
          <hr style="margin: 30px 0; border: none; height: 1px; background: #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">
            ConveLabs Corporate Wellness | Transforming Workplace Health
          </p>
        </div>
      `;

      await sendEmail({
        to: [requestData.email],
        subject: 'Your ConveLabs Corporate Demo Request - Next Steps',
        html: confirmationEmailContent
      });

      console.log('Confirmation email sent to prospect');

      // Log the confirmation email
      await logEmailSend({
        templateId: 'corporate-demo-confirmation',
        recipientEmail: requestData.email,
        subject: 'Your ConveLabs Corporate Demo Request - Next Steps',
        bodyHtml: confirmationEmailContent,
        status: 'sent',
        metadata: {
          demo_request_id: demoRequest.id,
          company: requestData.company
        }
      });

    } catch (confirmationEmailError) {
      console.error('Error sending confirmation email:', confirmationEmailError);
      // Don't fail the request if confirmation email fails
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Demo request submitted successfully',
        requestId: demoRequest.id
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error) {
    console.error('Error in corporate-schedule-demo function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);