
import { supabase } from "@/integrations/supabase/client";
import { ServiceArea } from "./models";

/**
 * Get service areas
 */
export async function getServiceAreas(): Promise<ServiceArea[]> {
  try {
    const { data, error } = await supabase
      .from('tenant_service_areas')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Error fetching service areas:", error);
    return [];
  }
}

/**
 * Get phlebotomist's assigned service areas
 */
export async function getPhlebotomistServiceAreas(phlebotomistId: string): Promise<ServiceArea[]> {
  try {
    // Get the phlebotomist's schedule with service area IDs
    const { data: schedules } = await supabase
      .from('phlebotomist_schedules')
      .select('service_area_ids')
      .eq('phlebotomist_id', phlebotomistId)
      .limit(1);
    
    if (!schedules || schedules.length === 0 || !schedules[0].service_area_ids || schedules[0].service_area_ids.length === 0) {
      return []; // No service areas assigned
    }

    // Get the service areas
    const { data: serviceAreas, error } = await supabase
      .from('tenant_service_areas')
      .select('*')
      .in('id', schedules[0].service_area_ids)
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    return serviceAreas || [];
  } catch (error) {
    console.error("Error fetching phlebotomist service areas:", error);
    return [];
  }
}

/**
 * Assign service areas to a phlebotomist
 */
export async function assignServiceAreasToPhlebotomist(
  phlebotomistId: string,
  serviceAreaIds: string[]
): Promise<boolean> {
  try {
    const dateToday = new Date().toISOString().split('T')[0];
    
    // Get the phlebotomist's schedules
    const { data: existingSchedules } = await supabase
      .from('phlebotomist_schedules')
      .select('*')
      .eq('phlebotomist_id', phlebotomistId)
      .gte('date', dateToday);
    
    // Update each schedule with the new service area IDs
    if (existingSchedules && existingSchedules.length > 0) {
      // Update the existing schedules
      for (const schedule of existingSchedules) {
        await supabase
          .from('phlebotomist_schedules')
          .update({ service_area_ids: serviceAreaIds })
          .eq('id', schedule.id);
      }
    } else {
      // Create a new schedule entry if none exists
      await supabase
        .from('phlebotomist_schedules')
        .insert({
          phlebotomist_id: phlebotomistId,
          date: dateToday,
          start_time: '08:00:00',
          end_time: '17:00:00',
          is_available: true,
          service_area_ids: serviceAreaIds
        });
    }
    
    return true;
  } catch (error) {
    console.error("Error assigning service areas:", error);
    return false;
  }
}
