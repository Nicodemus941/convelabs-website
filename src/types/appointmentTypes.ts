
import { z } from 'zod';

export interface Appointment {
  id: string;
  // Support both field names for backwards compatibility
  date?: string | Date;
  appointment_date?: string | Date;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show' | 'en_route';
  location?: string;
  address?: string;
  notes?: string;
  patient_id: string;
  patient_name?: string;
  patient_email?: string;
  patient_phone?: string;
  phlebotomist_id?: string;
  serviceName?: string;
  service_id?: string;
  service_name?: string;
  service_type?: string;
  zipcode?: string;
  latitude?: number;
  longitude?: number;
  appointment_time?: string;
  total_amount?: number;
  // Other fields
  doctor_id?: string;
  tenant_id?: string;
  extended_hours?: boolean;
  weekend_service?: boolean;
  credit_used?: boolean;
  time?: string; // Added missing time field
}

export interface BookingFormValues {
  date: Date;
  time: string;
  serviceDetails: {
    selectedService: string;
    additionalNotes: string;
    sameDay: boolean;
    weekend: boolean;
    fasting?: boolean;
    duration?: number;
  };
  locationDetails: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    isHomeAddress: boolean;
    instructions: string;
    locationType?: string;
  };
  patientDetails: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth?: Date;
  };
  labOrder?: {
    skipped?: boolean;
    doctorFaxNumber?: string;
    hasFile?: boolean;
  };
  termsAccepted?: boolean;
}

export interface BookingResult {
  success: boolean;
  appointmentId?: string;
  message: string;
  error?: string;
}

// Add the missing booking form schema used by various components
export const bookingFormSchema = z.object({
  date: z.date(),
  time: z.string(),
  serviceDetails: z.object({
    selectedService: z.string(),
    additionalNotes: z.string().optional(),
    sameDay: z.boolean().optional(),
    weekend: z.boolean().optional(),
    fasting: z.boolean().optional(),
    duration: z.number().optional()
  }),
  locationDetails: z.object({
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    isHomeAddress: z.boolean().optional(),
    instructions: z.string().optional(),
    locationType: z.string().optional()
  }),
  patientDetails: z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    phone: z.string().optional(),
    dateOfBirth: z.date().optional()
  }),
  labOrder: z.object({
    skipped: z.boolean().optional(),
    doctorFaxNumber: z.string().optional(),
    hasFile: z.boolean().optional(),
  }).optional(),
  termsAccepted: z.boolean().optional()
});

// Add missing BookingService interface - needs to include isEnabled property
export interface BookingService {
  id: string;
  name: string;
  description?: string;
  price?: number | string;
  credits?: number;
  duration?: number;
  fasting_required?: boolean;
  is_active?: boolean;
  is_package?: boolean;
  included_services?: string[];
  tenant_id?: string;
  category?: string;
  image_url?: string;
  isEnabled?: boolean;
  availableForNonmembers?: boolean;
}

// Update TimeSlot interface to include the time property
export interface TimeSlot {
  id: string;
  start: string;
  end: string;
  available: boolean;
  booked?: boolean;
  phlebotomist_id?: string;
  time?: string; // Added time property used in hooks
  isAfterHours?: boolean;
  isWeekend?: boolean;
}

export interface AvailabilityDay {
  date: string | Date; // Updated to allow both string and Date types
  day_name?: string;
  slots: TimeSlot[];
  available: boolean;
  fullyBooked?: boolean;
}
