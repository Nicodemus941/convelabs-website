
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useFranchisePerformance, PerformanceData } from '@/hooks/franchise/useFranchisePerformance';
import { useQuery } from '@tanstack/react-query';
import LoadingState from '@/components/ui/loading-state';
import { formatCurrency } from '@/utils/formatters';

interface CrossTerritoryAnalyticsProps {
  config?: {
    theme?: string;
    animate?: boolean;
    showLegend?: boolean;
    allowZoom?: boolean;
  };
}

const CrossTerritoryAnalytics: React.FC<CrossTerritoryAnalyticsProps> = ({ config }) => {
  const [timeRange, setTimeRange] = useState<'30' | '90' | '180' | '365'>('30');
  const { fetchPerformanceData } = useFranchisePerformance();
  const [territories, setTerritories] = useState([
    { id: '1', name: 'Northern California' },
    { id: '2', name: 'Southern California' },
    { id: '3', name: 'Arizona' },
  ]);

  // Fetch performance data for all territories
  const { data: performanceData, isLoading } = useQuery({
    queryKey: ['territoryComparison', timeRange],
    queryFn: async () => {
      // In a real app, we would fetch data for all territories
      // Here we'll create mock data for each territory
      const results: Record<string, PerformanceData[]> = {};
      for (const territory of territories) {
        const data = await fetchPerformanceData({
          territoryId: territory.id,
          days: parseInt(timeRange)
        });
        results[territory.id] = data;
      }
      return results;
    },
  });

  // Process data for comparison chart
  const getComparisonChartData = () => {
    if (!performanceData) return [];
    
    // Create comparison metrics based on total sums
    const comparisonData = territories.map((territory) => {
      const territoryData = performanceData[territory.id] || [];
      
      // Sum up metrics
      const totalRevenue = territoryData.reduce(
        (sum, day) => sum + day.revenue,
        0
      );
      const totalServices = territoryData.reduce(
        (sum, day) => sum + day.services_count,
        0
      );
      const totalNewClients = territoryData.reduce(
        (sum, day) => sum + day.new_clients,
        0
      );
      const avgRetention = territoryData.length
        ? territoryData.reduce(
            (sum, day) => sum + day.client_retention_rate,
            0
          ) / territoryData.length
        : 0;

      return {
        territory: territory.name,
        revenue: totalRevenue,
        services: totalServices,
        newClients: totalNewClients,
        retention: avgRetention,
      };
    });

    return comparisonData;
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Territory Comparison</CardTitle>
        <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
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
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingState message="Loading comparison data..." />
        ) : (
          <div className="grid gap-6">
            {/* Revenue Comparison */}
            <div className="h-[300px]">
              <h3 className="font-semibold mb-2">Revenue</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getComparisonChartData()} layout="vertical">
                  <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
                  <YAxis dataKey="territory" type="category" width={100} />
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Services Comparison */}
            <div className="h-[300px]">
              <h3 className="font-semibold mb-2">Services Performed</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getComparisonChartData()} layout="vertical">
                  <XAxis type="number" />
                  <YAxis dataKey="territory" type="category" width={100} />
                  <Tooltip />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Bar dataKey="services" fill="#82ca9d" name="Services" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* New Clients Comparison */}
            <div className="h-[300px]">
              <h3 className="font-semibold mb-2">New Clients</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getComparisonChartData()} layout="vertical">
                  <XAxis type="number" />
                  <YAxis dataKey="territory" type="category" width={100} />
                  <Tooltip />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Bar dataKey="newClients" fill="#ffc658" name="New Clients" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Retention Rate Comparison */}
            <div className="h-[300px]">
              <h3 className="font-semibold mb-2">Client Retention Rate (%)</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getComparisonChartData()} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="territory" type="category" width={100} />
                  <Tooltip formatter={(value) => {
                    // Fix: Type cast to number before using toFixed
                    const numValue = Number(value);
                    return `${numValue.toFixed(1)}%`;
                  }} />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Bar dataKey="retention" fill="#ff7300" name="Retention Rate" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CrossTerritoryAnalytics;
