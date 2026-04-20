
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse the request body
    const { userId, email, fullName, planName } = await req.json();

    // ⚠️ DEPRECATED 2026-04-19: this function is not called from anywhere
    // in the codebase. Its entire narrative ("membership begins August 1st",
    // "next billing September 1st") is 2025-launch-era content that no
    // longer reflects reality — memberships activate the moment payment
    // clears. The post-visit `membership_upsell` sequence now handles
    // welcome messaging with the Founding 50 narrative.
    //
    // Returning 410 Gone so if someone accidentally wires this back in,
    // they'll see a loud error instead of a stale email going to a patient.
    return new Response(
      JSON.stringify({
        error: 'founding-member-welcome is deprecated (2025-launch-era). Use post_visit_sequences membership_upsell step instead.',
      }),
      { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // --- DEAD CODE BELOW (kept for git-history reference only) ---
    // eslint-disable-next-line no-unreachable
    if (!userId || !email) {
      return new Response(
        JSON.stringify({ error: 'User ID and email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the next billing date (September 1st)
    const nextBillingDate = new Date();
    nextBillingDate.setMonth(7); // August
    nextBillingDate.setDate(1); // 1st
    nextBillingDate.setHours(0, 0, 0, 0);
    // Set to September 1st for next billing
    nextBillingDate.setMonth(8); // September

    const formattedBillingDate = nextBillingDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Format the service start date (August 1st)
    const serviceStartDate = new Date();
    serviceStartDate.setMonth(7); // August
    serviceStartDate.setDate(1); // 1st
    serviceStartDate.setHours(0, 0, 0, 0);

    const formattedStartDate = serviceStartDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Create the email content
    const emailSubject = "Welcome, Founding Member — Your VIP Access Begins August 1st";
    
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="https://convelabs.com/logo.png" alt="ConveLabs Logo" style="max-height: 60px;"/>
        </div>
        
        <div style="background-color: #fcf8e3; border-left: 4px solid #f0ad4e; padding: 15px; margin-bottom: 20px;">
          <h2 style="margin-top: 0; color: #8a6d3b;">⭐ Founding Member Status Confirmed</h2>
          <p>Thank you for being one of our first members! Your early support means a lot to us.</p>
        </div>
        
        <h1 style="color: #b91c1c; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">Welcome to ConveLabs, ${fullName || 'Valued Member'}!</h1>
        
        <p>We're thrilled to welcome you as a <strong>Founding Member</strong> of ConveLabs. Your membership has been confirmed and is set to begin on <strong>${formattedStartDate}</strong>.</p>
        
        <h2 style="color: #333;">Your Membership Details:</h2>
        <ul style="list-style-type: none; padding-left: 0;">
          <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;"><strong>Plan:</strong> ${planName || 'ConveLabs Membership'}</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;"><strong>Status:</strong> <span style="background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 0.875rem;">Founding Member</span></li>
          <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;"><strong>Service Start Date:</strong> ${formattedStartDate}</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;"><strong>Next Billing Date:</strong> ${formattedBillingDate}</li>
        </ul>
        
        <div style="margin: 25px 0; padding: 15px; background-color: #f9fafb; border-radius: 8px;">
          <h3 style="margin-top: 0;">Your Founding Member Benefits:</h3>
          <ul>
            <li>Priority scheduling when service begins on August 1st</li>
            <li>First access to new service offerings</li>
            <li>Dedicated VIP support</li>
            <li>Exclusive Founding Member badge on your account</li>
          </ul>
        </div>
        
        <p>You can access your dashboard at any time to view your membership details, schedule appointments (starting August 1st), and manage your account.</p>
        
        <div style="margin: 25px 0; text-align: center;">
          <a href="https://convelabs.com/dashboard" style="background-color: #b91c1c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Access Your Dashboard</a>
        </div>
        
        <p>If you have any questions before our official launch on August 1st, please don't hesitate to contact our team at <a href="mailto:support@convelabs.com" style="color: #b91c1c;">support@convelabs.com</a>.</p>
        
        <p>Thank you again for your trust and for being one of our founding members!</p>
        
        <p>Warm regards,<br>The ConveLabs Team</p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f3f4f6; font-size: 0.875rem; color: #6b7280; text-align: center;">
          <p>ConveLabs, Inc. | 123 Health Avenue, Orlando, FL 32801</p>
          <p>&copy; 2025 ConveLabs. All rights reserved.</p>
        </div>
      </div>
    `;

    // Send the email
    const { error } = await supabaseClient
      .from('emails')
      .insert({
        email_to: email,
        subject: emailSubject,
        html_content: emailContent,
        priority: 'high'
      });

    if (error) {
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Welcome email sent successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error sending founding member welcome email: ${errorMessage}`);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
