
import React, { useState, useEffect } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFranchisePerformance } from '@/hooks/franchise/useFranchisePerformance';
import PerformanceOverview from './portal/PerformanceOverview';
import TerritoryManagement from './portal/TerritoryManagement';
import StaffManagement from './portal/StaffManagement';
import RevenueAnalytics from './portal/RevenueAnalytics';
import MarketingTools from './portal/MarketingTools';
import LoadingState from '@/components/ui/loading-state';
import CrossTerritoryAnalytics from './CrossTerritoryAnalytics';

const FranchiseOwnerPortal: React.FC = () => {
  const navigate = useNavigate();
  const { fetchPerformanceData } = useFranchisePerformance();
  const [timeRange, setTimeRange] = useState<'30' | '90' | '180' | '365'>('30');
  const [franchiseOwner, setFranchiseOwner] = useState({
    id: 'mock-franchise-owner-id',
    name: 'John Smith',
    territories: [
      { id: 'territory-1', name: 'Northern California' },
      { id: 'territory-2', name: 'Southern California' },
    ],
  });

  // Fetch performance data
  const { data: performanceData, isLoading } = useQuery({
    queryKey: ['franchisePerformance', franchiseOwner.id, timeRange],
    queryFn: async () => await fetchPerformanceData({ 
      franchiseId: franchiseOwner.id,
      days: parseInt(timeRange)
    }),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Franchise Owner Dashboard</h1>
        <div className="flex items-center space-x-2">
          <Select
            value={timeRange}
            onValueChange={(value: any) => setTimeRange(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 3 Months</SelectItem>
              <SelectItem value="180">Last 6 Months</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Territory Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Your Territories</CardTitle>
          </CardHeader>
          <CardContent>
            {franchiseOwner.territories.map((territory) => (
              <Button
                key={territory.id}
                variant="outline"
                className="w-full mb-2 justify-start"
                onClick={() => navigate(`/territories/${territory.id}`)}
              >
                {territory.name}
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
            <CardDescription>Performance overview across territories</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingState />
            ) : performanceData ? (
              <PerformanceOverview
                performanceData={performanceData}
                timeRange={timeRange}
                setTimeRange={setTimeRange}
              />
            ) : (
              <p>No performance data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      <CrossTerritoryAnalytics />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TerritoryManagement />
        <StaffManagement />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RevenueAnalytics />
        <MarketingTools />
      </div>
    </div>
  );
};

export default FranchiseOwnerPortal;
