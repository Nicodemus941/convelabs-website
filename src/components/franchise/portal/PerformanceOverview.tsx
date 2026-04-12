
import React from 'react';
import { Card } from '@/components/ui/card';
import { PerformanceData } from '@/hooks/franchise/useFranchisePerformance';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { formatCurrency } from '@/utils/formatters';

interface PerformanceOverviewProps {
  performanceData: PerformanceData[];
  timeRange: '30' | '90' | '180' | '365';
  setTimeRange: (range: '30' | '90' | '180' | '365') => void;
}

const PerformanceOverview: React.FC<PerformanceOverviewProps> = ({ 
  performanceData, 
  timeRange, 
  setTimeRange 
}) => {
  // Calculate totals and averages
  const totalRevenue = performanceData.reduce((sum, day) => sum + day.revenue, 0);
  const totalServices = performanceData.reduce((sum, day) => sum + day.services_count, 0);
  const totalNewClients = performanceData.reduce((sum, day) => sum + day.new_clients, 0);
  const avgRetention = performanceData.length 
    ? performanceData.reduce((sum, day) => sum + day.client_retention_rate, 0) / performanceData.length 
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Revenue</h3>
          <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Services</h3>
          <p className="text-2xl font-bold">{totalServices}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground">New Clients</h3>
          <p className="text-2xl font-bold">{totalNewClients}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Retention Rate</h3>
          <p className="text-2xl font-bold">{avgRetention.toFixed(1)}%</p>
        </Card>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={performanceData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={(date) => {
                const d = new Date(date);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }} 
            />
            <YAxis yAxisId="left" tickFormatter={(value) => formatCurrency(value)} />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip 
              formatter={(value, name) => {
                if (name === 'revenue') {
                  return [formatCurrency(value as number), 'Revenue'];
                } else if (name === 'new_clients') {
                  return [value, 'New Clients'];
                }
                return [value, name];
              }} 
              labelFormatter={(label) => {
                const d = new Date(label);
                return d.toLocaleDateString();
              }}
            />
            <Legend />
            <Area yAxisId="left" type="monotone" dataKey="revenue" fill="#8884d8" stroke="#8884d8" name="Revenue" />
            <Area yAxisId="right" type="monotone" dataKey="new_clients" fill="#82ca9d" stroke="#82ca9d" name="New Clients" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PerformanceOverview;
