import React, { useEffect, useState, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Plus, RefreshCw, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

  const [timeBlocks, setTimeBlocks] = useState<any[]>([]);

  const fetchTimeBlocks = useCallback(async () => {
    const { data } = await supabase.from('time_blocks' as any).select('*').order('start_date');
    setTimeBlocks(data || []);
  }, []);

  useEffect(() => { fetchAppointments(); fetchTimeBlocks(); }, [fetchAppointments, fetchTimeBlocks]);

  const getPatientName = (appt: any): string => {
    // Check direct patient_name column first
    if (appt.patient_name) return appt.patient_name;
    // Fallback: parse from notes
    if (appt.notes?.startsWith('Patient: ')) {
      return appt.notes.split(' | ')[0].replace('Patient: ', '');
    }
    return appt.patient_email || appt.service_name || 'Appointment';
  };

  // Convert appointments to FullCalendar events
  // Use appointment_time (local time) to build correct start time
  const calendarEvents = appointments.map(appt => {
    const name = getPatientName(appt);
    const dateOnly = appt.appointment_date?.substring(0, 10) || '';

    // Parse appointment_time (e.g., "8:00 AM" or "08:00:00") to build local datetime
    let startStr = appt.appointment_date; // fallback
    if (dateOnly && appt.appointment_time) {
      const timeStr = String(appt.appointment_time);
      let h = 0, m = 0;
      if (timeStr.includes('AM') || timeStr.includes('PM')) {
        const [tp, period] = timeStr.split(' ');
        const [hr, mn] = tp.split(':').map(Number);
        h = period === 'PM' && hr !== 12 ? hr + 12 : (period === 'AM' && hr === 12 ? 0 : hr);
        m = mn || 0;
      } else {
        const parts = timeStr.split(':').map(Number);
        h = parts[0] || 0;
        m = parts[1] || 0;
      }
      startStr = `${dateOnly}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
    }

    return {
      id: appt.id,
      title: name,
      start: startStr,
      allDay: !appt.appointment_time,
      className: `fc-event-${appt.status}`,
      backgroundColor: STATUS_COLORS[appt.status] || '#1e293b',
      borderColor: 'transparent',
      extendedProps: { appointment: appt },
    };
  });

  // Add blocked dates as background events
  const blockEvents = timeBlocks.map((block: any) => ({
    id: `block-${block.id}`,
    title: `BLOCKED: ${block.reason || 'Time Off'}`,
    start: block.start_date,
    end: block.end_date ? new Date(new Date(block.end_date + 'T00:00:00').getTime() + 86400000).toISOString().split('T')[0] : block.start_date,
    allDay: true,
    display: 'background',
    backgroundColor: '#fecaca',
    borderColor: '#ef4444',
    classNames: ['fc-blocked-date'],
    extendedProps: { isBlock: true, reason: block.reason },
  }));

  // Also add text overlay events for blocks so the reason is visible
  const blockLabelEvents = timeBlocks.map((block: any) => ({
    id: `block-label-${block.id}`,
    title: `🚫 ${block.reason || 'Blocked'}`,
    start: block.start_date,
    end: block.end_date ? new Date(new Date(block.end_date + 'T00:00:00').getTime() + 86400000).toISOString().split('T')[0] : block.start_date,
    allDay: true,
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
    textColor: '#ffffff',
    extendedProps: { isBlock: true },
  }));

  const allEvents = [...calendarEvents, ...blockEvents, ...blockLabelEvents];

  const handleEventClick = (info: any) => {
    // Don't open detail modal for block events
    if (info.event.extendedProps.isBlock) {
      toast.info(info.event.title);
      return;
    }
    const appt = info.event.extendedProps.appointment;
    setSelectedAppointment(appt);
    setDetailModalOpen(true);
  };

  const handleDateClick = (info: any) => {
    setScheduleDefaultDate(info.dateStr);
    setScheduleModalOpen(true);
  };

  // Drag-and-drop reschedule
  const handleEventDrop = async (info: any) => {
    const appt = info.event.extendedProps.appointment;
    if (!appt || info.event.extendedProps.isBlock) {
      info.revert();
      return;
    }

    // Don't allow dragging completed or cancelled
    if (['completed', 'cancelled', 'specimen_delivered'].includes(appt.status)) {
      toast.error('Cannot reschedule a completed or cancelled appointment');
      info.revert();
      return;
    }

    const newStart = info.event.start;
    if (!newStart) { info.revert(); return; }

    const newDateStr = `${newStart.getFullYear()}-${String(newStart.getMonth() + 1).padStart(2, '0')}-${String(newStart.getDate()).padStart(2, '0')}`;
    const h = newStart.getHours();
    const m = newStart.getMinutes();
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const newTimeStr = `${h12}:${String(m).padStart(2, '0')} ${period}`;
    const newDateTimestamp = `${newDateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          appointment_date: newDateTimestamp,
          appointment_time: newTimeStr,
          rescheduled_at: new Date().toISOString(),
        })
        .eq('id', appt.id);

      if (error) throw error;

      // Log activity
      await supabase.from('activity_log' as any).insert({
        patient_id: appt.patient_id || null,
        activity_type: 'reschedule',
        description: `Appointment drag-rescheduled to ${newDateStr} at ${newTimeStr}`,
        performed_by: 'admin',
        appointment_id: appt.id,
      }).catch(() => {});

      toast.success(`${getPatientName(appt)} moved to ${newDateStr} at ${newTimeStr}`);
      fetchAppointments();
    } catch (err: any) {
      console.error('Drag reschedule failed:', err);
      toast.error('Failed to reschedule: ' + (err.message || 'Unknown error'));
      info.revert();
    }
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
              timeZone="America/New_York"
              events={allEvents}
              eventClick={handleEventClick}
              dateClick={handleDateClick}
              editable={true}
              eventDrop={handleEventDrop}
              eventDurationEditable={false}
              height="auto"
              dayMaxEvents={4}
              eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
              moreLinkText={(n) => `+${n} more`}
              nowIndicator={true}
              eventDisplay="block"
              slotMinTime="06:00:00"
              slotMaxTime="21:00:00"
              allDaySlot={false}
              weekends={true}
              businessHours={{
                daysOfWeek: [1, 2, 3, 4, 5],
                startTime: '06:00',
                endTime: '17:30',
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
