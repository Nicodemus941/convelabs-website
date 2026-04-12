
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { sendSMS } from "../_shared/twilio.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    console.log("Appointment reminder function triggered");
    
    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    // Get the current date
    const now = new Date();
    
    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    // Get end of tomorrow
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);
    
    console.log(`Looking for appointments between ${tomorrow.toISOString()} and ${tomorrowEnd.toISOString()}`);
    
    // Get appointments for tomorrow
    const { data: appointments, error } = await supabaseAdmin
      .from('appointments')
      .select(`
        id, 
        appointment_date, 
        address, 
        notes, 
        status,
        patient_id,
        tenant_patients!inner(id, first_name, last_name, email, phone)
      `)
      .eq('status', 'scheduled')
      .gte('appointment_date', tomorrow.toISOString())
      .lt('appointment_date', tomorrowEnd.toISOString());
    
    if (error) {
      console.error("Error fetching appointments:", error);
      throw error;
    }
    
    console.log(`Found ${appointments?.length || 0} appointments to send reminders for`);
    
    const results = [];
    
    // Send reminders for each appointment
    for (const appointment of appointments || []) {
      try {
        // Extract patient details - handle both property paths
        const patientPhone = appointment.tenant_patients?.phone;
        const patientName = `${appointment.tenant_patients?.first_name || ''} ${appointment.tenant_patients?.last_name || ''}`.trim();
        
        console.log(`Processing appointment for ${patientName}, phone: ${patientPhone || 'none'}`);
        
        if (!patientPhone) {
          results.push({ id: appointment.id, status: 'skipped', reason: 'No phone number' });
          continue;
        }
        
        // Format appointment time
        const appointmentDate = new Date(appointment.appointment_date);
        const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        // Create reminder message
        const message = `Hi ${patientName || 'there'}! This is a reminder for your ConveLabs appointment tomorrow at ${formattedTime}. A phlebotomist will visit you at the address provided. Reply HELP for assistance or CANCEL to cancel.`;
        
        // Send the SMS - ensure phone has proper format
        const formattedPhone = patientPhone.startsWith('+') ? patientPhone : `+1${patientPhone.replace(/\D/g, '')}`;
        console.log(`Sending SMS to: ${formattedPhone}`);
        
        await sendSMS(formattedPhone, message);
        
        // Also send an email reminder if available
        if (appointment.tenant_patients?.email) {
          await supabaseAdmin.functions.invoke('send-email', {
            body: {
              to: appointment.tenant_patients.email,
              subject: 'Your ConveLabs Appointment Tomorrow',
              html: `
                <h2>Appointment Reminder</h2>
                <p>Hello ${patientName},</p>
                <p>This is a reminder that you have a ConveLabs appointment scheduled for tomorrow at ${formattedTime}.</p>
                <p><strong>Location:</strong> ${appointment.address}</p>
                ${appointment.notes ? `<p><strong>Notes:</strong> ${appointment.notes}</p>` : ''}
                <p>Our phlebotomist, Valerie, will arrive at your location at the scheduled time.</p>
                <p>If you need to reschedule or have any questions, please contact us immediately.</p>
                <p>Thank you for choosing ConveLabs for your healthcare needs.</p>
              `
            }
          });
        }
        
        results.push({ id: appointment.id, status: 'sent' });
      } catch (err) {
        console.error(`Error sending reminder for appointment ${appointment.id}:`, err);
        results.push({ id: appointment.id, status: 'error', error: err.message });
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
    
  } catch (error) {
    console.error('Send reminders error:', error);
    
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
