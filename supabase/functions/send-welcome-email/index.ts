
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { getRenderedTemplate, sendEmail, logEmailSend } from "../_shared/email/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function can be called by the auth system or manually
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    let userId: string | undefined;
    let email: string | undefined;
    let firstName: string | undefined;
    let planName: string | undefined;
    let billingFrequency: string | undefined;
    
    // Try to get data from request body
    try {
      const body = await req.json();
      userId = body.userId;
      email = body.email;
      firstName = body.firstName;
      planName = body.planName;
      billingFrequency = body.billingFrequency;
    } catch (e) {
      // If no JSON body, check for query params
      const url = new URL(req.url);
      userId = url.searchParams.get('userId') || undefined;
      email = url.searchParams.get('email') || undefined;
      firstName = url.searchParams.get('firstName') || undefined;
      planName = url.searchParams.get('planName') || undefined;
      billingFrequency = url.searchParams.get('billingFrequency') || undefined;
    }
    
    // If we have a userId but no email/name, fetch user data
    if (userId && (!email || !firstName)) {
      const { data: userData, error } = await supabaseClient.auth.admin.getUserById(userId);
      
      if (error) {
        throw error;
      }
      
      if (userData?.user) {
        email = userData.user.email;
        firstName = userData.user.user_metadata?.firstName || 'there';
        
        // Check if user has plan data in metadata
        if (userData.user.user_metadata?.planId) {
          // Try to get plan details from the database
          const { data: planData } = await supabaseClient
            .from('membership_plans')
            .select('name')
            .eq('id', userData.user.user_metadata.planId)
            .single();
            
          if (planData) {
            planName = planData.name;
          }
          
          // Get billing frequency
          billingFrequency = userData.user.user_metadata.billingFrequency;
        }
      }
    }
    
    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Generate the confirmation URL (for email verification)
    let confirmationUrl = `${Deno.env.get('SITE_URL') || 'https://convelabs.com'}/verify`;
    
    // If we have a userId, generate a proper verification link
    if (userId) {
      try {
        const { data, error } = await supabaseClient.auth.admin.generateLink({
          type: 'signup',
          email: email,
          options: {
            redirectTo: `${Deno.env.get('SITE_URL') || 'https://convelabs.com'}/dashboard`
          }
        });
        
        if (!error && data.properties.action_link) {
          confirmationUrl = data.properties.action_link;
        }
      } catch (e) {
        console.error('Error generating verification link:', e);
        // Fall back to generic link
      }
    }
    
    // Prepare membership details for the welcome email
    const membershipDetails = planName 
      ? `You've successfully enrolled in our ${planName} plan with ${billingFrequency || 'monthly'} billing.` 
      : 'Welcome to ConveLabs!';
    
    const schedulingInfo = `
      <h3 style="margin-top: 20px;">How to Schedule Your First Appointment:</h3>
      <ol style="padding-left: 20px; line-height: 1.6;">
        <li>Log in to your account at <a href="https://convelabs.com/dashboard">convelabs.com/dashboard</a></li>
        <li>Click on the "Schedule an Appointment" button</li>
        <li>Select your preferred location (at-home or in one of our offices)</li>
        <li>Choose a date and time that works for you</li>
        <li>Confirm your appointment details and submit</li>
      </ol>
      <p style="margin-top: 15px;">Our team will contact you to confirm your appointment and answer any questions you may have.</p>
    `;
    
    const membershipInfo = planName ? `
      <h3 style="margin-top: 20px;">About Your Membership:</h3>
      <ul style="padding-left: 20px; line-height: 1.6;">
        <li><strong>Plan:</strong> ${planName}</li>
        <li><strong>Billing:</strong> ${billingFrequency || 'Monthly'}</li>
        <li><strong>Next Steps:</strong> Complete your profile and schedule your first appointment</li>
      </ul>
    ` : '';
    
    // Render the welcome email template with enhanced content
    const renderedTemplate = await getRenderedTemplate('welcome_email', {
      firstName: firstName || 'there',
      confirmationUrl: confirmationUrl,
      membershipDetails: membershipDetails,
      schedulingInfo: schedulingInfo,
      membershipInfo: membershipInfo
    });
    
    // Send the welcome email
    const result = await sendEmail({
      to: email,
      subject: renderedTemplate.subject,
      html: renderedTemplate.html,
      text: renderedTemplate.text
    });
    
    // Log the email
    await logEmailSend({
      userId,
      recipientEmail: email,
      subject: renderedTemplate.subject,
      bodyHtml: renderedTemplate.html,
      bodyText: renderedTemplate.text,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
      metadata: {
        templateName: 'welcome_email',
        event: 'account_creation',
        planName,
        billingFrequency
      }
    });
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in welcome email function:', error);
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
