
import { useState } from 'react';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { toast } from 'sonner';
import { BookingService } from '@/types/appointmentTypes';
import { fetchServiceById } from '@/services/serviceApi';

/**
 * Hook for fetching individual service details
 */
export function useServiceDetails() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getServiceById = async (
    serviceId: string, 
    existingServices: BookingService[] = [],
    existingCombinations: BookingService[] = []
  ): Promise<BookingService | null> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const tenantId = currentTenant?.id ?? null;
      const service = await fetchServiceById(
        serviceId, 
        tenantId,
        existingServices,
        existingCombinations
      );
      
      setIsLoading(false);
      return service;
    } catch (err: any) {
      console.error("Error fetching service:", err);
      setError(err);
      setIsLoading(false);
      toast.error(`Failed to fetch service: ${err.message}`);
      return null;
    }
  };

  return {
    isLoading,
    error,
    getServiceById
  };
}
