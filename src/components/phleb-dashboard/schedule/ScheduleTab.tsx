import React, { useState, useEffect, useMemo } from 'react';
import { startOfWeek, format, isToday, parseISO } from 'date-fns';
import { Calendar, Loader2, RefreshCw, DollarSign, Clock, MapPin, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PhlebAppointment, AppointmentStatus } from '@/hooks/usePhlebotomistAppointments';
import WeekStrip from './WeekStrip';
import PhlebAppointmentCard from './PhlebAppointmentCard';
import { CheckCircle2 } from 'lucide-react';

interface ScheduleTabProps {
  appointments: PhlebAppointment[];
  isLoading: boolean;
  monthDates: Set<string>;
  onRefresh: () => void;
  onStatusUpdate: (id: string, status: AppointmentStatus) => Promise<boolean>;
  isOnline?: boolean;
  lastCacheAt?: number | null;
}

const ScheduleTab: React.FC<ScheduleTabProps> = ({
  appointments,
  isLoading,
  monthDates,
  onRefresh,
  onStatusUpdate,
  isOnline = true,
  lastCacheAt = null,
}) => {
  const [selectedDate, setSelectedDate] = useState(() => {
    const saved = sessionStorage.getItem('phleb-selected-date');
    if (saved) {
      try { return parseISO(saved); } catch { /* fall through */ }
    }
    return new Date();
  });
  const [weekStart, setWeekStart] = useState(() => startOfWeek(selectedDate, { weekStartsOn: 1 }));
  const [expandedCard, setExpandedCard] = useState<string | null>(() => {
    return sessionStorage.getItem('phleb-expanded-card') || null;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Persist navigation state so it survives PWA background/reload
  useEffect(() => {
    sessionStorage.setItem('phleb-selected-date', format(selectedDate, 'yyyy-MM-dd'));
  }, [selectedDate]);

  useEffect(() => {
    sessionStorage.setItem('phleb-expanded-card', expandedCard || '');
  }, [expandedCard]);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  const dayAppointments = useMemo(() => {
    return appointments.filter(a => a.appointment_date === selectedDateStr && a.status !== 'cancelled');
  }, [appointments, selectedDateStr]);

  const activeAppts = dayAppointments.filter(a => a.status !== 'completed')
    .sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''));
  const completedAppts = dayAppointments.filter(a => a.status === 'completed')
    .sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''));

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  const dayLabel = isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, MMM d');

  // Today summary stats
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayAppts = appointments.filter(a => a.appointment_date === todayStr && a.status !== 'cancelled');
  const todayCompleted = todayAppts.filter(a => a.status === 'completed');
  const todayRemaining = todayAppts.filter(a => !['completed', 'cancelled'].includes(a.status));
  const todayEarnings = todayCompleted.reduce((s, a) => s + (a.total_amount || 0), 0);
  const todayTips = todayCompleted.reduce((s, a) => s + (a.tip_amount || 0), 0);
  const nextAppt = todayRemaining.sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''))[0];

  return (
    <div className="space-y-4">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <WifiOff className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Offline — showing cached schedule</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {lastCacheAt
                ? `Last sync: ${Math.round((Date.now() - lastCacheAt) / 60_000)} min ago`
                : 'Cache is local to this device'}
              . Status updates will queue and retry when signal returns.
            </p>
          </div>
        </div>
      )}

      {/* Today Summary Banner */}
      {isToday(selectedDate) && todayAppts.length > 0 && (
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-400">Today's Overview</p>
            <span className="text-xs text-gray-500">{format(new Date(), 'EEEE, MMM d')}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold">{todayCompleted.length}/{todayAppts.length}</p>
              <p className="text-[10px] text-gray-400">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-400">${todayEarnings}</p>
              <p className="text-[10px] text-gray-400">Earned{todayTips > 0 ? ` (+$${todayTips} tips)` : ''}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-400">{todayRemaining.length}</p>
              <p className="text-[10px] text-gray-400">Remaining</p>
            </div>
          </div>
          {nextAppt && (
            <div className="mt-3 pt-3 border-t border-gray-700 flex items-center gap-2 text-sm">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-gray-300">Next: <span className="text-white font-medium">{nextAppt.patient_name}</span> at {nextAppt.appointment_time}</span>
            </div>
          )}
        </div>
      )}

      {/* Week Strip */}
      <WeekStrip
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        appointmentDates={monthDates}
      />

      {/* Day Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[#B91C1C]" />
          <h2 className="text-lg font-bold">
            {activeAppts.length} Appointment{activeAppts.length !== 1 ? 's' : ''} {dayLabel}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-muted-foreground hover:text-[#B91C1C]"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C] mb-3" />
          <p className="text-sm text-muted-foreground">Loading appointments...</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && dayAppointments.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-dashed p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
            <Calendar className="h-7 w-7 text-[#B91C1C]" />
          </div>
          <h3 className="font-semibold text-gray-800 mb-1">No appointments</h3>
          <p className="text-sm text-muted-foreground">
            {isToday(selectedDate) ? 'Nothing scheduled for today.' : `Nothing scheduled for ${format(selectedDate, 'MMMM d')}.`}
          </p>
        </div>
      )}

      {/* Active Appointments */}
      {!isLoading && activeAppts.map((appt) => (
        <PhlebAppointmentCard
          key={appt.id}
          appointment={appt}
          onStatusUpdate={onStatusUpdate}
          isExpanded={expandedCard === appt.id}
          onToggle={() => setExpandedCard(expandedCard === appt.id ? null : appt.id)}
        />
      ))}

      {/* Completed */}
      {!isLoading && completedAppts.length > 0 && (
        <div className="pt-2">
          <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Completed ({completedAppts.length})
          </p>
          {completedAppts.map((appt) => (
            <div key={appt.id} className="bg-white rounded-xl shadow-sm border border-l-4 border-l-gray-300 opacity-70 p-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-700 text-sm truncate">{appt.patient_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {appt.appointment_time || ''} - {appt.address}
                  </p>
                </div>
                {appt.tip_amount > 0 && (
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                    +${appt.tip_amount.toFixed(2)} tip
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScheduleTab;
