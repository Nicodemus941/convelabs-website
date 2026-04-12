
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import CampaignHistoryTable from './CampaignHistoryTable';
import { DateRange } from 'react-day-picker';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { format, subMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

// Define a proper type for the metadata object structure
interface EmailMetadata {
  campaign?: boolean;
  campaign_id?: string;
  template_name?: string;
  test_mode?: boolean;
}

interface CampaignStatistics {
  totalCampaigns: number;
  totalRecipients: number;
  averageDeliveryRate: number;
  weeklyData: Array<{
    week: string;
    campaigns: number;
    recipients: number;
  }>;
  deliveryStats: Array<{
    name: string;
    value: number;
  }>;
}

export default function CampaignAnalyticsDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subMonths(new Date(), 3),
    to: new Date()
  });

  const { data: statistics, isLoading, refetch } = useQuery({
    queryKey: ['campaignStatistics', dateRange],
    queryFn: async (): Promise<CampaignStatistics> => {
      let query = supabase
        .from('email_logs')
        .select('*')
        .filter('metadata->campaign', 'eq', true);
      
      if (dateRange?.from) {
        query = query.gte('sent_at', dateRange.from.toISOString());
      }
      
      if (dateRange?.to) {
        // Add a day to include the entire end date
        const toDate = new Date(dateRange.to);
        toDate.setDate(toDate.getDate() + 1);
        query = query.lt('sent_at', toDate.toISOString());
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // This is simplified mock data processing
      // In production, this would be handled by a more robust backend query
      
      // Process data for charts
      const weekMap = new Map();
      const now = new Date();
      
      if (data && data.length > 0) {
        // Group by week for chart data
        data.forEach(log => {
          const sentDate = new Date(log.sent_at);
          const weekKey = format(sentDate, 'MMM d');
          
          if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, { week: weekKey, campaigns: 0, recipients: 0 });
          }
          
          const weekData = weekMap.get(weekKey);
          
          // Count unique campaigns using metadata->campaign_id
          const metadata = log.metadata as unknown as EmailMetadata;
          const campaignId = metadata?.campaign_id || log.sent_at;
          
          // Check if this is a new campaign for this week
          if (!weekData.campaignIds) {
            weekData.campaignIds = new Set();
          }
          
          if (!weekData.campaignIds.has(campaignId)) {
            weekData.campaigns += 1;
            weekData.campaignIds.add(campaignId);
          }
          
          weekData.recipients += 1;
        });
      }
      
      // Create weekly data array from the map
      const weeklyData = Array.from(weekMap.values())
        .map(({ week, campaigns, recipients }) => ({ week, campaigns, recipients }))
        .sort((a, b) => a.week.localeCompare(b.week))
        .slice(-5); // Get last 5 weeks
      
      // Create delivery stats
      const delivered = data.filter(log => log.status === 'sent').length;
      const failed = data.filter(log => log.status === 'failed').length;
      const total = delivered + failed;
      
      const deliveryStats = [
        { name: 'Delivered', value: delivered },
        { name: 'Failed', value: failed },
      ];

      // Get unique campaign count by inspecting metadata
      const uniqueCampaignIds = new Set();
      data.forEach(log => {
        const metadata = log.metadata as unknown as EmailMetadata;
        if (metadata && metadata.campaign_id) {
          uniqueCampaignIds.add(metadata.campaign_id);
        } else {
          // If no campaign_id is available, use sent_at as fallback identifier
          uniqueCampaignIds.add(log.sent_at);
        }
      });
      
      return {
        totalCampaigns: uniqueCampaignIds.size,
        totalRecipients: data.length,
        averageDeliveryRate: total > 0 ? (delivered / total) * 100 : 100,
        weeklyData,
        deliveryStats
      };
    },
    // In production, real data would be queried
    placeholderData: {
      totalCampaigns: 12,
      totalRecipients: 568,
      averageDeliveryRate: 98.2,
      weeklyData: [
        { week: 'May 1', campaigns: 2, recipients: 45 },
        { week: 'May 8', campaigns: 1, recipients: 32 },
        { week: 'May 15', campaigns: 3, recipients: 87 },
        { week: 'May 22', campaigns: 2, recipients: 64 },
        { week: 'May 29', campaigns: 4, recipients: 102 }
      ],
      deliveryStats: [
        { name: 'Delivered', value: 558 },
        { name: 'Failed', value: 10 }
      ]
    }
  });

  const COLORS = ['#4ade80', '#f87171'];

  return (
    <Tabs defaultValue="dashboard" className="space-y-6">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="history">Campaign History</TabsTrigger>
      </TabsList>
      
      <TabsContent value="dashboard" className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2">
            <DatePickerWithRange 
              className=""
              date={dateRange} 
              setDate={setDateRange} 
            />
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            className="gap-2"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
        
        {statistics && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Campaigns
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statistics.totalCampaigns}</div>
                  <p className="text-xs text-muted-foreground">
                    Marketing campaigns sent
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Recipients
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statistics.totalRecipients}</div>
                  <p className="text-xs text-muted-foreground">
                    Emails sent to recipients
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Delivery Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {statistics.averageDeliveryRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average delivery success
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Activity</CardTitle>
                  <CardDescription>
                    Campaign activity for {dateRange?.from && dateRange?.to ? 
                      `${format(dateRange.from, 'MMM d, yyyy')} - ${format(dateRange.to, 'MMM d, yyyy')}` : 
                      'recent period'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={statistics.weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" />
                      <YAxis yAxisId="left" orientation="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="campaigns" name="Campaigns" fill="#8884d8" />
                      <Bar yAxisId="right" dataKey="recipients" name="Recipients" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Delivery Statistics</CardTitle>
                  <CardDescription>
                    Email delivery success rate
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statistics.deliveryStats}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                        label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {statistics.deliveryStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </TabsContent>
      
      <TabsContent value="history">
        <Card>
          <CardHeader>
            <CardTitle>Campaign History</CardTitle>
            <CardDescription>
              A list of all marketing campaigns sent
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CampaignHistoryTable />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
