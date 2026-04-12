
import { useState, useEffect } from 'react';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { toast } from 'sonner';
import { BookingService } from '@/types/appointmentTypes';
import { fetchAvailableServices } from '@/services/serviceApi';

/**
 * Hook for fetching and managing available services
 */
export function useServicesList() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);
  const [services, setServices] = useState<BookingService[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const getAvailableServices = async (includeNonMemberServices = true): Promise<BookingService[]> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const tenantId = currentTenant?.id ?? null;
      const fetchedServices = await fetchAvailableServices(tenantId, includeNonMemberServices);
      
      setServices(fetchedServices);
      setIsLoading(false);
      return fetchedServices;
    } catch (err: any) {
      console.error("Error fetching services:", err);
      setError(err);
      setIsLoading(false);
      // Don't show toast for service fetch errors — fallback services will be used
      return [];
    }
  };

  return {
    services,
    isLoading,
    error,
    getAvailableServices
  };
}
