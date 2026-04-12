
import { supabase } from "@/integrations/supabase/client";
import { TimeRange, PhlebotomistSchedule } from './models';
import { doTimeRangesOverlap, formatDateForQuery } from './timeUtils';

/**
 * Check if a phlebotomist is available during a specific time
 */
export async function isPhlebotomistAvailable(
  phlebotomistId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  // Check if the phlebotomist has a schedule for this date
  const { data: schedules } = await supabase
    .from('phlebotomist_schedules')
    .select('*')
    .eq('phlebotomist_id', phlebotomistId)
    .eq('date', date)
    .eq('is_available', true);
  
  if (!schedules || schedules.length === 0) {
    return false;
  }
  
  // Check if the appointment time falls within the phlebotomist's schedule
  const isWithinSchedule = schedules.some(schedule => {
    return startTime >= schedule.start_time && endTime <= schedule.end_time;
  });
  
  if (!isWithinSchedule) {
    return false;
  }
  
  // Check if the phlebotomist already has appointments during this time
  const appointmentDate = new Date(date);
  const { year, month, day } = formatDateForQuery(appointmentDate);
  
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*')
    .eq('phlebotomist_id', phlebotomistId)
    .like('appointment_date', `${year}-${month}-${day}%`)
    .not('status', 'eq', 'cancelled')
    .order('appointment_date', { ascending: true });
  
  if (!appointments || appointments.length === 0) {
    return true; // No appointments, so available
  }
  
  // Define time range for the requested appointment
  const requestedTimeRange: TimeRange = {
    start: new Date(`${date}T${startTime}`),
    end: new Date(`${date}T${endTime}`)
  };
  
  // Check for time conflicts
  for (const appointment of appointments) {
    const appointmentStart = new Date(appointment.appointment_date);
    // Calculate the end time by adding travel time and 15 minutes for the appointment
    const travelTimeMinutes = appointment.estimated_travel_time || 0;
    const appointmentDuration = 15; // minutes
    
    const appointmentEnd = new Date(
      appointmentStart.getTime() + ((travelTimeMinutes + appointmentDuration) * 60 * 1000)
    );
    
    const appointmentTimeRange: TimeRange = {
      start: appointmentStart,
      end: appointmentEnd
    };
    
    // Check if the requested time overlaps with an existing appointment
    if (doTimeRangesOverlap(requestedTimeRange, appointmentTimeRange)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if a zipcode is within a phlebotomist's service areas
 */
export async function isZipcodeInPhlebotomistServiceAreas(
  phlebotomistId: string,
  zipcode: string
): Promise<boolean> {
  // Get the phlebotomist's schedule to check service area IDs
  const { data: schedules } = await supabase
    .from('phlebotomist_schedules')
    .select('service_area_ids')
    .eq('phlebotomist_id', phlebotomistId)
    .limit(1);
  
  if (!schedules || schedules.length === 0 || !schedules[0].service_area_ids || schedules[0].service_area_ids.length === 0) {
    return true; // No service areas defined, so consider all areas available
  }
  
  // Get all service areas for the phlebotomist
  const { data: serviceAreas } = await supabase
    .from('tenant_service_areas')
    .select('*')
    .in('id', schedules[0].service_area_ids)
    .eq('is_active', true);
  
  if (!serviceAreas || serviceAreas.length === 0) {
    return true; // No active service areas found, so consider all areas available
  }
  
  // Check if any of the phlebotomist's service areas include this zipcode
  return serviceAreas.some(area => 
    area.zipcode_list && area.zipcode_list.includes(zipcode)
  );
}
