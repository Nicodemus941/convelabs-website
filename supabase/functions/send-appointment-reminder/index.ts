
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { getRenderedTemplate, sendEmail, logEmailSend, userHasOptedIn } from "../_shared/email/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function can be called manually or triggered via a scheduled job
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
    
    // Get individual appointment or process batch
    let appointmentId: string | undefined;
    try {
      const body = await req.json();
      appointmentId = body.appointmentId;
    } catch (e) {
      // No JSON body or parse error, assume batch processing
    }
    
    // Process single appointment if ID provided
    if (appointmentId) {
      return await processSingleAppointment(appointmentId, supabaseClient);
    }
    
    // Otherwise, find all appointments happening in the next 24 hours
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    
    // Get appointments in the next 24 hours
    const { data: appointments, error } = await supabaseClient
      .from('appointments')
      .select(`
        id,
        appointment_date,
        patient_id
      `)
      .eq('status', 'scheduled')
      .gte('appointment_date', now.toISOString())
      .lte('appointment_date', tomorrow.toISOString());
    
    if (error) {
      throw new Error(`Error fetching appointments: ${error.message}`);
    }
    
    // Process each appointment
    const results = [];
    for (const appointment of appointments || []) {
      try {
        const result = await processSingleAppointment(appointment.id, supabaseClient);
        const resultData = await result.json();
        results.push({
          appointmentId: appointment.id,
          success: resultData.success,
          error: resultData.error
        });
      } catch (err) {
        results.push({
          appointmentId: appointment.id,
          success: false,
          error: err.message
        });
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        processedCount: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in appointment reminder function:', error);
    
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

// Helper function to process a single appointment reminder
async function processSingleAppointment(appointmentId: string, supabaseClient: any) {
  // Get appointment details
  const { data: appointment, error } = await supabaseClient
    .from('appointments')
    .select(`
      *,
      patient:patient_id (
        id,
        email
      ),
      phlebotomist:phlebotomist_id (
        user_metadata->firstName,
        user_metadata->lastName
      )
    `)
    .eq('id', appointmentId)
    .single();
  
  if (error || !appointment) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error?.message || 'Appointment not found' 
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 404,
      }
    );
  }
  
  // Get patient's email
  const patientEmail = appointment.patient?.email;
  if (!patientEmail) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Patient email not found' 
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
  
  // Check if user has opted in for appointment reminders
  const hasOptedIn = await userHasOptedIn(appointment.patient_id, 'appointment_reminders');
  if (!hasOptedIn) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "User has opted out of appointment reminder emails",
        skipped: true
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Format date and time from appointment date
  const appointmentDate = new Date(appointment.appointment_date);
  const formattedDate = appointmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  // Create data for the template
  const templateData = {
    appointmentDate: formattedDate,
    appointmentTime: formattedTime,
    appointmentLocation: appointment.address.includes('ConveLabs Office') ? 'ConveLabs Office' : 'Your Home',
    serviceType: 'Lab Draw', // You may want to fetch the actual service type
    phlebotomistAssigned: !!appointment.phlebotomist_id,
    phlebotomistName: appointment.phlebotomist ? 
      `${appointment.phlebotomist.firstName} ${appointment.phlebotomist.lastName}` : '',
    appointmentAddress: appointment.address,
    labOrderSubmitted: appointment.lab_order_file_path ? true : false,
    uploadLabOrderUrl: `${Deno.env.get('SITE_URL') || 'https://convelabs.com'}/dashboard/patient/upload-order?appointment=${appointmentId}`,
    rescheduleUrl: `${Deno.env.get('SITE_URL') || 'https://convelabs.com'}/dashboard/patient/reschedule?appointment=${appointmentId}`,
    cancelUrl: `${Deno.env.get('SITE_URL') || 'https://convelabs.com'}/dashboard/patient/cancel?appointment=${appointmentId}`
  };
  
  // Render the reminder email template
  const renderedTemplate = await getRenderedTemplate('appointment_reminder', templateData);
  
  // Send the reminder email
  const result = await sendEmail({
    to: patientEmail,
    subject: renderedTemplate.subject,
    html: renderedTemplate.html,
    text: renderedTemplate.text
  });
  
  // Log the email
  await logEmailSend({
    userId: appointment.patient_id,
    recipientEmail: patientEmail,
    subject: renderedTemplate.subject,
    bodyHtml: renderedTemplate.html,
    bodyText: renderedTemplate.text,
    status: result.success ? 'sent' : 'failed',
    error: result.error,
    metadata: {
      appointmentId,
      templateName: 'appointment_reminder'
    }
  });
  
  if (!result.success) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: result.error 
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      id: result.id 
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
