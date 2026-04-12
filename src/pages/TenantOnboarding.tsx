
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import TenantOnboardingForm from '@/components/tenant/TenantOnboardingForm';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';

const TenantOnboarding = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { createTenant, isLoading } = useTenant();
  const navigate = useNavigate();
  const [formStep, setFormStep] = useState(0);
  
  const handleCreateTenant = async (formData: any) => {
    try {
      const tenant = await createTenant({
        name: formData.name,
        contact_email: formData.contactEmail || user?.email,
        branding: {
          primary_color: formData.primaryColor || '#5a67d8',
          secondary_color: formData.secondaryColor || '#4c51bf'
        }
      });
      
      // Navigate to tenant dashboard
      navigate(`/tenant/dashboard/${tenant.id}`);
    } catch (error) {
      console.error("Error creating tenant:", error);
    }
  };
  
  if (authLoading) {
    return (
      <DashboardWrapper>
        <div className="container mx-auto py-16 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardWrapper>
    );
  }
  
  return (
    <DashboardWrapper>
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Set Up Your Organization</CardTitle>
              <CardDescription>
                Create a workspace for your team to collaborate and manage resources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TenantOnboardingForm 
                onSubmit={handleCreateTenant} 
                isLoading={isLoading}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardWrapper>
  );
};

export default TenantOnboarding;
