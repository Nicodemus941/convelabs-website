
import { useState } from 'react';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { useTenantMembers } from './tenant/useTenantMembers';
import { useTenantServiceAreas } from './tenant/useTenantServiceAreas';
import { useTenantServices } from './tenant/useTenantServices';

// Define a cleaner export that combines all tenant management hooks
export function useTenantManagement() {
  const { currentTenant, createTenant, updateTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);
  
  const tenantMembers = useTenantMembers();
  const tenantServiceAreas = useTenantServiceAreas();
  const tenantServices = useTenantServices();
  
  // Main isLoading state that any of the hooks might affect
  const isAnyLoading = isLoading || tenantMembers.isLoading || 
                       tenantServiceAreas.isLoading || tenantServices.isLoading;

  return {
    // Core tenant operations
    currentTenant,
    createTenant,
    updateTenant,
    isLoading: isAnyLoading,
    
    // Member management
    getTenantMembers: tenantMembers.getTenantMembers,
    addTenantMember: tenantMembers.addTenantMember,
    removeTenantMember: tenantMembers.removeTenantMember,
    
    // Service areas
    getTenantServiceAreas: tenantServiceAreas.getTenantServiceAreas,
    addServiceArea: tenantServiceAreas.addServiceArea,
    
    // Services
    getTenantServices: tenantServices.getTenantServices,
    setupTenantServices: tenantServices.setupTenantServices
  };
}
