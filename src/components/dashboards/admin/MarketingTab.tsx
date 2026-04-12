
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarketingCampaignForm } from "@/components/admin/marketing";
import CampaignAnalyticsDashboard from "@/components/admin/marketing/CampaignAnalyticsDashboard";
import AdminTabsLayout from "./AdminTabsLayout";
import { useNavigate } from "react-router-dom";

const MarketingTab = () => {
  const navigate = useNavigate();
  
  const handleCancel = () => {
    navigate('/dashboard/super_admin');
  };

  return (
    <AdminTabsLayout title="Marketing Campaigns">
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
    </AdminTabsLayout>
  );
};

export default MarketingTab;
