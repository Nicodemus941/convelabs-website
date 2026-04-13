
import { Appointment } from "@/types/appointmentTypes";

/**
 * Maps raw appointment data from the database to our frontend Appointment type
 */
export const mapAppointmentData = (appointment: any, patientData?: any): Appointment => {
  if (!appointment) return {} as Appointment;
  
  console.log("Mapping appointment data:", appointment);
  
  const result = {
    id: appointment.id,
    // Support both appointment_date (database field) and date (frontend field)
    date: appointment.appointment_date || appointment.date,
    appointment_date: appointment.appointment_date || appointment.date,
    status: appointment.status || 'scheduled',
    location: appointment.address,
    address: appointment.address,
    notes: appointment.notes,
    patient_id: appointment.patient_id,
    patient_name: appointment.patient_name || (patientData ? `${patientData.first_name} ${patientData.last_name}` : parseFromNotes(appointment.notes, 'Patient') || 'Unknown'),
    patient_email: appointment.patient_email || patientData?.email || parseFromNotes(appointment.notes, 'Email'),
    patient_phone: appointment.patient_phone || patientData?.phone || parseFromNotes(appointment.notes, 'Phone'),
    phlebotomist_id: appointment.phlebotomist_id,
    appointment_time: appointment.appointment_time || '',
    service_type: appointment.service_type || '',
    serviceName: appointment.service_name || appointment.service_type || '',
    service_id: appointment.service_id,
    service_name: appointment.service_name || appointment.service_type || '',
    total_amount: appointment.total_amount || 0,
    tip_amount: appointment.tip_amount || 0,
    payment_status: appointment.payment_status || '',
    invoice_status: appointment.invoice_status || '',
    booking_source: appointment.booking_source || '',
    zipcode: appointment.zipcode,
    latitude: appointment.latitude,
    longitude: appointment.longitude,
    doctor_id: appointment.doctor_id,
    tenant_id: appointment.tenant_id,
    extended_hours: appointment.extended_hours || false,
    weekend_service: appointment.weekend_service || false,
    credit_used: appointment.credit_used || false,
    time: getTimeFromAppointmentDate(appointment.appointment_date || appointment.date)
  };
  
  console.log("Mapped appointment:", result);
  return result;
};

/**
 * Extract time string from appointment date
 */
function getTimeFromAppointmentDate(dateString?: string | Date): string {
  if (!dateString) return '';
  
  try {
    const date = ensureDate(dateString);
    if (!date) return '';
    
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    console.error("Error extracting time from date:", error);
    return '';
  }
}

// Parse a field from the notes string (e.g., "Patient: John Smith | Email: john@email.com")
function parseFromNotes(notes: string | null | undefined, field: string): string | null {
  if (!notes) return null;
  const regex = new RegExp(`${field}:\\s*([^|]+)`);
  const match = notes.match(regex);
  return match ? match[1].trim() : null;
}

// Helper function to ensure we have a Date object
export const ensureDate = (dateInput: string | Date | undefined): Date | undefined => {
  if (!dateInput) return undefined;
  
  try {
    return typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  } catch (error) {
    console.error("Invalid date:", dateInput, error);
    return undefined;
  }
};
