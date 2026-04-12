
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL") as string;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const supabase = createClient(url, key);

    // Get request data
    const { tenantId, userId } = await req.json();
    
    console.log("Fetching appointments with params:", { tenantId, userId });

    // Query appointments directly using the service role
    // This bypasses RLS policies, preventing recursion
    let query = supabase
      .from("appointments")
      .select(`
        id, 
        appointment_date, 
        address, 
        status, 
        patient_id,
        phlebotomist_id, 
        notes, 
        zipcode, 
        latitude, 
        longitude,
        weekend_service,
        extended_hours,
        service_id,
        service_type,
        tenant_id,
        created_at,
        updated_at,
        credit_used
      `)
      .order("appointment_date", { ascending: false });

    // Apply filters
    if (tenantId) {
      console.log("Filtering by tenant ID:", tenantId);
      query = query.eq("tenant_id", tenantId);
    } else if (userId) {
      console.log("Filtering by user ID:", userId);
      query = query.eq("patient_id", userId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Database query error:", error);
      throw error;
    }

    console.log(`Found ${data?.length || 0} appointments`);
    
    if (data && data.length > 0) {
      // Enhance appointments with patient data
      const patientIds = [...new Set(data.map(appointment => appointment.patient_id))];
      
      // Fetch patient information
      const { data: patientData, error: patientError } = await supabase
        .from("tenant_patients")
        .select("id, first_name, last_name, email, phone")
        .in("id", patientIds);
        
      if (patientError) {
        console.error("Error fetching patient data:", patientError);
      } else {
        console.log(`Found ${patientData?.length || 0} patient records`);
        
        // Create a lookup map for patient data
        const patientMap = new Map();
        patientData?.forEach(patient => {
          patientMap.set(patient.id, patient);
        });
        
        // Enhance appointment data with patient information
        data.forEach(appointment => {
          const patient = patientMap.get(appointment.patient_id);
          if (patient) {
            appointment.patient_name = `${patient.first_name} ${patient.last_name}`;
            appointment.patient_email = patient.email;
            appointment.patient_phone = patient.phone;
          } else {
            appointment.patient_name = "Unknown Patient";
          }
        });
      }
    }

    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
