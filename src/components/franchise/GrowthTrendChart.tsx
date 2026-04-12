
import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
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

interface GrowthTrendChartProps {
  data: PerformanceMetric[];
  territories: Territory[];
}

const GrowthTrendChart: React.FC<GrowthTrendChartProps> = ({ data, territories }) => {
  // Using demo data if no real data is provided
  const chartData = data.length > 0 ? data : [
    { year: "2020", concierge: 5.2, mobile: 3.8, standard: 2.1 },
    { year: "2021", concierge: 6.5, mobile: 4.9, standard: 2.0 },
    { year: "2022", concierge: 7.8, mobile: 6.3, standard: 1.9 },
    { year: "2023", concierge: 9.2, mobile: 7.8, standard: 1.8 },
    { year: "2024", concierge: 10.5, mobile: 9.8, standard: 1.7 },
    { year: "2025", concierge: 12.1, mobile: 11.5, standard: 1.6 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Industry Growth Trends</CardTitle>
        <CardDescription>Annual growth rates by healthcare segment</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ChartContainer config={{
            concierge: { theme: { dark: "#f97316", light: "#f97316" } },
            mobile: { theme: { dark: "#06b6d4", light: "#06b6d4" } },
            standard: { theme: { dark: "#d1d5db", light: "#d1d5db" } },
          }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis 
                  tickFormatter={(value) => `${value}%`}
                  width={40}
                />
                <Tooltip content={<ChartTooltipContent />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="concierge"
                  name="Concierge Medicine"
                  stroke="var(--color-concierge)"
                  activeDot={{ r: 8 }}
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="mobile" 
                  name="Mobile Healthcare" 
                  stroke="var(--color-mobile)" 
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="standard" 
                  name="Standard Practice" 
                  stroke="var(--color-standard)" 
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default GrowthTrendChart;
