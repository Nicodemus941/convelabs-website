
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarketingCampaignForm } from "@/components/admin/marketing";
import CampaignAnalyticsDashboard from "@/components/admin/marketing/CampaignAnalyticsDashboard";
import { useNavigate } from "react-router-dom";
import { getRoutingRole } from '@/lib/authRole';

const MarketingTab = () => {
  const navigate = useNavigate();
  
  const handleCancel = () => {
    const role = getRoutingRole(JSON.parse(localStorage.getItem('sb-yluyonhrxxtyuiyrdixl-auth-token') || '{}')?.user) || 'office_manager';
    navigate(`/dashboard/${role}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Growth</h1>
        <p className="text-sm text-muted-foreground">Campaigns and their performance.</p>
      </div>
      <Tabs defaultValue="create" className="space-y-6">
        <TabsList className="w-full max-w-md">
          <TabsTrigger value="create">Create Campaign</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        
        <TabsContent value="create">
          <MarketingCampaignForm onCancel={handleCancel} />
        </TabsContent>
        
        <TabsContent value="analytics">
          <CampaignAnalyticsDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MarketingTab;
