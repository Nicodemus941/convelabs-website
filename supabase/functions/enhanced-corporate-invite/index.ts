import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0';
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { getEmailTemplate } from '../_shared/email/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

interface EnhancedEmployeeInviteRequest {
  corporate_account_id: string;
  employees: {
    first_name: string;
    last_name: string;
    email: string;
    executive_upgrade: boolean;
  }[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestData: EnhancedEmployeeInviteRequest = await req.json();
    
    console.log('Enhanced employee invite request:', requestData);

    // Get corporate account details
    const { data: corporateAccount, error: accountError } = await supabase
      .from('corporate_accounts')
      .select('*')
      .eq('id', requestData.corporate_account_id)
      .single();

    if (accountError || !corporateAccount) {
      throw new Error('Corporate account not found');
    }

    // Get the employee welcome email template
    const employeeTemplate = await getEmailTemplate('corporate-employee-welcome');
    
    if (!employeeTemplate) {
      console.error('Corporate employee welcome email template not found');
      throw new Error('Employee email template not found');
    }

    const results = [];
    const errors = [];

    // Process each employee
    for (const employee of requestData.employees) {
      try {
        // Generate member ID
        const { data: memberIdData, error: memberIdError } = await supabase
          .rpc('generate_corporate_member_id', { 
            corporate_id: corporateAccount.corporate_id 
          });

        if (memberIdError) {
          throw new Error(`Failed to generate member ID: ${memberIdError.message}`);
        }

        const memberId = memberIdData;

        // Generate invitation token
        const { data: tokenData, error: tokenError } = await supabase
          .rpc('generate_staff_invitation_token');

        if (tokenError) {
          throw new Error(`Failed to generate invitation token: ${tokenError.message}`);
        }

        const invitationToken = tokenData;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        // Insert employee record
        const { data: employeeData, error: insertError } = await supabase
          .from('corporate_employees')
          .insert({
            corporate_account_id: corporateAccount.id,
            email: employee.email,
            member_id: memberId,
            executive_upgrade: employee.executive_upgrade,
            status: 'invited',
            invitation_token: invitationToken,
            invitation_expires_at: expiresAt.toISOString()
          })
          .select()
          .single();

        if (insertError) {
          throw new Error(`Failed to create employee record: ${insertError.message}`);
        }

        // Prepare onboarding URL
        const onboardingUrl = `${Deno.env.get('SUPABASE_URL')?.replace('supabase.co', 'vercel.app') || 'https://yourapp.vercel.app'}/onboarding?token=${invitationToken}&type=corporate`;

        // Replace template variables
        let emailSubject = employeeTemplate.subject_template;
        
        let emailBody = employeeTemplate.html_template
          .replace(/\{\{first_name\}\}/g, employee.first_name)
          .replace(/\{\{last_name\}\}/g, employee.last_name)
          .replace(/\{\{company_name\}\}/g, corporateAccount.company_name)
          .replace(/\{\{member_id\}\}/g, memberId)
          .replace(/\{\{onboarding_url\}\}/g, onboardingUrl);

        // Handle executive upgrade conditional content
        if (employee.executive_upgrade) {
          emailBody = emailBody.replace(/\{\{#if executive_upgrade\}\}/g, '')
                              .replace(/\{\{\/if\}\}/g, '');
        } else {
          // Remove the executive upgrade section
          emailBody = emailBody.replace(/\{\{#if executive_upgrade\}\}.*?\{\{\/if\}\}/gs, '');
        }

        // Send welcome email
        console.log('Sending employee welcome email to:', employee.email);
        
        const emailResult = await resend.emails.send({
          from: 'ConveLabs <onboarding@resend.dev>',
          to: [employee.email],
          subject: emailSubject,
          html: emailBody,
        });

        if (emailResult.error) {
          console.error('Error sending employee welcome email:', emailResult.error);
          errors.push({
            employee: employee.email,
            error: 'Failed to send welcome email',
            details: emailResult.error
          });
        } else {
          console.log('Employee welcome email sent successfully:', emailResult.data);
        }

        results.push({
          employee: employee.email,
          member_id: memberId,
          invitation_token: invitationToken,
          onboarding_url: onboardingUrl,
          status: 'invited'
        });

      } catch (error) {
        console.error(`Error processing employee ${employee.email}:`, error);
        errors.push({
          employee: employee.email,
          error: error.message
        });
      }
    }

    // Update employee count in corporate account
    await supabase
      .from('corporate_accounts')
      .update({ 
        employee_count: results.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', corporateAccount.id);

    return new Response(
      JSON.stringify({
        success: true,
        corporate_account: corporateAccount,
        invited_employees: results,
        errors: errors,
        summary: {
          total_requested: requestData.employees.length,
          successfully_invited: results.length,
          failed: errors.length
        }
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );

  } catch (error) {
    console.error('Error in enhanced corporate invite:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
});