
import { useState } from 'react';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { TenantService } from '@/types/tenant';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useTenantServiceManagement() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);
  const [services, setServices] = useState<TenantService[]>([]);

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
      
      setServices(data as TenantService[]);
      setIsLoading(false);
      return data as TenantService[];
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to fetch services: ${(error as Error).message}`);
      return [];
    }
  };

  // Add a new service
  const addTenantService = async (serviceData: Partial<TenantService>): Promise<TenantService | null> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");

      const newService = {
        ...serviceData,
        tenant_id: currentTenant.id,
        service_id: serviceData.service_id || serviceData.id || crypto.randomUUID(),
      };

      const { data, error } = await supabase
        .from('tenant_services')
        .insert(newService)
        .select()
        .single();

      if (error) throw error;

      setServices([...services, data as TenantService]);
      setIsLoading(false);
      toast.success("Service added successfully");
      return data as TenantService;
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to add service: ${(error as Error).message}`);
      return null;
    }
  };

  // Update a service
  const updateTenantService = async (id: string, serviceData: Partial<TenantService>): Promise<TenantService | null> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");

      const { data, error } = await supabase
        .from('tenant_services')
        .update(serviceData)
        .eq('id', id)
        .eq('tenant_id', currentTenant.id)
        .select()
        .single();

      if (error) throw error;

      setServices(services.map(service => service.id === id ? (data as TenantService) : service));
      setIsLoading(false);
      toast.success("Service updated successfully");
      return data as TenantService;
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to update service: ${(error as Error).message}`);
      return null;
    }
  };

  // Delete a service
  const deleteTenantService = async (id: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      if (!currentTenant) throw new Error("No organization selected");

      const { error } = await supabase
        .from('tenant_services')
        .delete()
        .eq('id', id)
        .eq('tenant_id', currentTenant.id);

      if (error) throw error;

      setServices(services.filter(service => service.id !== id));
      setIsLoading(false);
      toast.success("Service deleted successfully");
      return true;
    } catch (error) {
      setIsLoading(false);
      toast.error(`Failed to delete service: ${(error as Error).message}`);
      return false;
    }
  };

  return {
    services,
    isLoading,
    getTenantServices,
    addTenantService,
    updateTenantService,
    deleteTenantService
  };
}
