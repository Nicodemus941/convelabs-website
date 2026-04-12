
import React from 'react';
import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, BarChart3, SendHorizonal } from 'lucide-react';

interface CampaignNavigationProps {
  currentPath: string;
}

const CampaignNavigation: React.FC<CampaignNavigationProps> = ({ currentPath }) => {
  const isActive = (path: string) => currentPath === path;

  return (
    <div className="border-b pb-4 mb-6">
      <Tabs defaultValue="create" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger 
            value="create" 
            asChild
            className="flex items-center gap-2"
          >
            <Link to="/admin/marketing/campaigns" className="flex items-center gap-1.5">
              <SendHorizonal className="h-4 w-4" />
              <span>Create Campaign</span>
            </Link>
          </TabsTrigger>
          
          <TabsTrigger 
            value="scheduled" 
            asChild
            className="flex items-center gap-2"
          >
            <Link to="/admin/marketing/scheduled" className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>Scheduled</span>
            </Link>
          </TabsTrigger>
          
          <TabsTrigger 
            value="analytics" 
            asChild
            className="flex items-center gap-2"
          >
            <Link to="/admin/marketing/analytics" className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              <span>Analytics</span>
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
};

export default CampaignNavigation;
