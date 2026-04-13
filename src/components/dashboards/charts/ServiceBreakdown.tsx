import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ServiceBreakdownProps {
  data: { name: string; value: number; color: string }[];
}

const ServiceBreakdown: React.FC<ServiceBreakdownProps> = ({ data }) => {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">No service data.</p>;
  }

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={35}
            outerRadius={60}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => [value, 'Appointments']} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5 flex-1">
        {data.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-gray-600 capitalize">{item.name.replace(/_|-/g, ' ')}</span>
            </div>
            <span className="font-semibold text-gray-800">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ServiceBreakdown;
