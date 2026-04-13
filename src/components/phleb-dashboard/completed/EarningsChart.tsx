import React, { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { PhlebAppointment } from '@/hooks/usePhlebotomistAppointments';

interface EarningsChartProps {
  appointments: PhlebAppointment[];
}

const EarningsChart: React.FC<EarningsChartProps> = ({ appointments }) => {
  const dailyData = useMemo(() => {
    const days: { label: string; date: string; earnings: number; tips: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayAppts = appointments.filter(a => a.appointment_date === dateStr && a.status === 'completed');
      days.push({
        label: format(d, 'EEE'),
        date: dateStr,
        earnings: dayAppts.reduce((s, a) => s + (a.total_amount || 0), 0),
        tips: dayAppts.reduce((s, a) => s + (a.tip_amount || 0), 0),
      });
    }
    return days;
  }, [appointments]);

  const maxVal = Math.max(...dailyData.map(d => d.earnings + d.tips), 1);
  const totalEarnings = dailyData.reduce((s, d) => s + d.earnings, 0);
  const totalTips = dailyData.reduce((s, d) => s + d.tips, 0);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Last 7 Days</p>
          <p className="text-xl font-bold text-gray-900">${totalEarnings.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Tips</p>
          <p className="text-lg font-bold text-emerald-600">+${totalTips.toFixed(2)}</p>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="flex items-end gap-1.5 h-28">
        {dailyData.map((day) => {
          const earningsHeight = maxVal > 0 ? (day.earnings / maxVal) * 100 : 0;
          const tipsHeight = maxVal > 0 ? (day.tips / maxVal) * 100 : 0;
          const totalHeight = earningsHeight + tipsHeight;

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                {totalHeight > 0 ? (
                  <div className="w-full rounded-t-md overflow-hidden">
                    {tipsHeight > 0 && (
                      <div
                        className="w-full bg-emerald-400"
                        style={{ height: `${(tipsHeight / (earningsHeight + tipsHeight)) * totalHeight * 0.8}px` }}
                      />
                    )}
                    <div
                      className="w-full bg-[#B91C1C]"
                      style={{ height: `${(earningsHeight / (earningsHeight + tipsHeight)) * totalHeight * 0.8}px`, minHeight: totalHeight > 0 ? '4px' : '0' }}
                    />
                  </div>
                ) : (
                  <div className="w-full bg-gray-100 rounded-t-md" style={{ height: '4px' }} />
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">{day.label}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#B91C1C]" />
          <span className="text-[10px] text-muted-foreground">Earnings</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
          <span className="text-[10px] text-muted-foreground">Tips</span>
        </div>
      </div>
    </div>
  );
};

export default EarningsChart;
