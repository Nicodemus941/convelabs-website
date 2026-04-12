
import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

interface Territory {
  id: string;
  name: string;
  state: string;
  city?: string;
}

interface PerformanceMetric {
  territory_id: string;
  territory_name: string;
  month: string;
  revenue: number;
  services: number;
  growth_rate: number;
}

interface RevenueProjectionChartProps {
  data: PerformanceMetric[];
  territories: Territory[];
}

const RevenueProjectionChart: React.FC<RevenueProjectionChartProps> = ({ data, territories }) => {
  // Using demo data if no real data is provided
  const chartData = [
    { name: "Year 1", revenue: 60000, profit: 23400 },
    { name: "Year 2", revenue: 120000, profit: 54600 },
    { name: "Year 3", revenue: 180000, profit: 93600 },
    { name: "Year 4", revenue: 240000, profit: 124800 },
    { name: "Year 5", revenue: 300000, profit: 175500 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">5-Year Financial Projection</CardTitle>
        <CardDescription>Estimated revenue and profit for ConveLabs franchisees</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ChartContainer config={{
            revenue: { theme: { dark: "#f97316", light: "#f97316" } },
            profit: { theme: { dark: "#84cc16", light: "#84cc16" } }
          }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis 
                  tickFormatter={(value) => `$${value/1000}K`}
                  width={60}
                />
                <Tooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="var(--color-revenue)" />
                <Bar dataKey="profit" name="Profit" fill="var(--color-profit)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default RevenueProjectionChart;
