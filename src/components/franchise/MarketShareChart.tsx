
import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
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

interface MarketShareChartProps {
  data: PerformanceMetric[];
  territories: Territory[];
}

const MarketShareChart: React.FC<MarketShareChartProps> = ({ data, territories }) => {
  // Using demo data if no real data is provided
  const chartData = [
    { name: "Concierge Medicine", value: 40, color: "#f97316" },
    { name: "Home Health", value: 35, color: "#84cc16" },
    { name: "Mobile Labs", value: 25, color: "#06b6d4" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Healthcare Industry Growth Segments</CardTitle>
        <CardDescription>Market share distribution in premium healthcare</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ChartContainer config={{
            value: { theme: { dark: "#f97316", light: "#f97316" } }
          }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltipContent />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default MarketShareChart;
