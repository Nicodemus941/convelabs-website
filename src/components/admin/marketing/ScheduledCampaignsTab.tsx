
import React from 'react';
import ScheduledCampaignsTable from './ScheduledCampaignsTable';

const ScheduledCampaignsTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Scheduled Campaigns</h2>
      <p className="text-muted-foreground">
        View and manage your scheduled marketing campaigns.
      </p>
      
      <ScheduledCampaignsTable />
    </div>
  );
};

export default ScheduledCampaignsTab;
