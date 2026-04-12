import React, { useEffect, useState, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Plus, RefreshCw, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AppointmentDetailModal from './AppointmentDetailModal';
import ScheduleAppointmentModal from './ScheduleAppointmentModal';
import './calendar-styles.css';

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6',
  confirmed: '#22c55e',
  en_route: '#f97316',
  in_progress: '#a855f7',
  completed: '#9ca3af',
  cancelled: '#ef4444',
};

const AdminCalendar: React.FC = () => {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleDefaultDate, setScheduleDefaultDate] = useState<string>('');
  const [stats, setStats] = useState({ today: 0, thisWeek: 0, upcoming: 0 });

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true });

      if (error) throw error;

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());

      const appts = data || [];
      setAppointments(appts);
      setStats({
        today: appts.filter(a => a.appointment_date?.startsWith(todayStr) && a.status !== 'cancelled').length,
        thisWeek: appts.filter(a => new Date(a.appointment_date) >= weekStart && a.status !== 'cancelled').length,
        upcoming: appts.filter(a => ['scheduled', 'confirmed'].includes(a.status)).length,
      });
    } catch (err) {
      console.error('Failed to fetch appointments:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  const getPatientName = (appt: any): string => {
    if (appt.notes?.startsWith('Patient: ')) {
      return appt.notes.split(' | ')[0].replace('Patient: ', '');
    }
    return appt.patient_email || 'Appointment';
  };

  // Convert appointments to FullCalendar events
  const calendarEvents = appointments.map(appt => {
    const name = getPatientName(appt);
    return {
      id: appt.id,
      title: name,
      start: appt.appointment_date,
      className: `fc-event-${appt.status}`,
      backgroundColor: STATUS_COLORS[appt.status] || '#1e293b',
      borderColor: 'transparent',
      extendedProps: { appointment: appt },
    };
  });

  const handleEventClick = (info: any) => {
    const appt = info.event.extendedProps.appointment;
    setSelectedAppointment(appt);
    setDetailModalOpen(true);
  };

  const handleDateClick = (info: any) => {
    setScheduleDefaultDate(info.dateStr);
    setScheduleModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold">Appointment Calendar</h2>
          <p className="text-muted-foreground text-sm">Click a date to schedule, click an appointment to view details</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAppointments}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" className="bg-conve-red hover:bg-conve-red-dark text-white"
            onClick={() => { setScheduleDefaultDate(''); setScheduleModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Appointment
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Calendar className="h-8 w-8 text-blue-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{stats.today}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Clock className="h-8 w-8 text-green-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{stats.thisWeek}</p>
              <p className="text-xs text-muted-foreground">This Week</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Users className="h-8 w-8 text-purple-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{stats.upcoming}</p>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span className="capitalize text-muted-foreground">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay',
              }}
              events={calendarEvents}
              eventClick={handleEventClick}
              dateClick={handleDateClick}
              height="auto"
              dayMaxEvents={4}
              moreLinkText={(n) => `+${n} more`}
              nowIndicator={true}
              eventDisplay="block"
              slotMinTime="06:00:00"
              slotMaxTime="15:00:00"
              allDaySlot={false}
              weekends={true}
              businessHours={{
                daysOfWeek: [1, 2, 3, 4, 5],
                startTime: '06:00',
                endTime: '13:30',
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <AppointmentDetailModal
        appointment={selectedAppointment}
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        onUpdate={fetchAppointments}
      />

      <ScheduleAppointmentModal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        onCreated={fetchAppointments}
        defaultDate={scheduleDefaultDate}
      />
    </div>
  );
};

export default AdminCalendar;
