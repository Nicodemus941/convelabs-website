
import { useState } from 'react';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { toast } from 'sonner';
import { BookingService } from '@/types/appointmentTypes';
import { fetchServiceCombinations } from '@/services/serviceApi';

/**
 * Hook for fetching and managing service combinations (packages)
 */
export function useServiceCombinations() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);
  const [serviceCombinations, setServiceCombinations] = useState<BookingService[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const getServiceCombinations = async (): Promise<BookingService[]> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const tenantId = currentTenant?.id ?? null;
      const combinations = await fetchServiceCombinations(tenantId);
      
      setServiceCombinations(combinations);
      setIsLoading(false);
      return combinations;
    } catch (err: any) {
      console.error("Error fetching service combinations:", err);
      setError(err);
      setIsLoading(false);
      toast.error(`Failed to fetch service combinations: ${err.message}`);
      return [];
    }
  };

  return {
    serviceCombinations,
    isLoading,
    error,
    getServiceCombinations
  };
}
