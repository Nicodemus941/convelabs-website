
import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TenantServiceStep from '@/components/tenant/appointments/TenantServiceStep';
import TenantDateTimeStep from '@/components/tenant/appointments/TenantDateTimeStep';
import TenantReviewStep from '@/components/tenant/appointments/TenantReviewStep';

const TenantBookAppointment = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { user } = useAuth();
  const { currentTenant, userTenants, isLoading, switchTenant } = useTenant();
  const [activeStep, setActiveStep] = React.useState(0);
  
  React.useEffect(() => {
    if (tenantId && (!currentTenant || currentTenant.id !== tenantId)) {
      switchTenant(tenantId);
    }
  }, [tenantId, currentTenant]);
  
  if (isLoading) {
    return (
      <DashboardWrapper>
        <div className="container mx-auto py-8 px-4">
          <Skeleton className="h-12 w-48 mb-6" />
          <Skeleton className="h-8 w-full max-w-sm mb-4" />
          <div className="max-w-3xl mx-auto">
            <Skeleton className="h-96 w-full" />
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
  
  if (tenantId && !userTenants.some(t => t.id === tenantId)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return (
    <DashboardWrapper>
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Book Appointment</h1>
            <p className="text-muted-foreground">
              {currentTenant.name}
            </p>
          </div>
        </div>
        
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Book an Appointment</CardTitle>
              <CardDescription>
                Select a service, choose a time, and confirm your appointment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-8">
                <ol className="flex items-center w-full text-sm font-medium text-center text-gray-500 dark:text-gray-400 sm:text-base">
                  {['Service', 'Date & Time', 'Review'].map((step, index) => (
                    <li key={index} className={`flex items-center ${activeStep >= index ? 'text-primary' : 'text-gray-500'}`}>
                      <span className={`flex items-center justify-center w-8 h-8 mr-2 text-xs border rounded-full shrink-0 ${activeStep >= index ? 'border-primary text-primary' : 'border-gray-500'}`}>
                        {index + 1}
                      </span>
                      {step}
                      {index < 2 && (
                        <svg className="w-3 h-3 ml-2 sm:ml-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 12 10">
                          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 5 4 4 6-8"/>
                        </svg>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
              
              {activeStep === 0 && (
                <TenantServiceStep 
                  tenant={currentTenant}
                  onNext={() => setActiveStep(1)}
                />
              )}
              
              {activeStep === 1 && (
                <TenantDateTimeStep
                  tenant={currentTenant}
                  onPrevious={() => setActiveStep(0)}
                  onNext={() => setActiveStep(2)}
                />
              )}
              
              {activeStep === 2 && (
                <TenantReviewStep
                  tenant={currentTenant}
                  onPrevious={() => setActiveStep(1)}
                  onComplete={() => {}}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardWrapper>
  );
};

export default TenantBookAppointment;
