
import React from 'react';
import { useLocation } from 'react-router-dom';
import CampaignNavigation from '@/components/admin/marketing/CampaignNavigation';
import ScheduledCampaignsTab from '@/components/admin/marketing/ScheduledCampaignsTab';

const ScheduledCampaigns: React.FC = () => {
  const location = useLocation();
  
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-2">Marketing Campaigns</h1>
      <p className="text-muted-foreground mb-4">Manage your scheduled campaigns</p>
      
      <CampaignNavigation currentPath={location.pathname} />
      <ScheduledCampaignsTab />
    </div>
  );
};

export default ScheduledCampaigns;
