
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.36.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    
    // Get request body
    const { appointmentId, notificationType, customMessage } = await req.json();
    
    if (!appointmentId) {
      throw new Error("Appointment ID is required");
    }
    
    console.log(`Processing ${notificationType} notification for appointment ${appointmentId}`);
    
    // Fetch appointment details
    const { data: appointment, error: appointmentError } = await supabaseClient
      .from('appointments')
      .select(`
        *,
        user_profiles:patient_id (full_name, email)
      `)
      .eq('id', appointmentId)
      .single();
      
    if (appointmentError) {
      throw appointmentError;
    }
    
    if (!appointment) {
      throw new Error(`Appointment with ID ${appointmentId} not found`);
    }
    
    const patientEmail = appointment.user_profiles?.email;
    const patientName = appointment.user_profiles?.full_name || 'Patient';
    
    if (!patientEmail) {
      throw new Error("Patient email not found");
    }
    
    console.log(`Sending ${notificationType} email to ${patientEmail}`);
    
    // Format appointment date
    const appointmentDate = new Date(appointment.appointment_date);
    const formattedDate = appointmentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    
    // Generate subject and content based on notification type
    let subject = '';
    let htmlContent = '';
    
    switch (notificationType) {
      case 'confirmation':
        subject = 'Your Appointment is Confirmed';
        htmlContent = `
          <h2>Appointment Confirmation</h2>
          <p>Hello ${patientName},</p>
          <p>Your appointment has been scheduled successfully.</p>
          <div style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedTime}</p>
            <p><strong>Address:</strong> ${appointment.address}</p>
            ${appointment.phlebotomist_id ? '<p><strong>Phlebotomist:</strong> A phlebotomist has been assigned to your appointment.</p>' : ''}
          </div>
          <p>If you need to reschedule or cancel, please contact us as soon as possible.</p>
          ${customMessage ? `<p>${customMessage}</p>` : ''}
          <p>Thank you for choosing our services!</p>
        `;
        break;
        
      case 'reminder':
        subject = 'Appointment Reminder';
        htmlContent = `
          <h2>Appointment Reminder</h2>
          <p>Hello ${patientName},</p>
          <p>This is a reminder about your upcoming appointment.</p>
          <div style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedTime}</p>
            <p><strong>Address:</strong> ${appointment.address}</p>
          </div>
          <p>If you need to reschedule or cancel, please contact us as soon as possible.</p>
          ${customMessage ? `<p>${customMessage}</p>` : ''}
          <p>Thank you for choosing our services!</p>
        `;
        break;
        
      case 'cancellation':
        subject = 'Your Appointment has been Cancelled';
        htmlContent = `
          <h2>Appointment Cancellation</h2>
          <p>Hello ${patientName},</p>
          <p>Your appointment scheduled for ${formattedDate} at ${formattedTime} has been cancelled.</p>
          ${customMessage ? `<p>${customMessage}</p>` : ''}
          <p>If you would like to reschedule, please visit our website or contact our office.</p>
          <p>Thank you for your understanding.</p>
        `;
        break;
        
      default:
        subject = 'Appointment Update';
        htmlContent = `
          <h2>Appointment Update</h2>
          <p>Hello ${patientName},</p>
          <p>There has been an update to your appointment scheduled for ${formattedDate} at ${formattedTime}.</p>
          ${customMessage ? `<p>${customMessage}</p>` : ''}
          <p>If you have any questions, please contact our office.</p>
        `;
    }
    
    // Send email via the send-email function
    const emailResponse = await supabaseClient.functions.invoke('send-email', {
      body: {
        to: patientEmail,
        subject,
        html: htmlContent
      }
    });
    
    console.log("Email function response:", emailResponse);
    
    // If the appointment has a phlebotomist assigned, also notify them
    if (appointment.phlebotomist_id) {
      console.log(`Notifying assigned phlebotomist: ${appointment.phlebotomist_id}`);
      
      // Get phlebotomist details
      const { data: phlebotomistData } = await supabaseClient
        .from('user_profiles')
        .select('email, full_name')
        .eq('id', appointment.phlebotomist_id)
        .single();
        
      if (phlebotomistData?.email) {
        // Send notification to phlebotomist
        const phlebotomistSubject = `New Appointment Assignment: ${formattedDate}`;
        const phlebotomistHtml = `
          <h2>New Appointment Assignment</h2>
          <p>Hello ${phlebotomistData.full_name || 'Phlebotomist'},</p>
          <p>You have been assigned to a new appointment:</p>
          <div style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedTime}</p>
            <p><strong>Address:</strong> ${appointment.address}</p>
            <p><strong>Zipcode:</strong> ${appointment.zipcode}</p>
            ${appointment.estimated_travel_time ? `<p><strong>Estimated travel time:</strong> ${appointment.estimated_travel_time} minutes</p>` : ''}
          </div>
          <p>Please check your schedule in the system for more details.</p>
        `;
        
        await supabaseClient.functions.invoke('send-email', {
          body: {
            to: phlebotomistData.email,
            subject: phlebotomistSubject,
            html: phlebotomistHtml
          }
        });
        
        console.log(`Notification sent to phlebotomist: ${phlebotomistData.email}`);
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${notificationType} notification sent successfully` 
      }),
      {
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        },
      }
    );
  } catch (error) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        },
      }
    );
  }
});
