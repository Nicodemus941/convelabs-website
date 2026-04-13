import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface RevenueChartProps {
  data: { label: string; revenue: number; tips: number }[];
}

const RevenueChart: React.FC<RevenueChartProps> = ({ data }) => {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">No revenue data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === 'revenue' ? 'Revenue' : 'Tips']}
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
        />
        <Bar dataKey="revenue" fill="#B91C1C" radius={[4, 4, 0, 0]} name="Revenue" />
        <Bar dataKey="tips" fill="#D4AF37" radius={[4, 4, 0, 0]} name="Tips" />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default RevenueChart;
