
import React, { useEffect } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import TenantHeader from '@/components/tenant/TenantHeader';
import TenantOverview from '@/components/tenant/TenantOverview';
import TenantMembers from '@/components/tenant/TenantMembers';
import TenantAppointments from '@/components/tenant/TenantAppointments';
import TenantSettings from '@/components/tenant/TenantSettings';
import TenantServices from '@/components/tenant/services/TenantServices';
import TenantMembershipPlans from '@/components/tenant/membership/TenantMembershipPlans';
import TenantPatients from '@/components/tenant/patients/TenantPatients';

const TenantDashboard = () => {
  const { tenantId, tab = 'overview' } = useParams<{ tenantId: string; tab?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    currentTenant, 
    userTenants, 
    isLoading, 
    switchTenant 
  } = useTenant();
  
  useEffect(() => {
    if (tenantId && (!currentTenant || currentTenant.id !== tenantId)) {
      switchTenant(tenantId);
    }
  }, [tenantId, currentTenant, switchTenant]);

  const handleTabChange = (value: string) => {
    if (tenantId) {
      navigate(`/tenant/dashboard/${tenantId}/${value}`);
    }
  };
  
  if (isLoading) {
    return (
      <DashboardWrapper>
        <div className="container mx-auto py-8 px-4">
          <Skeleton className="h-12 w-48 mb-6" />
          <Skeleton className="h-8 w-full max-w-sm mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </DashboardWrapper>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (!currentTenant) {
    return <Navigate to="/tenant/onboarding" replace />;
  }
  
  if (tenantId && !userTenants.some(t => t.tenant_id === tenantId)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardWrapper>
      <div className="container mx-auto py-8 px-4">
        <TenantHeader tenant={currentTenant} />
        
        <Tabs value={tab} onValueChange={handleTabChange} className="mt-6">
          <TabsList className="mb-6 border-b w-full">
            <TabsTrigger value="overview" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Overview</TabsTrigger>
            <TabsTrigger value="members" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Team Members</TabsTrigger>
            <TabsTrigger value="patients" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Patients</TabsTrigger>
            <TabsTrigger value="services" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Services</TabsTrigger>
            <TabsTrigger value="memberships" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Memberships</TabsTrigger>
            <TabsTrigger value="appointments" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Appointments</TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="mt-6">
            <TenantOverview tenant={currentTenant} />
          </TabsContent>
          
          <TabsContent value="members" className="mt-6">
            <TenantMembers tenant={currentTenant} />
          </TabsContent>
          
          <TabsContent value="patients" className="mt-6">
            <TenantPatients tenant={currentTenant} />
          </TabsContent>
          
          <TabsContent value="services" className="mt-6">
            <TenantServices tenant={currentTenant} />
          </TabsContent>
          
          <TabsContent value="memberships" className="mt-6">
            <TenantMembershipPlans tenant={currentTenant} />
          </TabsContent>
          
          <TabsContent value="appointments" className="mt-6">
            <TenantAppointments tenant={currentTenant} />
          </TabsContent>
          
          <TabsContent value="settings" className="mt-6">
            <TenantSettings tenant={currentTenant} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardWrapper>
  );
};

export default TenantDashboard;
