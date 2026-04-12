
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import LoadingState from '@/components/ui/loading-state';
import { useFranchisePerformance } from '@/hooks/franchise/useFranchisePerformance';
import PerformanceOverview from '../portal/PerformanceOverview';

const TerritoryDashboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { fetchPerformanceData } = useFranchisePerformance();
  const [timeRange, setTimeRange] = useState<'30' | '90' | '180' | '365'>('30');

  // Fetch territory performance data
  const { data: performanceData, isLoading } = useQuery({
    queryKey: ['territoryPerformance', id, timeRange],
    queryFn: async () => await fetchPerformanceData({
      territoryId: id,
      days: parseInt(timeRange)
    }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Territory Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Performance Overview</CardTitle>
          <CardDescription>
            Key metrics for this territory
          </CardDescription>
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

      {/* Additional territory-specific components would go here */}
    </div>
  );
};

export default TerritoryDashboard;
