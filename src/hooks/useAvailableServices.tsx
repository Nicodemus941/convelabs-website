
import { useState } from 'react';
import { BookingService } from '@/types/appointmentTypes';
import { useServicesList } from './services/useServicesList';
import { useServiceCombinations } from './services/useServiceCombinations';
import { useServiceDetails } from './services/useServiceDetails';

/**
 * Main hook that composes all service-related hooks
 */
export function useAvailableServices() {
  const { 
    services, 
    isLoading: servicesLoading, 
    getAvailableServices 
  } = useServicesList();
  
  const { 
    serviceCombinations, 
    isLoading: combinationsLoading, 
    getServiceCombinations 
  } = useServiceCombinations();
  
  const { 
    isLoading: serviceDetailsLoading, 
    getServiceById: fetchServiceById 
  } = useServiceDetails();

  const isLoading = servicesLoading || combinationsLoading || serviceDetailsLoading;

  // Get all service options (both individual services and combinations)
  const getAllServiceOptions = async (includeNonMemberServices = true): Promise<BookingService[]> => {
    const [fetchedServices, fetchedCombinations] = await Promise.all([
      getAvailableServices(includeNonMemberServices),
      getServiceCombinations()
    ]);
    
    return [...fetchedServices, ...fetchedCombinations];
  };

  // Get a single service by ID, leveraging the underlying hook
  const getServiceById = async (serviceId: string): Promise<BookingService | null> => {
    return fetchServiceById(serviceId, services, serviceCombinations);
  };

  return {
    services,
    serviceCombinations,
    isLoading,
    getAvailableServices,
    getServiceCombinations,
    getAllServiceOptions,
    getServiceById
  };
}
