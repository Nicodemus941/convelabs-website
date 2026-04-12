
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PerformanceOverview from './PerformanceOverview';
import { useQuery } from '@tanstack/react-query';
import LoadingState from '@/components/ui/loading-state';
import ErrorBoundary from '@/components/ui/error-boundary';
import { useFranchisePerformance } from '@/hooks/franchise/useFranchisePerformance';

interface FranchisePerformanceViewProps {
  franchiseId?: string;
  territoryId?: string;
}

const FranchisePerformanceView: React.FC<FranchisePerformanceViewProps> = ({ 
  franchiseId, 
  territoryId 
}) => {
  const [timeRange, setTimeRange] = useState<'30' | '90' | '180' | '365'>('30');
  const { generateMockData } = useFranchisePerformance();
  
  // Fetch performance data from Supabase based on the selected time range
  const { data: performanceData, isLoading, error } = useQuery({
    queryKey: ['franchisePerformance', franchiseId, territoryId, timeRange],
    queryFn: async () => {
      console.log(`Fetching franchise performance data for ${timeRange} days, franchiseId: ${franchiseId}, territoryId: ${territoryId}`);
      
      // In a real implementation, this would fetch from the franchise_performance table
      // Since that table might not exist yet, we'll use mock data for now
      
      // If no data is returned or the table doesn't exist yet, use mock data
      console.log("Using mock performance data");
      return generateMockData(parseInt(timeRange));
    },
    refetchOnWindowFocus: false,
  });

  return (
    <ErrorBoundary>
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <CardTitle>Franchise Performance Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState message="Loading performance metrics..." />
          ) : error ? (
            <div className="p-4 border border-red-200 rounded-md">
              <h3 className="text-red-800 font-medium">Error loading performance data</h3>
              <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'Unknown error'}</p>
            </div>
          ) : performanceData ? (
            <PerformanceOverview 
              performanceData={performanceData} 
              timeRange={timeRange} 
              setTimeRange={setTimeRange} 
            />
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No performance data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </ErrorBoundary>
  );
};

export default FranchisePerformanceView;
