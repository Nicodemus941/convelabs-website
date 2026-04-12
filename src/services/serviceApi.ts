
import { supabase } from '@/integrations/supabase/client';
import { BookingService } from '@/types/appointmentTypes';
import { ServiceQueryParams } from '@/types/serviceTypes';

/**
 * Fetches available services based on tenant and membership status
 */
export async function fetchAvailableServices(
  tenantId: string | null,
  includeNonMemberServices: boolean = true
): Promise<BookingService[]> {
  let query;
  
  // If current tenant, get tenant services
  if (tenantId) {
    console.log("Fetching services for tenant:", tenantId);
    
    query = supabase
      .from('tenant_services')
      .select(`
        *,
        service:service_id(name, description)
      `)
      .eq('tenant_id', tenantId)
      .eq('is_enabled', true);
      
    if (!includeNonMemberServices) {
      query = query.eq('available_for_nonmembers', true);
    }
  } 
  // Otherwise get ConveLabs services
  else {
    console.log("Fetching ConveLabs services");
    
    query = supabase
      .from('services')
      .select('*, category:category_id(name)')
      .eq('is_addon', false);
      
    if (!includeNonMemberServices) {
      query = query.eq('is_included_in_membership', true);
    }
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  
  console.log("Services fetched:", data);
  
  // Transform data to BookingService format
  return formatServices(data, tenantId);
}

/**
 * Fetches service combinations (packages) for a tenant
 */
export async function fetchServiceCombinations(
  tenantId: string | null
): Promise<BookingService[]> {
  if (!tenantId) {
    return [];
  }
  
  const { data, error } = await supabase
    .from('tenant_service_combinations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (error) throw error;
  
  return (data || []).map(combo => ({
    id: combo.id,
    name: combo.name || "Service Combination",
    description: combo.description || "Combined service package",
    price: combo.price,
    duration: combo.duration || 60,
    is_active: combo.is_active,
    availableForNonmembers: true // Combinations are typically available to all
  }));
}

/**
 * Fetches a single service by ID
 */
export async function fetchServiceById(
  serviceId: string,
  tenantId: string | null,
  existingServices: BookingService[] = [],
  existingCombinations: BookingService[] = []
): Promise<BookingService | null> {
  // Check if service exists in provided collections first
  const service = existingServices.find(s => s.id === serviceId) || 
                  existingCombinations.find(s => s.id === serviceId);
                  
  if (service) {
    return service;
  }
  
  // Otherwise fetch from database
  if (tenantId) {
    // Try tenant_services first
    const { data: tenantService, error: tenantServiceError } = await supabase
      .from('tenant_services')
      .select(`
        *,
        service:service_id(name, description)
      `)
      .eq('id', serviceId)
      .maybeSingle();
      
    if (!tenantServiceError && tenantService) {
      return {
        id: tenantService.id,
        name: tenantService.service?.name || "Unknown Service",
        description: tenantService.service?.description || tenantService.description || "No description",
        price: tenantService.price,
        duration: tenantService.duration || 30,
        category: tenantService.category,
        is_active: tenantService.is_enabled,
        availableForNonmembers: tenantService.available_for_nonmembers
      };
    } else {
      // Try tenant_service_combinations
      const { data: combination, error: combinationError } = await supabase
        .from('tenant_service_combinations')
        .select('*')
        .eq('id', serviceId)
        .maybeSingle();
        
      if (!combinationError && combination) {
        return {
          id: combination.id,
          name: combination.name || "Service Combination",
          description: combination.description || "Combined service package",
          price: combination.price,
          duration: combination.duration || 60,
          is_active: combination.is_active,
          availableForNonmembers: true
        };
      }
    }
  } else {
    // Try regular ConveLabs services
    const { data: convService, error: convServiceError } = await supabase
      .from('services')
      .select('*, category:category_id(name)')
      .eq('id', serviceId)
      .maybeSingle();
      
    if (!convServiceError && convService) {
      return {
        id: convService.id,
        name: convService.name || "Unknown Service",
        description: convService.description || "No description",
        price: convService.addon_price,
        duration: 30, // Default duration
        category: convService.category?.name || "General",
        is_active: true,
        availableForNonmembers: !convService.is_included_in_membership
      };
    }
  }
  
  return null;
}

/**
 * Helper function to format services from the database
 */
function formatServices(data: any[], tenantId: string | null): BookingService[] {
  return (data || []).map(service => {
    if (tenantId) {
      // Tenant services - Make sure to get the name from the joined service
      return {
        id: service.id,
        name: service.service?.name || "Unnamed Service",
        description: service.service?.description || service.description || "No description available",
        price: service.price,
        duration: service.duration || 30, // Default to 30 if no duration
        category: service.category || "General",
        is_active: service.is_enabled,
        availableForNonmembers: service.available_for_nonmembers
      };
    } else {
      // ConveLabs services
      return {
        id: service.id,
        name: service.name || "Unknown Service",
        description: service.description || "No description available",
        price: service.addon_price,
        duration: 30, // Default duration
        category: service.category?.name || "General",
        is_active: true,
        availableForNonmembers: !service.is_included_in_membership
      };
    }
  });
}
