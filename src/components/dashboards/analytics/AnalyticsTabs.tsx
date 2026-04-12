
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import KpiCards from './KpiCards';
import RevenueMetricsCard from './RevenueMetricsCard';
import MembershipInsightsCard from './MembershipInsightsCard';
import TrafficAnalyticsCard from './TrafficAnalyticsCard';
import LocationAnalyticsCard from './LocationAnalyticsCard';

type TimeRange = 7 | 30 | 90;

const AnalyticsTabs: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>(30);

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
        <Select value={timeRange.toString()} onValueChange={(value) => setTimeRange(Number(value) as TimeRange)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Overview */}
      <KpiCards timeRange={timeRange} />

      {/* Detailed Analytics Tabs */}
      <Tabs defaultValue="traffic" className="space-y-4">
        <TabsList>
          <TabsTrigger value="traffic">Traffic</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="membership">Membership</TabsTrigger>
        </TabsList>

        <TabsContent value="traffic" className="space-y-4">
          <TrafficAnalyticsCard timeRange={timeRange} />
        </TabsContent>

        <TabsContent value="location" className="space-y-4">
          <LocationAnalyticsCard timeRange={timeRange} />
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <RevenueMetricsCard timeRange={timeRange} />
        </TabsContent>

        <TabsContent value="membership" className="space-y-4">
          <MembershipInsightsCard timeRange={timeRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsTabs;
