
import React from 'react';
import { MarketingCampaignForm } from '@/components/admin/marketing';
import CampaignNavigation from '@/components/admin/marketing/CampaignNavigation';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const MarketingCampaigns = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const handleGoBack = () => {
    navigate('/dashboard/super_admin');
  };
  
  return (
    <div className="container py-8">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={handleGoBack} 
          className="flex items-center gap-2 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
        <h1 className="text-3xl font-bold mb-2">Marketing Campaigns</h1>
        <p className="text-muted-foreground mb-4">Create and send targeted marketing campaigns to your audience</p>
      </div>
      
      <CampaignNavigation currentPath={location.pathname} />
      <MarketingCampaignForm onCancel={handleGoBack} />
    </div>
  );
};

export default MarketingCampaigns;
