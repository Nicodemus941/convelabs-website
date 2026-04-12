
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function is designed to be called by a scheduled job (e.g., every hour)
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    // Process different types of scheduled emails
    const now = new Date();
    const results = {
      appointmentReminders: await processAppointmentReminders(supabaseAdmin, now),
      birthdayWishes: await processBirthdayEmails(supabaseAdmin, now),
      usageReports: await processMonthlyReports(supabaseAdmin, now)
    };
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in process-scheduled-emails function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// Process appointment reminders for appointments in the next 24 hours
async function processAppointmentReminders(supabaseClient: any, now: Date) {
  try {
    // Call the appointment reminder function
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-appointment-reminder`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        }
      }
    );
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error processing appointment reminders:', error);
    return { success: false, error: error.message };
  }
}

// Send birthday wishes to users whose birthday is today
async function processBirthdayEmails(supabaseClient: any, now: Date) {
  try {
    // Extract month and day from current date
    const month = now.getMonth() + 1; // getMonth() returns 0-11
    const day = now.getDate();
    
    // Query users who have birthdays today
    // Note: This is a placeholder - you would need to store birthdays in user profiles
    const { data: usersWithBirthday, error } = await supabaseClient
      .from('user_profiles')
      .select('id, full_name')
      .eq('EXTRACT(MONTH FROM date_of_birth)', month)
      .eq('EXTRACT(DAY FROM date_of_birth)', day);
    
    if (error) {
      throw error;
    }
    
    // Process birthday emails (to be implemented)
    return { 
      success: true, 
      processedCount: usersWithBirthday?.length || 0,
      message: 'Birthday email feature to be implemented'
    };
  } catch (error) {
    console.error('Error processing birthday emails:', error);
    return { success: false, error: error.message };
  }
}

// Send monthly usage reports on the 1st of each month
async function processMonthlyReports(supabaseClient: any, now: Date) {
  try {
    // Only run on the 1st of the month
    if (now.getDate() !== 1) {
      return { 
        success: true, 
        processedCount: 0,
        message: 'Not the 1st of the month, skipping monthly reports'
      };
    }
    
    // Query all active memberships
    const { data: activeMembers, error } = await supabaseClient
      .from('user_memberships')
      .select('user_id')
      .eq('status', 'active');
    
    if (error) {
      throw error;
    }
    
    // Process monthly reports (to be implemented)
    return { 
      success: true, 
      processedCount: activeMembers?.length || 0,
      message: 'Monthly report feature to be implemented'
    };
  } catch (error) {
    console.error('Error processing monthly reports:', error);
    return { success: false, error: error.message };
  }
}
