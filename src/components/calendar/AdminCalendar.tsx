import React, { useEffect, useState, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Plus, RefreshCw, Users, CalendarOff, Repeat } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({ startDate: '', endDate: '', reason: '', blockType: 'office_closure' });
  const [recurringForm, setRecurringForm] = useState({
    patientSearch: '', patientName: '', patientEmail: '', patientPhone: '',
    serviceType: 'mobile', frequency: 'weekly', occurrences: '4',
    startDate: '', time: '', address: '', notes: '', waiveFee: false,
  });
  const [isBlockSubmitting, setIsBlockSubmitting] = useState(false);
  const [isRecurringSubmitting, setIsRecurringSubmitting] = useState(false);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

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
    if (appt.patient_name) return appt.patient_name;
    if (appt.notes?.match(/Patient:\s*([^|]+)/)) return appt.notes.match(/Patient:\s*([^|]+)/)[1].trim();
    // Don't show raw email — show service name or generic label
    return appt.service_name || 'Appointment';
  };

  // Parse appointment_time to 24h hours/minutes
  const parseTime = (timeStr: string): { h: number; m: number } => {
    if (!timeStr) return { h: 0, m: 0 };
    const t = String(timeStr);
    if (t.includes('AM') || t.includes('PM')) {
      const [tp, period] = t.split(' ');
      const [hr, mn] = tp.split(':').map(Number);
      return { h: period === 'PM' && hr !== 12 ? hr + 12 : (period === 'AM' && hr === 12 ? 0 : hr), m: mn || 0 };
    }
    const parts = t.split(':').map(Number);
    return { h: parts[0] || 0, m: parts[1] || 0 };
  };

  // Format time for display (24h → 12h)
  const formatTime12h = (h: number, m: number): string => {
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  };

  // Filter: hide cancelled from month view, show all in week/day
  const [currentView, setCurrentView] = useState('dayGridMonth');
  const visibleAppointments = currentView === 'dayGridMonth'
    ? appointments.filter(a => a.status !== 'cancelled')
    : appointments;

  // Convert appointments to FullCalendar events
  const calendarEvents = visibleAppointments.map(appt => {
    const name = getPatientName(appt);
    const dateOnly = appt.appointment_date?.substring(0, 10) || '';
    const { h, m } = parseTime(appt.appointment_time);
    const startStr = dateOnly && appt.appointment_time
      ? `${dateOnly}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
      : appt.appointment_date;

    // Calculate end time based on duration
    const durationMin = appt.duration_minutes || 60;
    const endH = h + Math.floor((m + durationMin) / 60);
    const endM = (m + durationMin) % 60;
    const endStr = dateOnly && appt.appointment_time
      ? `${dateOnly}T${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}:00`
      : undefined;

    // Build rich title: "10:00a Patient Name" for month view
    const timeLabel = formatTime12h(h, m).replace(':00', '').replace(' AM', 'a').replace(' PM', 'p').toLowerCase();

    return {
      id: appt.id,
      title: name,
      start: startStr,
      end: endStr,
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={fetchAppointments}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBlockModalOpen(true)}>
            <CalendarOff className="h-4 w-4 mr-1" /> Block Dates
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRecurringModalOpen(true)}>
            <Repeat className="h-4 w-4 mr-1" /> Recurring
          </Button>
          <Button size="sm" className="bg-conve-red hover:bg-conve-red-dark text-white"
            onClick={() => { setScheduleDefaultDate(''); setScheduleModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Appointment
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              datesSet={(info) => setCurrentView(info.view.type)}
              height="auto"
              dayMaxEvents={3}
              dayMaxEventRows={3}
              moreLinkClick="popover"
              eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
              moreLinkText={(n) => `+${n} more`}
              nowIndicator={true}
              eventDisplay="block"
              slotMinTime="06:00:00"
              slotMaxTime="21:00:00"
              slotDuration="00:30:00"
              allDaySlot={false}
              weekends={true}
              businessHours={{
                daysOfWeek: [1, 2, 3, 4, 5],
                startTime: '06:00',
                endTime: '17:30',
              }}
              eventDidMount={(info) => {
                // Add tooltip with full details
                const appt = info.event.extendedProps.appointment;
                if (appt && !info.event.extendedProps.isBlock) {
                  info.el.title = `${info.event.title}\n${appt.appointment_time || ''}\n${appt.address || ''}\n${appt.service_name || appt.service_type || ''}`;
                }
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

      {/* Block Dates Modal */}
      <Dialog open={blockModalOpen} onOpenChange={setBlockModalOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5 text-[#B91C1C]" /> Block Dates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date *</Label><Input type="date" value={blockForm.startDate} onChange={e => setBlockForm(p => ({ ...p, startDate: e.target.value }))} /></div>
              <div><Label>End Date *</Label><Input type="date" value={blockForm.endDate} onChange={e => setBlockForm(p => ({ ...p, endDate: e.target.value }))} /></div>
            </div>
            <div><Label>Reason</Label><Input value={blockForm.reason} onChange={e => setBlockForm(p => ({ ...p, reason: e.target.value }))} placeholder="PTO, Office Closure, etc." /></div>
            <div>
              <Label>Block Type</Label>
              <Select value={blockForm.blockType} onValueChange={v => setBlockForm(p => ({ ...p, blockType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office_closure">Office Closure (blocks all bookings)</SelectItem>
                  <SelectItem value="time_off">Staff Time Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white" disabled={!blockForm.startDate || !blockForm.endDate || isBlockSubmitting}
              onClick={async () => {
                setIsBlockSubmitting(true);
                try {
                  const { error } = await supabase.from('time_blocks' as any).insert({
                    start_date: blockForm.startDate, end_date: blockForm.endDate,
                    reason: blockForm.reason || 'Blocked', block_type: blockForm.blockType,
                  }).select();
                  if (error) throw error;
                  toast.success('Dates blocked successfully');
                  setBlockForm({ startDate: '', endDate: '', reason: '', blockType: 'office_closure' });
                  setBlockModalOpen(false);
                  fetchTimeBlocks();
                  fetchAppointments();
                } catch (err: any) { toast.error(err.message || 'Failed to block dates'); }
                finally { setIsBlockSubmitting(false); }
              }}>
              {isBlockSubmitting ? 'Blocking...' : 'Block Dates'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recurring Appointments Modal */}
      <Dialog open={recurringModalOpen} onOpenChange={setRecurringModalOpen}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Repeat className="h-5 w-5 text-[#B91C1C]" /> Schedule Recurring Appointments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Patient Name *</Label><Input value={recurringForm.patientName} onChange={e => setRecurringForm(p => ({ ...p, patientName: e.target.value }))} placeholder="Full name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={recurringForm.patientEmail} onChange={e => setRecurringForm(p => ({ ...p, patientEmail: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={recurringForm.patientPhone} onChange={e => setRecurringForm(p => ({ ...p, patientPhone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Service *</Label>
                <Select value={recurringForm.serviceType} onValueChange={v => setRecurringForm(p => ({ ...p, serviceType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mobile">Mobile Blood Draw ($150)</SelectItem>
                    <SelectItem value="in-office">Office Visit ($55)</SelectItem>
                    <SelectItem value="senior">Senior 65+ ($100)</SelectItem>
                    <SelectItem value="therapeutic">Therapeutic ($200)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Frequency *</Label>
                <Select value={recurringForm.frequency} onValueChange={v => setRecurringForm(p => ({ ...p, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="bimonthly">Bi-Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Start Date *</Label><Input type="date" value={recurringForm.startDate} onChange={e => setRecurringForm(p => ({ ...p, startDate: e.target.value }))} /></div>
              <div>
                <Label>Time *</Label>
                <Select value={recurringForm.time} onValueChange={v => setRecurringForm(p => ({ ...p, time: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM'].map(t =>
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div><Label># Occurrences</Label><Input type="number" min="1" max="52" value={recurringForm.occurrences} onChange={e => setRecurringForm(p => ({ ...p, occurrences: e.target.value }))} /></div>
            </div>
            <div><Label>Address</Label><Input value={recurringForm.address} onChange={e => setRecurringForm(p => ({ ...p, address: e.target.value }))} placeholder="Patient address" /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="waive-recurring" checked={recurringForm.waiveFee} onChange={e => setRecurringForm(p => ({ ...p, waiveFee: e.target.checked }))} className="rounded" />
              <label htmlFor="waive-recurring" className="text-sm">Waive all fees (no invoices)</label>
            </div>

            {/* Preview */}
            {recurringForm.startDate && recurringForm.time && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-semibold">Preview: {recurringForm.occurrences} appointments</p>
                <p className="text-muted-foreground">
                  {recurringForm.frequency === 'weekly' ? 'Every week' : recurringForm.frequency === 'biweekly' ? 'Every 2 weeks' : recurringForm.frequency === 'monthly' ? 'Every month' : 'Every 2 months'}
                  {' '}starting {recurringForm.startDate} at {recurringForm.time}
                </p>
                {!recurringForm.waiveFee && (
                  <p className="font-medium text-[#B91C1C]">
                    Total: ${(() => {
                      const prices: Record<string, number> = { mobile: 150, 'in-office': 55, senior: 100, therapeutic: 200 };
                      return ((prices[recurringForm.serviceType] || 150) * parseInt(recurringForm.occurrences || '1')).toFixed(2);
                    })()}
                    {' '}(invoice sent to patient)
                  </p>
                )}
              </div>
            )}

            <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11" disabled={!recurringForm.patientName || !recurringForm.startDate || !recurringForm.time || isRecurringSubmitting}
              onClick={async () => {
                setIsRecurringSubmitting(true);
                try {
                  const prices: Record<string, number> = { mobile: 150, 'in-office': 55, senior: 100, therapeutic: 200 };
                  const serviceNames: Record<string, string> = { mobile: 'Mobile Blood Draw', 'in-office': 'Office Visit', senior: 'Senior Blood Draw', therapeutic: 'Therapeutic Phlebotomy' };
                  const price = prices[recurringForm.serviceType] || 150;
                  const svcName = serviceNames[recurringForm.serviceType] || 'Blood Draw';
                  const occurrences = parseInt(recurringForm.occurrences || '1');
                  const freqDays: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30, bimonthly: 60 };
                  const daysBetween = freqDays[recurringForm.frequency] || 7;

                  // Parse time
                  let hours = 0, minutes = 0;
                  if (recurringForm.time.includes('AM') || recurringForm.time.includes('PM')) {
                    const [tStr, period] = recurringForm.time.split(' ');
                    [hours, minutes] = tStr.split(':').map(Number);
                    if (period === 'PM' && hours !== 12) hours += 12;
                    if (period === 'AM' && hours === 12) hours = 0;
                  }

                  const appointmentsToCreate = [];
                  let currentDate = new Date(recurringForm.startDate + 'T12:00:00');

                  for (let i = 0; i < occurrences; i++) {
                    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                    const apptDateTime = `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

                    appointmentsToCreate.push({
                      appointment_date: apptDateTime,
                      appointment_time: recurringForm.time,
                      patient_name: recurringForm.patientName,
                      patient_email: recurringForm.patientEmail || null,
                      patient_phone: recurringForm.patientPhone || null,
                      service_type: recurringForm.serviceType,
                      service_name: svcName,
                      status: 'scheduled',
                      address: recurringForm.address || 'TBD',
                      zipcode: '32801',
                      total_amount: recurringForm.waiveFee ? 0 : price,
                      service_price: recurringForm.waiveFee ? 0 : price,
                      duration_minutes: recurringForm.serviceType === 'therapeutic' ? 75 : 60,
                      booking_source: 'manual',
                      invoice_status: recurringForm.waiveFee ? 'not_required' : 'sent',
                      payment_status: recurringForm.waiveFee ? 'completed' : 'pending',
                      phlebotomist_id: '91c76708-8c5b-4068-92c6-323805a3b164', // TODO: dynamic staff selection when team scales
                      notes: `Recurring ${recurringForm.frequency} (${i + 1}/${occurrences})`,
                    });

                    // Advance date
                    if (recurringForm.frequency === 'monthly') {
                      currentDate.setMonth(currentDate.getMonth() + 1);
                    } else if (recurringForm.frequency === 'bimonthly') {
                      currentDate.setMonth(currentDate.getMonth() + 2);
                    } else {
                      currentDate.setDate(currentDate.getDate() + daysBetween);
                    }
                  }

                  const { data: created, error } = await supabase.from('appointments').insert(appointmentsToCreate).select();
                  if (error) throw error;

                  // Send invoice for total if not waived
                  if (!recurringForm.waiveFee && recurringForm.patientEmail) {
                    const totalAmount = price * occurrences;
                    await supabase.functions.invoke('send-appointment-invoice', {
                      body: {
                        appointmentId: created?.[0]?.id,
                        patientName: recurringForm.patientName,
                        patientEmail: recurringForm.patientEmail,
                        serviceType: recurringForm.serviceType,
                        serviceName: `${svcName} (${occurrences}x ${recurringForm.frequency})`,
                        servicePrice: totalAmount,
                        appointmentDate: recurringForm.startDate,
                        appointmentTime: recurringForm.time,
                        address: recurringForm.address || 'TBD',
                        memo: `Recurring: ${occurrences} appointments, ${recurringForm.frequency}`,
                      },
                    }).catch(err => console.error('Invoice error:', err));
                  }

                  // Notify owner + phlebotomist
                  supabase.functions.invoke('send-sms-notification', {
                    body: { to: '9415279169', message: `Recurring Booking!\n\nPatient: ${recurringForm.patientName}\n${occurrences}x ${svcName} (${recurringForm.frequency})\nTotal: $${recurringForm.waiveFee ? '0 (waived)' : (price * occurrences).toFixed(2)}\nStarting: ${recurringForm.startDate}` },
                  }).catch(() => {});

                  toast.success(`${created?.length || occurrences} recurring appointments created!`);
                  setRecurringForm({ patientSearch: '', patientName: '', patientEmail: '', patientPhone: '', serviceType: 'mobile', frequency: 'weekly', occurrences: '4', startDate: '', time: '', address: '', notes: '', waiveFee: false });
                  setRecurringModalOpen(false);
                  fetchAppointments();
                } catch (err: any) {
                  toast.error(err.message || 'Failed to create recurring appointments');
                } finally {
                  setIsRecurringSubmitting(false);
                }
              }}>
              {isRecurringSubmitting ? 'Creating...' : `Create ${recurringForm.occurrences} Appointments`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCalendar;
