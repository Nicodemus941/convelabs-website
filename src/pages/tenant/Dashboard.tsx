import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SubscriptionInfoCard from '@/components/tenant/SubscriptionInfoCard';

// Import your other tenant dashboard components here
// For example: import TenantMembers from '@/components/tenant/TenantMembers';

const Dashboard = () => {
  const { tenantId, tab } = useParams<{ tenantId: string; tab?: string }>();
  const [activeTab, setActiveTab] = useState(tab || 'overview');
  const { currentTenant, userTenants, switchTenant, isLoading } = useTenant();
  const navigate = useNavigate();
  
  // Effect to set the active tab when the URL parameter changes
  useEffect(() => {
    if (tab) {
      setActiveTab(tab);
    }
  }, [tab]);
  
  // Effect to switch tenant when tenantId changes
  useEffect(() => {
    if (tenantId && (!currentTenant || currentTenant.id !== tenantId)) {
      switchTenant(tenantId);
    }
  }, [tenantId, currentTenant]);
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    navigate(`/tenant/dashboard/${tenantId}/${value}`);
  };
  
  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }
  
  if (!currentTenant) {
    return <div className="text-center p-8">No organization selected</div>;
  }
  
  return (
    <div className="container mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{currentTenant.name} Dashboard</h1>
        <p className="text-gray-500">Manage your organization settings and resources</p>
      </div>
      
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Team Members</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              {/* Your main overview content here */}
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h2 className="text-xl font-semibold mb-4">Organization Overview</h2>
                <p>Welcome to your organization dashboard. Here you can manage all aspects of your tenant.</p>
              </div>
            </div>
            
            <div>
              {/* Subscription info in sidebar */}
              <SubscriptionInfoCard tenantId={tenantId} />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="members">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h2 className="text-xl font-semibold mb-4">Team Members</h2>
            {/* Team members component will go here */}
            <p>Manage your team members here.</p>
          </div>
        </TabsContent>
        
        <TabsContent value="settings">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h2 className="text-xl font-semibold mb-4">Organization Settings</h2>
            {/* Settings component will go here */}
            <p>Configure your organization settings here.</p>
          </div>
        </TabsContent>
        
        <TabsContent value="subscription">
          <div className="max-w-3xl mx-auto">
            <SubscriptionInfoCard tenantId={tenantId} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
