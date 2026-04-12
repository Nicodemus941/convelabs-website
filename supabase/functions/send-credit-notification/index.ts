
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, notificationType, threshold, daysToExpiry } = await req.json();

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Get user details
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // Get user membership
    const { data: membership, error: membershipError } = await supabase
      .from('user_memberships')
      .select('*, plan:plan_id(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') throw membershipError;

    // Prepare subject and content based on notification type
    let subject, content;

    if (notificationType === 'usage_threshold') {
      const remainingCredits = membership?.credits_remaining || 0;
      const rolloverCredits = membership?.rollover_credits || 0;
      const totalCredits = remainingCredits + rolloverCredits;
      
      subject = `Your lab credits are ${threshold}% used`;
      content = `
        <p>Hello ${user.first_name},</p>
        <p>You have ${totalCredits} lab credits remaining. You've used ${threshold}% of your regular credits.</p>
        <p>Regular credits: ${remainingCredits}</p>
        <p>Rollover credits: ${rolloverCredits}</p>
        <p>Consider upgrading your membership or purchasing additional credits to ensure uninterrupted service.</p>
      `;
    } else if (notificationType === 'rollover_expiration') {
      const rolloverCredits = membership?.rollover_credits || 0;
      
      subject = `Your rollover credits expire in ${daysToExpiry} days`;
      content = `
        <p>Hello ${user.first_name},</p>
        <p>You have ${rolloverCredits} rollover credits that will expire in ${daysToExpiry} days.</p>
        <p>To make the most of your credits, book your lab service soon.</p>
      `;
    } else {
      throw new Error('Invalid notification type');
    }

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'notifications@yourlabservice.com',
        to: user.email,
        subject,
        html: content
      })
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      throw new Error(`Failed to send email: ${JSON.stringify(errorData)}`);
    }

    // Log notification
    const { data: logData, error: logError } = await supabase
      .from('credit_notifications')
      .insert({
        user_id: userId,
        notification_type: notificationType,
        threshold_percentage: threshold || null,
        days_to_expiration: daysToExpiry || null,
        email_sent: true
      });

    if (logError) throw logError;

    return new Response(
      JSON.stringify({ success: true, message: 'Credit notification sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
