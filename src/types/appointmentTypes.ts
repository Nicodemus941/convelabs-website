
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
    visitType?: string;
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
    aptUnit?: string;
    gateCode?: string;
    // Captured from the address autocomplete (Google Places) — used for the
    // exact service-radius check.
    lat?: number;
    lng?: number;
  };
  patientDetails: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth?: Date;
    // When booking for a saved family member, stamp their id here so the
    // appointment row links back to family_members.
    familyMemberId?: string | null;
  };
  additionalPatients?: Array<{
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
  }>;
  labOrder?: {
    skipped?: boolean;
    doctorFaxNumber?: string;
    hasFile?: boolean;
    labDestination?: string;
    hasInsuranceFile?: boolean;
    /** Order is prepaid / "Client Bill" (Evexia, Access Medical Labs, Ulta Lab Tests, or order marked Client Bill) — no patient insurance needed. */
    clientBilled?: boolean;
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
    visitType: z.string().optional(),
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
    locationType: z.string().optional(),
    aptUnit: z.string().optional(),
    gateCode: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  patientDetails: z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    // Phone is REQUIRED — the booking confirmation + reminder SMS have no
    // destination without it, so a phone-less booking silently gets no texts
    // (root cause of missed confirmations). Lenient 10-digit check so real
    // formats like "(407) 617-2064" pass. Companions below stay optional.
    phone: z.string()
      .trim()
      .min(1, "Phone number is required")
      .refine((v) => v.replace(/\D/g, "").length >= 10, "Enter a valid 10-digit phone number"),
    // DOB is REQUIRED — the phleb card + NIIMBOT tube label both depend on
    // it for patient identification at the visit. Previously optional →
    // dropped silently on bookings like Shaun Chambers (2026-05-11), forcing
    // admin to backfill manually. Accept either a Date (legacy calendar
    // picker) or YYYY-MM-DD string (current native input).
    dateOfBirth: z.union([z.date(), z.string().min(1, 'Date of birth is required')]),
    familyMemberId: z.string().nullable().optional(),
  }),
  additionalPatients: z.array(z.object({
    firstName: z.string().min(1, "First name required"),
    lastName: z.string().min(1, "Last name required"),
    email: z.string().optional(),
    phone: z.string().optional(),
    dateOfBirth: z.string().optional(),
  })).optional(),
  labOrder: z.object({
    skipped: z.boolean().optional(),
    doctorFaxNumber: z.string().optional(),
    hasFile: z.boolean().optional(),
    labDestination: z.string().optional(),
    hasInsuranceFile: z.boolean().optional(),
    clientBilled: z.boolean().optional(),
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
  time?: string;
  displayLabel?: string; // "9:00 AM - 9:30 AM" arrival window
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
