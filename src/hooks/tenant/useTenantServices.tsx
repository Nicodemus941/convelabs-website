
import { useState } from 'react';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { TenantService } from '@/types/tenant';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

export function useTenantServices() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);

  // Get all services for the tenant
  const getTenantServices = async (): Promise<TenantService[]> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");

      const { data, error } = await supabase
        .from('tenant_services')
        .select('*')
        .eq('tenant_id', currentTenant.id);

      if (error) throw error;
      
      setIsLoading(false);
      return data as TenantService[];
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to fetch services: ${(error as Error).message}`);
      return [];
    }
  };

  // Set up initial services for a tenant
  const setupTenantServices = async (serviceIds: string[]): Promise<boolean> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");

      // First, get all available services
      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .in('id', serviceIds);

      if (servicesError) throw servicesError;
      
      // Create tenant services entries
      const tenantServices = services.map(service => ({
        tenant_id: currentTenant.id,
        service_id: service.id,
        price: service.addon_price || null,
        is_enabled: true
      }));

      const { error: insertError } = await supabase
        .from('tenant_services')
        .insert(tenantServices);

      if (insertError) throw insertError;
      
      setIsLoading(false);
      toast.success("Services set up successfully");
      return true;
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to set up services: ${(error as Error).message}`);
      return false;
    }
  };

  return {
    isLoading,
    getTenantServices,
    setupTenantServices
  };
}
