import { supabase } from '@/integrations/supabase/client';
import { Appointment, BookingFormValues, BookingResult } from '@/types/appointmentTypes';
import { AppointmentResponse, SingleAppointmentResponse } from './appointmentTypes';
import { mapAppointmentData } from './appointmentMappers';

/**
 * Fetches all appointments with optional filters
 */
export async function fetchAppointments(
  tenantId?: string,
  userId?: string
): Promise<AppointmentResponse> {
  let query = supabase
    .from('appointments')
    .select('*');
  
  // Filter by tenant if in tenant context
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } 
  // Otherwise, filter by user if available
  else if (userId) {
    query = query.eq('patient_id', userId);
  }
  
  const response = await query;
  
  // Map the raw database response to our Appointment type
  return {
    data: response.data ? response.data.map(appointment => mapAppointmentData(appointment)) : null,
    error: response.error
  };
}

/**
 * Simplified fetch to avoid recursion issues
 */
export async function fetchAppointmentsSimplified(
  tenantId?: string,
  userId?: string
) {
  try {
    // For patients: match by patient_id OR patient_email (IDs can mismatch)
    if (userId) {
      // Get user's email for fallback matching
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const email = authUser?.email;

      let data: any[] = [];

      // Try by patient_id first
      const { data: byId } = await supabase.from('appointments').select('*')
        .eq('patient_id', userId).order('appointment_date', { ascending: false }).limit(50);
      if (byId) data = [...byId];

      // Also get by email (catches mismatched patient_ids)
      if (email) {
        const { data: byEmail } = await supabase.from('appointments').select('*')
          .ilike('patient_email', email).order('appointment_date', { ascending: false }).limit(50);
        if (byEmail) {
          const existingIds = new Set(data.map(a => a.id));
          data = [...data, ...byEmail.filter(a => !existingIds.has(a.id))];
        }
      }

      return { data, error: null };
    }

    // Admin: get all
    const { data, error } = await supabase.from('appointments').select('*')
      .order('appointment_date', { ascending: false }).limit(50);

    if (error) {
      console.error("Error in fetchAppointmentsSimplified:", error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error("Exception in fetchAppointmentsSimplified:", error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Unknown error occurred")
    };
  }
}

/**
 * Fetches a single appointment by ID
 */
export async function fetchAppointmentById(id: string): Promise<SingleAppointmentResponse> {
  const response = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();
  
  return {
    data: response.data ? mapAppointmentData(response.data) : null,
    error: response.error
  };
}

/**
 * Fetches patient information for an appointment
 */
export async function fetchPatientInfo(patientId: string) {
  return await supabase
    .from('tenant_patients')
    .select('first_name, last_name, email, phone')
    .eq('id', patientId)
    .single();
}

/**
 * Updates appointment status
 */
export async function updateAppointmentStatus(id: string, status: Appointment['status']) {
  return await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id);
}

/**
 * Find or create a patient record
 */
export async function findOrCreatePatient(
  email: string, 
  patientDetails: BookingFormValues['patientDetails'],
  currentTenantId?: string,
  userId?: string
) {
  // Check if patient exists
  const { data: existingPatient, error: patientLookupError } = await supabase
    .from('tenant_patients')
    .select('id')
    .eq('email', email)
    .eq(currentTenantId ? 'tenant_id' : 'tenant_id', currentTenantId || null)
    .maybeSingle();
    
  if (patientLookupError) throw patientLookupError;
  
  if (existingPatient) {
    console.log("Found existing patient:", existingPatient.id);
    return existingPatient.id;
  }
  
  // Create a new patient record
  console.log("Creating new patient record");
  const { data: newPatient, error: patientCreateError } = await supabase
    .from('tenant_patients')
    .insert({
      tenant_id: currentTenantId,
      user_id: userId,
      first_name: patientDetails.firstName,
      last_name: patientDetails.lastName,
      email: patientDetails.email,
      phone: patientDetails.phone,
      date_of_birth: patientDetails.dateOfBirth?.toISOString(),
      is_active: true
    })
    .select()
    .single();
    
  if (patientCreateError) throw patientCreateError;
  console.log("New patient created:", newPatient.id);
  return newPatient.id;
}

/**
 * Sends email notifications for appointments
 */
export async function sendAppointmentNotifications(appointmentId: string) {
  try {
    console.log("Sending appointment confirmation notifications");
    
    // Use our new edge function for sending confirmations
    const { data, error } = await supabase.functions.invoke(
      'send-appointment-confirmation',
      {
        body: { appointmentId }
      }
    );
    
    if (error) {
      console.error("Error sending notification:", error);
      return false;
    } 
    
    console.log("Notification sent successfully:", data);
    return true;
  } catch (err) {
    console.error("Exception sending notification:", err);
    return false;
  }
}

/**
 * Sends admin notification email about new appointments
 */
export async function sendAdminNotification(appointment: any, patientId: string, phlebotomistId: string | null) {
  try {
    await supabase.functions.invoke(
      'send-email',
      {
        body: {
          to: 'admin@convelabs.com',
          subject: 'New Appointment Booked',
          html: `
            <h2>New Appointment Booked</h2>
            <p><strong>Appointment ID:</strong> ${appointment.id}</p>
            <p><strong>Date/Time:</strong> ${new Date(appointment.appointment_date).toLocaleString()}</p>
            <p><strong>Location:</strong> ${appointment.address}</p>
            <p><strong>Zipcode:</strong> ${appointment.zipcode}</p>
            <p><strong>Phlebotomist Assigned:</strong> ${phlebotomistId ? 'Yes' : 'No'}</p>
            <p><strong>Patient ID:</strong> ${patientId}</p>
          `
        }
      }
    );
    console.log("Admin notification email sent");
    return true;
  } catch (err) {
    console.error("Error sending admin notification:", err);
    return false;
  }
}

/**
 * Creates a new appointment
 */
export async function createAppointment(
  formData: BookingFormValues,
  patientId: string, 
  coordinates: { latitude: number | null, longitude: number | null },
  phlebotomistId: string | null,
  appointmentDate: Date,
  tenantId?: string
) {
  // Auto-assign to Valerie Stoll-Lopez
  const valeriePhlebotomistId = "f5b8c871-cf74-43b0-96aa-5c6c5a5c5d6f"; // Valerie's ID
  
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .insert({
      patient_id: patientId,
      tenant_id: tenantId,
      appointment_date: appointmentDate.toISOString(),
      address: `${formData.locationDetails.address}, ${formData.locationDetails.city}, ${formData.locationDetails.state} ${formData.locationDetails.zipCode}`,
      zipcode: formData.locationDetails.zipCode,
      status: 'scheduled' as Appointment['status'],
      notes: formData.serviceDetails.additionalNotes,
      weekend_service: formData.serviceDetails.weekend || false,
      extended_hours: formData.serviceDetails.sameDay || false,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      phlebotomist_id: valeriePhlebotomistId, // Always assign to Valerie
      estimated_travel_time: null,
      service_id: formData.serviceDetails.selectedService,
      service_name: formData.serviceDetails.selectedService
    })
    .select()
    .single();

  if (appointmentError) throw appointmentError;
  
  console.log("Appointment created successfully:", appointment.id);
  
  return appointment;
}

/**
 * Get appointment by ID with simpler error handling
 */
export async function getAppointmentById(id: string): Promise<Appointment | null> {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    
    return mapAppointmentData(data);
  } catch (error) {
    console.error("Error fetching appointment:", error);
    return null;
  }
}
