import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TrendingUp, Users, DollarSign, Eye } from 'lucide-react';

export const DashboardAccessButton: React.FC = () => {
  return (
    <div className="fixed top-4 right-4 z-50">
      <Link to="/dashboard/analytics">
        <Button 
          variant="outline" 
          size="sm"
          className="bg-white/90 backdrop-blur-sm border-blue-200 text-blue-700 hover:bg-blue-50 shadow-lg"
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          Analytics Dashboard
        </Button>
      </Link>
    </div>
  );
};

export const QuickStatsWidget: React.FC = () => {
  return (
    <div className="fixed bottom-4 right-4 z-40 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg p-3 shadow-lg max-w-xs">
      <div className="text-xs text-gray-600 mb-2 font-medium">Today's Performance</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3 text-blue-500" />
          <span>12 visitors</span>
        </div>
        <div className="flex items-center gap-1">
          <Eye className="h-3 w-3 text-green-500" />
          <span>4.2% CVR</span>
        </div>
        <div className="flex items-center gap-1">
          <DollarSign className="h-3 w-3 text-yellow-500" />
          <span>$1,247</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-purple-500" />
          <span>3 bookings</span>
        </div>
      </div>
    </div>
  );
};