
// Re-export all functionality from the individual files, avoiding name conflicts
export * from './phlebotomist/models';
export * from './phlebotomist/timeUtils';
export * from './phlebotomist/availabilityService';
export * from './phlebotomist/serviceAreaService';

// Export the chainService updateAppointmentChain with a renamed alias to avoid conflict
import { updateAppointmentChain as updateAppointmentChainUtil } from './phlebotomist/chainService';
export { updateAppointmentChainUtil };

// Export everything else from assignmentService and chainService
export * from './phlebotomist/assignmentService';
export * from '@/integrations/supabase/queryHelper';
