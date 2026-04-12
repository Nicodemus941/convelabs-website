import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceEnhanced, ServiceStaffAssignment } from '@/types/adminTypes';
import { toast } from 'sonner';

export function useEnhancedServices() {
  const [services, setServices] = useState<ServiceEnhanced[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('services_enhanced')
        .select(`
          *,
          parent_service:parent_service_id(id, name),
          sub_services:services_enhanced!parent_service_id(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServices((data as any[])?.map(item => ({
        ...item,
        service_type: item.service_type || 'individual',
        parent_service: item.parent_service ? {
          ...item.parent_service,
          base_price: 0,
          duration_minutes: 0,
          category: '',
          service_type: 'individual',
          requires_lab_order: false,
          is_active: true,
          created_at: '',
          updated_at: ''
        } : undefined
      })) || []);
    } catch (err: any) {
      console.error('Error fetching enhanced services:', err);
      setError(err.message);
      toast.error('Failed to fetch services');
    } finally {
      setIsLoading(false);
    }
  };

  const createService = async (serviceData: Partial<ServiceEnhanced>) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('services_enhanced')
        .insert(serviceData as any)
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Service created successfully');
      fetchServices();
      return data;
    } catch (err: any) {
      console.error('Error creating service:', err);
      toast.error('Failed to create service');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateService = async (id: string, updates: Partial<ServiceEnhanced>) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('services_enhanced')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Service updated successfully');
      fetchServices();
      return data;
    } catch (err: any) {
      console.error('Error updating service:', err);
      toast.error('Failed to update service');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteService = async (id: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('services_enhanced')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Service deleted successfully');
      fetchServices();
    } catch (err: any) {
      console.error('Error deleting service:', err);
      toast.error('Failed to delete service');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const assignStaffToService = async (serviceId: string, staffId: string, certificationLevel: string = 'standard') => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('service_staff_assignments')
        .insert([{
          service_id: serviceId,
          staff_id: staffId,
          certification_level: certificationLevel
        }])
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Staff assigned to service successfully');
      return data;
    } catch (err: any) {
      console.error('Error assigning staff to service:', err);
      toast.error('Failed to assign staff to service');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const removeStaffFromService = async (serviceId: string, staffId: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('service_staff_assignments')
        .delete()
        .eq('service_id', serviceId)
        .eq('staff_id', staffId);

      if (error) throw error;
      
      toast.success('Staff removed from service successfully');
    } catch (err: any) {
      console.error('Error removing staff from service:', err);
      toast.error('Failed to remove staff from service');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  return {
    services,
    isLoading,
    error,
    fetchServices,
    createService,
    updateService,
    deleteService,
    assignStaffToService,
    removeStaffFromService
  };
}