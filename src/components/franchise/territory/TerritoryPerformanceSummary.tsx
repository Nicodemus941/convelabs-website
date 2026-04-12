
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Users, CalendarDays } from "lucide-react";
import { PerformanceData } from "@/hooks/franchise/useFranchisePerformance";

interface TerritoryPerformanceSummaryProps {
  performanceData: PerformanceData[];
  showTrends?: boolean;
}

const TerritoryPerformanceSummary: React.FC<TerritoryPerformanceSummaryProps> = ({
  performanceData,
  showTrends = true
}) => {
  // Calculate summary metrics
  const chartData = performanceData?.map(item => ({
    date: new Date(item.date).toLocaleDateString(),
    revenue: item.revenue / 100, // Convert cents to dollars
    clients: item.new_clients,
    services: item.services_count,
    retention: item.client_retention_rate || 0
  })) || [];
  
  const totalRevenue = chartData.reduce((sum, item) => sum + item.revenue, 0);
  const totalClients = chartData.reduce((sum, item) => sum + item.clients, 0);
  const totalServices = chartData.reduce((sum, item) => sum + item.services, 0);
  const avgRetention = chartData.length > 0 
    ? chartData.reduce((sum, item) => sum + item.retention, 0) / chartData.length 
    : 0;

  // Get growth rates by comparing first and last periods
  const calculateGrowth = (data: any[], key: string) => {
    if (data.length < 2) return 0;
    const first = data[0][key];
    const last = data[data.length - 1][key];
    return first === 0 ? 100 : ((last - first) / first) * 100;
  };
  
  const revenueGrowth = calculateGrowth(chartData, 'revenue');
  const clientsGrowth = calculateGrowth(chartData, 'clients');
  const servicesGrowth = calculateGrowth(chartData, 'services');
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="p-4 flex flex-col">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            <DollarSign className="h-4 w-4 text-green-500" />
          </div>
          <div className="flex justify-between items-end mt-2">
            <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
            {showTrends && (
              <span className={`text-xs px-2 py-1 rounded-full ${revenueGrowth >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth.toFixed(1)}%
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex flex-col">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">New Clients</p>
            <Users className="h-4 w-4 text-blue-500" />
          </div>
          <div className="flex justify-between items-end mt-2">
            <p className="text-2xl font-bold">{totalClients}</p>
            {showTrends && (
              <span className={`text-xs px-2 py-1 rounded-full ${clientsGrowth >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {clientsGrowth >= 0 ? '+' : ''}{clientsGrowth.toFixed(1)}%
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex flex-col">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Services Completed</p>
            <CalendarDays className="h-4 w-4 text-purple-500" />
          </div>
          <div className="flex justify-between items-end mt-2">
            <p className="text-2xl font-bold">{totalServices}</p>
            {showTrends && (
              <span className={`text-xs px-2 py-1 rounded-full ${servicesGrowth >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {servicesGrowth >= 0 ? '+' : ''}{servicesGrowth.toFixed(1)}%
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex flex-col">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Client Retention</p>
            {avgRetention >= 50 ? 
              <TrendingUp className="h-4 w-4 text-amber-500" /> : 
              <TrendingDown className="h-4 w-4 text-red-500" />
            }
          </div>
          <div className="flex justify-between items-end mt-2">
            <p className="text-2xl font-bold">{avgRetention.toFixed(1)}%</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TerritoryPerformanceSummary;
