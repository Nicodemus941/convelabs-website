
import { BookingService } from './appointmentTypes';

export interface ServiceQueryParams {
  includeNonMemberServices?: boolean;
  tenantId?: string;
}

export interface ServiceQueryResult {
  services: BookingService[];
  isLoading: boolean;
  error: Error | null;
}

export interface ServiceCombinationResult {
  serviceCombinations: BookingService[];
  isLoading: boolean;
  error: Error | null;
}
