
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMembershipAnalytics } from '@/hooks/useAdminAnalytics';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface MembershipInsightsCardProps {
  timeRange: 7 | 30 | 90;
}

const COLORS = ['#f97316', '#84cc16', '#06b6d4', '#8b5cf6', '#ec4899'];

const MembershipInsightsCard: React.FC<MembershipInsightsCardProps> = ({ timeRange }) => {
  const { membershipData, isLoading, error } = useMembershipAnalytics(timeRange);
  
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Membership Insights</CardTitle>
          <CardDescription>Membership distribution and activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-md bg-red-50">
            <p className="text-red-500">Error loading membership data: {error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Membership Insights</CardTitle>
          <CardDescription>Membership distribution and activity</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }
  
  // Calculate plan distribution
  const planDistribution = membershipData?.reduce((acc, item) => {
    const planId = item.plan_id;
    acc[planId] = (acc[planId] || 0) + 1;
    return acc;
  }, {});
  
  const planChartData = Object.entries(planDistribution || {}).map(([id, count], index) => ({
    id,
    value: count as number,
    name: `Plan ${index + 1}`, // We would need to fetch plan names separately
    color: COLORS[index % COLORS.length]
  }));
  
  // Calculate active vs inactive members
  const activeMembers = membershipData?.filter(m => m.status === 'active').length || 0;
  const inactiveMembers = (membershipData?.length || 0) - activeMembers;
  
  const statusChartData = [
    { name: 'Active', value: activeMembers, color: '#84cc16' },
    { name: 'Inactive', value: inactiveMembers, color: '#f97316' }
  ];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Membership Insights</CardTitle>
        <CardDescription>Membership distribution and activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/20 p-4 rounded-md">
              <h4 className="text-sm text-muted-foreground mb-1">Active Members</h4>
              <p className="text-2xl font-bold">{activeMembers}</p>
            </div>
            <div className="bg-muted/20 p-4 rounded-md">
              <h4 className="text-sm text-muted-foreground mb-1">New Members</h4>
              <p className="text-2xl font-bold">
                {membershipData?.filter(m => 
                  new Date(m.created_at) > new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000)
                ).length || 0}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Membership Plan Distribution */}
            <div>
              <h4 className="text-sm font-medium mb-3">Plan Distribution</h4>
              <div className="h-[250px]">
                <ChartContainer config={{
                  value: { theme: { dark: '#f97316', light: '#f97316' } },
                }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={planChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {planChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </div>
            
            {/* Membership Status Distribution */}
            <div>
              <h4 className="text-sm font-medium mb-3">Membership Status</h4>
              <div className="h-[250px]">
                <ChartContainer config={{
                  value: { theme: { dark: '#f97316', light: '#f97316' } },
                }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {statusChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MembershipInsightsCard;
