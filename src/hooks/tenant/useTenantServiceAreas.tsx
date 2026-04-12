
import { useState } from 'react';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { TenantServiceArea } from '@/types/tenant';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

export function useTenantServiceAreas() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);

  // Get tenant service areas
  const getTenantServiceAreas = async (): Promise<TenantServiceArea[]> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");

      const { data, error } = await supabase
        .from('tenant_service_areas')
        .select('*')
        .eq('tenant_id', currentTenant.id);

      if (error) throw error;
      
      setIsLoading(false);
      return data as TenantServiceArea[];
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to fetch service areas: ${(error as Error).message}`);
      return [];
    }
  };

  // Add a service area
  const addServiceArea = async (serviceArea: Partial<TenantServiceArea>): Promise<TenantServiceArea | null> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");
      
      // Ensure required fields are present
      if (!serviceArea.name) {
        throw new Error("Service area name is required");
      }
      
      if (!serviceArea.zipcode_list || !Array.isArray(serviceArea.zipcode_list)) {
        throw new Error("Zipcode list is required and must be an array");
      }

      const { data, error } = await supabase
        .from('tenant_service_areas')
        .insert({
          tenant_id: currentTenant.id,
          name: serviceArea.name,
          description: serviceArea.description,
          zipcode_list: serviceArea.zipcode_list,
          is_active: serviceArea.is_active !== undefined ? serviceArea.is_active : true
        })
        .select()
        .single();

      if (error) throw error;
      
      setIsLoading(false);
      toast.success("Service area added successfully");
      return data as TenantServiceArea;
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to add service area: ${(error as Error).message}`);
      return null;
    }
  };

  return {
    isLoading,
    getTenantServiceAreas,
    addServiceArea
  };
}
