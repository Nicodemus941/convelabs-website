import React from 'react';
import {
  startOfWeek,
  addDays,
  format,
  isToday,
  isSameDay,
  subWeeks,
  addWeeks,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface WeekStripProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  weekStart: Date;
  onWeekChange: (newStart: Date) => void;
  appointmentDates: Set<string>;
}

const WeekStrip: React.FC<WeekStripProps> = ({
  selectedDate,
  onDateSelect,
  weekStart,
  onWeekChange,
  appointmentDates,
}) => {
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="bg-white rounded-xl shadow-sm border p-3">
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          onClick={() => onWeekChange(subWeeks(weekStart, 1))}
          className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            {format(weekDays[0], 'MMM d')} - {format(weekDays[6], 'MMM d, yyyy')}
          </span>
          {!weekDays.some(d => isToday(d)) && (
            <button
              onClick={() => {
                const todayWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
                onWeekChange(todayWeekStart);
                onDateSelect(new Date());
              }}
              className="text-[10px] font-medium text-[#B91C1C] bg-red-50 px-2 py-0.5 rounded-full hover:bg-red-100"
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={() => onWeekChange(addWeeks(weekStart, 1))}
          className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDate = isToday(day);
          const hasAppointments = appointmentDates.has(dateStr);

          return (
            <button
              key={dateStr}
              onClick={() => onDateSelect(day)}
              className={`flex flex-col items-center py-2 rounded-xl transition-all ${
                isSelected
                  ? 'bg-[#B91C1C] text-white shadow-md'
                  : isTodayDate
                  ? 'bg-red-50 text-[#B91C1C]'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className={`text-[10px] font-medium uppercase ${isSelected ? 'text-red-200' : 'text-gray-400'}`}>
                {format(day, 'EEE')}
              </span>
              <span className={`text-lg font-bold leading-tight ${isSelected ? 'text-white' : ''}`}>
                {format(day, 'd')}
              </span>
              {/* Appointment dot */}
              {hasAppointments && (
                <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                  isSelected ? 'bg-white' : 'bg-[#B91C1C]'
                }`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default WeekStrip;
