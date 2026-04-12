
import React from 'react';
import { Card, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Mail } from 'lucide-react';

const CampaignFormHeader: React.FC = () => {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Mail className="h-5 w-5" />
        Marketing Campaign
      </CardTitle>
      <CardDescription>
        Create and send a marketing campaign to ConveLabs members or external recipients
      </CardDescription>
    </CardHeader>
  );
};

export default CampaignFormHeader;

