
import React from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Territory } from "@/hooks/useFranchiseData";

interface TerritoryGrowthChartProps {
  territories: Territory[];
}

const TerritoryGrowthChart: React.FC<TerritoryGrowthChartProps> = ({ territories }) => {
  // Process territories to create growth data
  const processGrowthData = () => {
    // Group territories by creation date (month)
    const territoryCountsByMonth: Record<string, number> = {};
    const territoryCountsByState: Record<string, number> = {};
    
    // Sort territories by created_at date
    const sortedTerritories = [...territories].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    sortedTerritories.forEach(territory => {
      // Format date to YYYY-MM
      const date = new Date(territory.created_at);
      const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      // Count territories by month
      if (!territoryCountsByMonth[monthYear]) {
        territoryCountsByMonth[monthYear] = 0;
      }
      territoryCountsByMonth[monthYear]++;
      
      // Count territories by state
      if (!territoryCountsByState[territory.state]) {
        territoryCountsByState[territory.state] = 0;
      }
      territoryCountsByState[territory.state]++;
    });
    
    // Convert to array for chart data
    const growthData = Object.keys(territoryCountsByMonth).map(month => ({
      month,
      count: territoryCountsByMonth[month],
      total: Object.keys(territoryCountsByMonth)
        .filter(m => m <= month)
        .reduce((sum, m) => sum + territoryCountsByMonth[m], 0)
    }));
    
    // Convert state data to array
    const stateData = Object.keys(territoryCountsByState).map(state => ({
      state,
      count: territoryCountsByState[state]
    })).sort((a, b) => b.count - a.count); // Sort by count descending
    
    return { growthData, stateData };
  };
  
  // Use demo data if no territories are provided
  const getDemoGrowthData = () => {
    return {
      growthData: [
        { month: '2023-01', count: 3, total: 3 },
        { month: '2023-02', count: 5, total: 8 },
        { month: '2023-03', count: 7, total: 15 },
        { month: '2023-04', count: 4, total: 19 },
        { month: '2023-05', count: 6, total: 25 },
        { month: '2023-06', count: 8, total: 33 },
        { month: '2023-07', count: 10, total: 43 },
        { month: '2023-08', count: 12, total: 55 },
      ],
      stateData: [
        { state: 'California', count: 12 },
        { state: 'Texas', count: 8 },
        { state: 'Florida', count: 7 },
        { state: 'New York', count: 6 },
        { state: 'Illinois', count: 5 },
      ]
    };
  };
  
  const { growthData, stateData } = territories.length > 0 
    ? processGrowthData() 
    : getDemoGrowthData();
  
  // Format month for display
  const formatMonth = (month: string) => {
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    return date.toLocaleString('default', { month: 'short', year: '2-digit' });
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Territory Growth Analytics</CardTitle>
        <CardDescription>
          Tracking territory expansion across regions and over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="growth">
          <TabsList className="mb-6">
            <TabsTrigger value="growth">Monthly Growth</TabsTrigger>
            <TabsTrigger value="cumulative">Cumulative Growth</TabsTrigger>
            <TabsTrigger value="state">State Distribution</TabsTrigger>
          </TabsList>
          
          <TabsContent value="growth" className="h-[350px]">
            <ChartContainer config={{
              count: { theme: { dark: "#f97316", light: "#f97316" } }
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={growthData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="month" 
                    tickFormatter={formatMonth}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="count" name="New Territories" fill="var(--color-count)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </TabsContent>
          
          <TabsContent value="cumulative" className="h-[350px]">
            <ChartContainer config={{
              total: { theme: { dark: "#06b6d4", light: "#06b6d4" } }
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={growthData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="month" 
                    tickFormatter={formatMonth}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="total" 
                    name="Total Territories" 
                    stroke="var(--color-total)" 
                    strokeWidth={2} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </TabsContent>
          
          <TabsContent value="state" className="h-[350px]">
            <ChartContainer config={{
              count: { theme: { dark: "#84cc16", light: "#84cc16" } }
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={stateData}
                  margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis 
                    type="category" 
                    dataKey="state" 
                    width={80}
                  />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="count" name="Territories" fill="var(--color-count)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default TerritoryGrowthChart;
