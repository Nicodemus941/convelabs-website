
import { Appointment, BookingFormValues, BookingResult } from '@/types/appointmentTypes';
import { PostgrestError } from '@supabase/supabase-js';

export interface AppointmentResponse {
  data: Appointment[] | null;
  error: PostgrestError | null;
}

export interface SingleAppointmentResponse {
  data: Appointment | null;
  error: PostgrestError | null;
}

export interface CreateAppointmentParams {
  formData: BookingFormValues;
}
