import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0';
import { sendEmail } from '../_shared/email/providers.ts';
import { logEmailSend } from '../_shared/email/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CorporateSignupData {
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
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

    const signupData: CorporateSignupData = await req.json();
    console.log('Processing corporate signup:', { company: signupData.company_name, email: signupData.contact_email });

    // Validate required fields
    if (!signupData.company_name || !signupData.contact_name || !signupData.contact_email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: company_name, contact_name, contact_email' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Create corporate account
    const { data: corporateAccount, error: insertError } = await supabase
      .from('corporate_accounts')
      .insert({
        company_name: signupData.company_name,
        contact_name: signupData.contact_name,
        contact_email: signupData.contact_email,
        contact_phone: signupData.contact_phone || null,
        status: 'active'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating corporate account:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create corporate account' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    console.log('Corporate account created:', corporateAccount.id);

    // Generate CSV template
    const csvTemplate = `email,first_name,last_name,phone,executive_upgrade
john.doe@${signupData.company_name.toLowerCase().replace(/\s+/g, '')}.com,John,Doe,(555) 123-4567,false
jane.smith@${signupData.company_name.toLowerCase().replace(/\s+/g, '')}.com,Jane,Smith,(555) 987-6543,true`;

    // Send welcome email to corporate contact
    try {
      const welcomeEmailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Welcome to ConveLabs Corporate Wellness!</h1>
          
          <p>Hi ${signupData.contact_name},</p>
          
          <p>Congratulations! Your corporate wellness account has been successfully created for <strong>${signupData.company_name}</strong>.</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Your Corporate Account Details</h3>
            <p><strong>Corporate ID:</strong> ${corporateAccount.corporate_id}</p>
            <p><strong>Company:</strong> ${signupData.company_name}</p>
            <p><strong>Account Status:</strong> Active</p>
          </div>
          
          <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
            <h4 style="color: #dc2626; margin-top: 0;">Next Steps</h4>
            <ol style="padding-left: 20px;">
              <li><strong>Download the CSV template</strong> (attached) to add your employees</li>
              <li><strong>Upload employee data</strong> through your corporate dashboard</li>
              <li><strong>Employee invitations</strong> will be sent automatically</li>
              <li><strong>Track engagement</strong> through your admin portal</li>
            </ol>
          </div>
          
          <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #0369a1; margin-top: 0;">💡 Pro Tips</h4>
            <ul style="padding-left: 20px;">
              <li>Announce the wellness program company-wide for maximum participation</li>
              <li>Consider executive upgrades for leadership team members</li>
              <li>Schedule quarterly wellness reports to track ROI</li>
            </ul>
          </div>
          
          <p>Questions? Reply to this email or contact our corporate support team at <strong>corporate@convelabs.com</strong>.</p>
          
          <p>Welcome to better workplace health!</p>
          
          <p>Best regards,<br>
          The ConveLabs Corporate Team</p>
          
          <hr style="margin: 30px 0; border: none; height: 1px; background: #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">
            ConveLabs Corporate Wellness | Your Partner in Workplace Health
          </p>
        </div>
      `;

      await sendEmail({
        to: [signupData.contact_email],
        subject: `Welcome to ConveLabs - ${signupData.company_name} Account Created`,
        html: welcomeEmailContent
      });

      console.log('Welcome email sent to corporate contact');

      // Log the welcome email
      await logEmailSend({
        templateId: 'corporate-welcome',
        recipientEmail: signupData.contact_email,
        subject: `Welcome to ConveLabs - ${signupData.company_name} Account Created`,
        bodyHtml: welcomeEmailContent,
        status: 'sent',
        metadata: {
          corporate_account_id: corporateAccount.id,
          company_name: signupData.company_name
        }
      });

    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
      // Don't fail the request if email fails
    }

    // Send notification to admin team
    try {
      const adminNotificationContent = `
        <h2>🏢 New Corporate Account Created</h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Account Details</h3>
          <p><strong>Company:</strong> ${signupData.company_name}</p>
          <p><strong>Contact:</strong> ${signupData.contact_name}</p>
          <p><strong>Email:</strong> ${signupData.contact_email}</p>
          <p><strong>Phone:</strong> ${signupData.contact_phone || 'Not provided'}</p>
          <p><strong>Corporate ID:</strong> ${corporateAccount.corporate_id}</p>
          <p><strong>Account ID:</strong> ${corporateAccount.id}</p>
        </div>
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4>Follow-up Actions</h4>
          <ul>
            <li>Monitor employee enrollment progress</li>
            <li>Schedule onboarding call if needed</li>
            <li>Ensure billing setup is complete</li>
          </ul>
        </div>
      `;

      await sendEmail({
        to: ['admin@convelabs.com', 'corporate@convelabs.com'],
        subject: `New Corporate Account: ${signupData.company_name}`,
        html: adminNotificationContent
      });

      console.log('Admin notification email sent');

    } catch (adminEmailError) {
      console.error('Error sending admin notification:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Corporate account created successfully',
        corporate_id: corporateAccount.corporate_id,
        account_id: corporateAccount.id,
        csv_template: csvTemplate
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error) {
    console.error('Error in corporate-signup function:', error);
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