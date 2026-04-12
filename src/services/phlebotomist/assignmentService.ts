
import { supabase } from "@/integrations/supabase/client";
import { calculateDistance, GeoCoordinates } from "../geocodingService";
import { isPhlebotomistAvailable, isZipcodeInPhlebotomistServiceAreas } from "./availabilityService";
import { calculateTimeDifferenceMinutes } from "./timeUtils";
import { fetchRecords } from "@/integrations/supabase/queryHelper";

// Helper to calculate end time as string
function calculateEndTime(start: Date, durationMinutes: number): string {
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return end.toTimeString().substring(0, 8);
}

// Phlebotomist user shape
interface Phlebotomist {
  id: string;
}

// Appointment shape
interface Appointment {
  id: string;
  appointment_date: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
}

/**
 * Find an available phlebotomist for an appointment
 */
export async function findAvailablePhlebotomist(
  appointmentDate: Date,
  appointmentCoordinates: GeoCoordinates,
  zipcode: string,
  durationMinutes: number = 15
): Promise<string | null> {
  try {
    console.log(`Finding phlebotomist for appointment at ${appointmentDate.toISOString()} in zipcode ${zipcode}`);
    
    // Get all phlebotomists using our simplified query helper
    const { data: phlebotomistData, error: phlebotomistError } = await fetchRecords<Phlebotomist>({
      table: 'user_profiles',
      columns: 'id',
      filters: { role: 'phlebotomist' }
    });
    
    // Handle potential errors or null data
    if (phlebotomistError) {
      console.error("Error fetching phlebotomists:", phlebotomistError);
      return null;
    }
    
    const phlebotomists = phlebotomistData || [];
    console.log(`Found ${phlebotomists.length} phlebotomists to check`);
    
    if (phlebotomists.length === 0) {
      console.log("No phlebotomists available in the system");
      return null;
    }
    
    const date = appointmentDate.toISOString().split('T')[0];
    const startTime = appointmentDate.toTimeString().substring(0, 8);
    const endTime = calculateEndTime(appointmentDate, durationMinutes);
    
    // Find phlebotomists with availability
    for (const phlebotomist of phlebotomists) {
      console.log(`Checking phlebotomist ${phlebotomist.id}`);
      
      // Check if the phlebotomist is available during the requested time
      const isAvailable = await isPhlebotomistAvailable(
        phlebotomist.id,
        date,
        startTime,
        endTime
      );
      
      if (!isAvailable) {
        console.log(`Phlebotomist ${phlebotomist.id} is not available at the requested time`);
        continue;
      }
      
      // Check if the zipcode is within the phlebotomist's service areas
      const isInServiceArea = await isZipcodeInPhlebotomistServiceAreas(
        phlebotomist.id,
        zipcode
      );
      
      if (!isInServiceArea) {
        console.log(`Zipcode ${zipcode} is not in service area for phlebotomist ${phlebotomist.id}`);
        continue;
      }
      
      console.log(`Phlebotomist ${phlebotomist.id} is available and covers zipcode ${zipcode}`);
      
      // Get the phlebotomist's appointments for the day using our helper
      const { data: appointmentData, error: appointmentError } = await fetchRecords<Appointment>({
        table: 'appointments',
        columns: 'id, appointment_date, latitude, longitude, status',
        filters: {
          phlebotomist_id: phlebotomist.id,
          'like_appointment_date': `${date}%`,
          'not_status': 'cancelled'
        },
        order: { column: 'appointment_date', ascending: true }
      });
      
      // Handle potential errors
      if (appointmentError) {
        console.error("Error fetching appointments:", appointmentError);
        continue;
      }
      
      const appointments = appointmentData || [];
      console.log(`Phlebotomist ${phlebotomist.id} has ${appointments.length} appointments on ${date}`);
      
      // If no appointments, this phlebotomist is available
      if (appointments.length === 0) {
        console.log(`Phlebotomist ${phlebotomist.id} has no appointments - assigning appointment`);
        return phlebotomist.id;
      }
      
      // Check if there's enough buffer time between appointments
      let canFit = true;
      
      for (const appointment of appointments) {
        if (!appointment.latitude || !appointment.longitude) {
          console.log(`Skipping appointment ${appointment.id} without coordinates`);
          continue;
        }
        
        // Calculate distance and travel time from this appointment to the new one
        const distanceResult = await calculateDistance(
          { latitude: appointment.latitude, longitude: appointment.longitude },
          appointmentCoordinates
        );
        
        if (!distanceResult) {
          console.log(`Could not calculate distance for appointment ${appointment.id}`);
          continue;
        }
        
        // Create date object for time calculations
        const appointmentTime = new Date(appointment.appointment_date);
        
        // Calculate time difference in minutes
        const diffMs = Math.abs(appointmentDate.valueOf() - appointmentTime.valueOf());
        const timeDifferenceMinutes = Math.floor(diffMs / 60000);
        
        // Calculate required buffer
        const travelTimeMinutes = Math.floor(distanceResult.duration / 60);
        const serviceTimeMinutes = 15;
        const requiredBufferMinutes = travelTimeMinutes + serviceTimeMinutes;
        
        console.log(`Appointment ${appointment.id} is ${timeDifferenceMinutes} minutes away, requires ${requiredBufferMinutes} minutes buffer`);
        
        if (timeDifferenceMinutes < requiredBufferMinutes) {
          console.log(`Not enough buffer time (${timeDifferenceMinutes} < ${requiredBufferMinutes})`);
          canFit = false;
          break;
        }
      }
      
      if (canFit) {
        console.log(`Phlebotomist ${phlebotomist.id} has enough buffer time - assigning appointment`);
        return phlebotomist.id;
      }
    }
    
    console.log("No available phlebotomists found that match all criteria");
    return null;
  } catch (error) {
    console.error("Error finding available phlebotomist:", error);
    return null;
  }
}

/**
 * Update the appointment chain by calculating travel times and updating related appointments
 */
export async function updateAppointmentChain(appointmentId: string): Promise<boolean> {
  try {
    console.log(`Updating appointment chain for appointment ${appointmentId}`);
    
    // Get the appointment
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();
      
    if (appointmentError || !appointment) {
      console.error("Error fetching appointment:", appointmentError);
      return false;
    }
    
    // If no phlebotomist assigned, nothing to do
    if (!appointment.phlebotomist_id) {
      console.log(`No phlebotomist assigned to appointment ${appointmentId}`);
      return true;
    }
    
    const appointmentDate = new Date(appointment.appointment_date);
    const dateString = appointmentDate.toISOString().split('T')[0];
    
    // Get all appointments for this phlebotomist on the same day
    const { data: phlebAppointments, error: phlebAppointmentError } = await supabase
      .from('appointments')
      .select('*')
      .eq('phlebotomist_id', appointment.phlebotomist_id)
      .like('appointment_date', `${dateString}%`)
      .not('status', 'eq', 'cancelled')
      .order('appointment_date', { ascending: true });
      
    if (phlebAppointmentError) {
      console.error("Error fetching phlebotomist appointments:", phlebAppointmentError);
      return false;
    }
    
    console.log(`Found ${phlebAppointments.length} appointments for phlebotomist ${appointment.phlebotomist_id} on ${dateString}`);
    
    // Sort appointments by time
    const sortedAppointments = phlebAppointments.sort((a, b) => 
      new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime()
    );
    
    // Update the chain - link appointments and calculate travel times
    for (let i = 0; i < sortedAppointments.length; i++) {
      const currentAppointment = sortedAppointments[i];
      
      // Reset links
      const updates: any = {
        previous_appointment_id: null,
        next_appointment_id: null
      };
      
      // Link to previous appointment
      if (i > 0) {
        const prevAppointment = sortedAppointments[i - 1];
        updates.previous_appointment_id = prevAppointment.id;
        
        // Calculate travel time if coordinates are available
        if (
          currentAppointment.latitude && 
          currentAppointment.longitude && 
          prevAppointment.latitude && 
          prevAppointment.longitude
        ) {
          const distanceResult = await calculateDistance(
            { latitude: prevAppointment.latitude, longitude: prevAppointment.longitude },
            { latitude: currentAppointment.latitude, longitude: currentAppointment.longitude }
          );
          
          if (distanceResult) {
            // Store travel time in minutes
            updates.estimated_travel_time = Math.ceil(distanceResult.duration / 60);
            console.log(`Travel time from ${prevAppointment.id} to ${currentAppointment.id} is ${updates.estimated_travel_time} minutes`);
          }
        }
      }
      
      // Link to next appointment
      if (i < sortedAppointments.length - 1) {
        updates.next_appointment_id = sortedAppointments[i + 1].id;
      }
      
      // Update the appointment
      const { error: updateError } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', currentAppointment.id);
        
      if (updateError) {
        console.error(`Error updating appointment ${currentAppointment.id}:`, updateError);
      }
    }
    
    console.log(`Successfully updated appointment chain for ${appointmentId}`);
    return true;
  } catch (error) {
    console.error("Error updating appointment chain:", error);
    return false;
  }
}
