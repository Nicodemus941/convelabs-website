
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CampaignAnalyticsDashboard from '@/components/admin/marketing/CampaignAnalyticsDashboard';

const MarketingAnalytics = () => {
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-2">Marketing Analytics</h1>
      <p className="text-muted-foreground mb-8">Track and analyze your email marketing campaign performance</p>
      
      <CampaignAnalyticsDashboard />
    </div>
  );
};

export default MarketingAnalytics;
