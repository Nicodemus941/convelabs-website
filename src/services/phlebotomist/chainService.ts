
import { supabase } from "@/integrations/supabase/client";
import { calculateDistance } from "../geocodingService";

/**
 * Update appointment chain with proper previous/next links and travel times
 */
export async function updateAppointmentChain(appointmentId: string): Promise<void> {
  try {
    // Get the appointment details
    const { data: appointment } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();
    
    if (!appointment || !appointment.phlebotomist_id) {
      return;
    }
    
    // Get all appointments for the phlebotomist on this day
    const appointmentDate = new Date(appointment.appointment_date);
    const dateString = appointmentDate.toISOString().split('T')[0];
    
    const { data: appointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('phlebotomist_id', appointment.phlebotomist_id)
      .like('appointment_date', `${dateString}%`)
      .not('status', 'eq', 'cancelled')
      .order('appointment_date', { ascending: true });
    
    if (!appointments || appointments.length <= 1) {
      return;
    }
    
    // Update the links between appointments
    for (let i = 0; i < appointments.length; i++) {
      const currentAppointment = appointments[i];
      const previousAppointment = i > 0 ? appointments[i - 1] : null;
      const nextAppointment = i < appointments.length - 1 ? appointments[i + 1] : null;
      
      // Calculate travel time from previous appointment
      let estimatedTravelTime = null;
      
      if (previousAppointment && 
          previousAppointment.latitude && 
          previousAppointment.longitude &&
          currentAppointment.latitude &&
          currentAppointment.longitude) {
        
        const distanceResult = await calculateDistance(
          { latitude: previousAppointment.latitude, longitude: previousAppointment.longitude },
          { latitude: currentAppointment.latitude, longitude: currentAppointment.longitude }
        );
        
        if (distanceResult) {
          estimatedTravelTime = Math.ceil(distanceResult.duration / 60); // Convert to minutes
        }
      }
      
      // Update the current appointment
      await supabase
        .from('appointments')
        .update({
          previous_appointment_id: previousAppointment ? previousAppointment.id : null,
          next_appointment_id: nextAppointment ? nextAppointment.id : null,
          estimated_travel_time: estimatedTravelTime
        })
        .eq('id', currentAppointment.id);
    }
  } catch (error) {
    console.error('Error updating appointment chain:', error);
  }
}
