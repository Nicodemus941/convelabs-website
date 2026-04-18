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
import SeriesConflictModal, { type Resolution } from './SeriesConflictModal';
import AddressAutocomplete from '@/components/ui/address-autocomplete';
import { detectSeriesConflicts, type Conflict, type ProposedSlot } from '@/lib/seriesConflicts';
import './calendar-styles.css';

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#2563eb',
  confirmed: '#1d4ed8',
  en_route: '#ea580c',
  in_progress: '#0891b2',
  completed: '#6b7280',
  cancelled: '#fca5a5',
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
  // Sprint 4 defaults — bundle pricing & % off baked in here so the UI + handler
  // agree on the math without duplication.
  const BUNDLE_DISCOUNT_PCT = 15;
  const [recurringForm, setRecurringForm] = useState({
    patientSearch: '', patientName: '', patientEmail: '', patientPhone: '',
    serviceType: 'mobile', frequency: 'weekly', occurrences: '4', paymentMode: 'per_visit' as 'per_visit' | 'prepaid_bundle',
    // dayOfWeek: 0=Sun..6=Sat. null = let startDate decide (matches legacy behavior).
    // Applies only to weekly/biweekly frequencies.
    dayOfWeek: null as number | null,
    startDate: '', endDate: '', time: '', address: '', notes: '', waiveFee: false,
  });
  const [isBlockSubmitting, setIsBlockSubmitting] = useState(false);
  const [isRecurringSubmitting, setIsRecurringSubmitting] = useState(false);
  // Sprint 4: series conflict detection state
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [detectedConflicts, setDetectedConflicts] = useState<Conflict[]>([]);
  const [pendingSlots, setPendingSlots] = useState<ProposedSlot[]>([]);

  // Sprint 4 — patient autocomplete for the recurring modal
  const [patientResults, setPatientResults] = useState<Array<{ id: string; first_name: string; last_name: string; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; zipcode: string | null; }>>([]);
  const [showPatientResults, setShowPatientResults] = useState(false);
  const searchPatients = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) { setPatientResults([]); return; }
    try {
      const { data } = await supabase
        .from('tenant_patients')
        .select('id, first_name, last_name, email, phone, address, city, state, zipcode')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .eq('is_active', true)
        .limit(8);
      setPatientResults((data as any) || []);
    } catch (e) { console.warn('patient search failed:', e); }
  }, []);

  /**
   * Compute the proposed slot list from the recurring form state.
   * Pure function — no side effects. Used both for conflict detection
   * pre-flight AND as the starting slot list that the conflict modal
   * operates on.
   */
  const computeProposedSlots = useCallback((): ProposedSlot[] => {
    const occurrences = parseInt(recurringForm.occurrences || '1');
    const freqDays: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30, bimonthly: 60 };
    const daysBetween = freqDays[recurringForm.frequency] || 7;

    let currentDate = new Date(recurringForm.startDate + 'T12:00:00');
    if (
      recurringForm.dayOfWeek !== null &&
      ['weekly', 'biweekly'].includes(recurringForm.frequency)
    ) {
      while (currentDate.getDay() !== recurringForm.dayOfWeek) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    const endDateCap = recurringForm.endDate
      ? new Date(recurringForm.endDate + 'T23:59:59')
      : null;

    const slots: ProposedSlot[] = [];
    for (let i = 0; i < occurrences; i++) {
      if (endDateCap && currentDate > endDateCap) break;
      const dateIso = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      slots.push({ dateIso, time: recurringForm.time, sequence: i + 1 });
      if (recurringForm.frequency === 'monthly') currentDate.setMonth(currentDate.getMonth() + 1);
      else if (recurringForm.frequency === 'bimonthly') currentDate.setMonth(currentDate.getMonth() + 2);
      else currentDate.setDate(currentDate.getDate() + daysBetween);
    }
    return slots;
  }, [recurringForm]);

  /**
   * Performs the full recurring-series creation: inserts N appointments,
   * links them via recurrence_group_id, optionally creates a visit_bundles
   * row + Stripe bundle checkout, fires owner SMS, resets the form.
   *
   * Takes a pre-validated list of slots (from either the direct submit
   * path OR the conflict-resolution modal) instead of re-computing them.
   * Re-indexes sequence 1..N so "Visit 3 of 4" reads correctly after
   * any skipped dates drop out.
   */
  const createSeriesWithSlots = useCallback(async (slots: { dateIso: string; time: string }[]) => {
    if (slots.length === 0) {
      toast.error('No valid dates remaining after resolution.');
      return;
    }
    const prices: Record<string, number> = { mobile: 150, 'in-office': 55, senior: 100, therapeutic: 200 };
    const serviceNames: Record<string, string> = { mobile: 'Mobile Blood Draw', 'in-office': 'Office Visit', senior: 'Senior Blood Draw', therapeutic: 'Therapeutic Phlebotomy' };
    const price = prices[recurringForm.serviceType] || 150;
    const svcName = serviceNames[recurringForm.serviceType] || 'Blood Draw';

    const recurrenceGroupId = crypto.randomUUID();
    const isPrepaid = recurringForm.paymentMode === 'prepaid_bundle' && !recurringForm.waiveFee;
    const bundleDiscountPct = BUNDLE_DISCOUNT_PCT;
    const perVisitPrepaid = isPrepaid ? price * (1 - bundleDiscountPct / 100) : price;
    const effectiveOccurrences = slots.length;

    // Bundle row (if prepaid)
    let bundleId: string | null = null;
    if (isPrepaid) {
      const totalAmount = price * effectiveOccurrences * (1 - bundleDiscountPct / 100);
      const { data: bundle, error: bundleErr } = await supabase.from('visit_bundles').insert({
        patient_email: recurringForm.patientEmail || null,
        credits_purchased: effectiveOccurrences,
        credits_remaining: effectiveOccurrences,
        discount_percent: bundleDiscountPct,
        amount_paid: totalAmount,
      } as any).select().single();
      if (bundleErr) throw bundleErr;
      bundleId = (bundle as any)?.id || null;
    }

    // Build appointments from resolved slots (sequence re-indexed 1..N)
    const appointmentsToCreate = slots.map((slot, idx) => {
      // Parse the slot's specific time (conflict resolutions may change per-date)
      let hours = 0, minutes = 0;
      if (slot.time.includes('AM') || slot.time.includes('PM')) {
        const [tStr, period] = slot.time.split(' ');
        [hours, minutes] = tStr.split(':').map(Number);
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
      }
      const apptDateTime = `${slot.dateIso}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      return {
        appointment_date: apptDateTime,
        appointment_time: slot.time,
        patient_name: recurringForm.patientName,
        patient_email: recurringForm.patientEmail || null,
        patient_phone: recurringForm.patientPhone || null,
        service_type: recurringForm.serviceType,
        service_name: svcName,
        status: 'scheduled',
        address: recurringForm.address || 'TBD',
        zipcode: '32801',
        total_amount: recurringForm.waiveFee ? 0 : (isPrepaid ? perVisitPrepaid : price),
        service_price: recurringForm.waiveFee ? 0 : (isPrepaid ? perVisitPrepaid : price),
        duration_minutes: recurringForm.serviceType === 'therapeutic' ? 75 : 60,
        booking_source: 'manual',
        invoice_status: recurringForm.waiveFee || isPrepaid ? 'not_required' : 'sent',
        payment_status: recurringForm.waiveFee || isPrepaid ? 'completed' : 'pending',
        phlebotomist_id: '91c76708-8c5b-4068-92c6-323805a3b164',
        notes: `Recurring ${recurringForm.frequency} (${idx + 1}/${effectiveOccurrences})${isPrepaid ? ' — prepaid bundle' : ''}`,
        recurrence_group_id: recurrenceGroupId,
        recurrence_sequence: idx + 1,
        recurrence_total: effectiveOccurrences,
        ...(bundleId ? { visit_bundle_id: bundleId } : {}),
      };
    });

    const { data: created, error } = await supabase.from('appointments').insert(appointmentsToCreate).select();
    if (error) throw error;

    // Bundle checkout
    if (isPrepaid && recurringForm.patientEmail && bundleId) {
      try {
        const totalAmount = price * effectiveOccurrences * (1 - bundleDiscountPct / 100);
        const { data: checkoutRes } = await supabase.functions.invoke('create-bundle-checkout', {
          body: {
            bundleId,
            patientEmail: recurringForm.patientEmail,
            patientName: recurringForm.patientName,
            serviceName: `${svcName} x${effectiveOccurrences} (${recurringForm.frequency}, ${bundleDiscountPct}% off)`,
            amountCents: Math.round(totalAmount * 100),
            occurrences: effectiveOccurrences,
            startDate: slots[0]?.dateIso,
          },
        });
        const url = (checkoutRes as any)?.url;
        if (url) {
          toast.success('Bundle checkout link ready — opening for patient…');
          window.open(url, '_blank');
        } else {
          toast.warning('Series created; bundle checkout link failed. Send manually.');
        }
      } catch (bundleErr: any) {
        console.error('Bundle checkout error:', bundleErr);
        toast.warning('Series created; bundle checkout failed. Send invoice manually.');
      }
    }
    // Per-visit invoice
    else if (!recurringForm.waiveFee && recurringForm.patientEmail) {
      const totalAmount = price * effectiveOccurrences;
      await supabase.functions.invoke('send-appointment-invoice', {
        body: {
          appointmentId: created?.[0]?.id,
          patientName: recurringForm.patientName,
          patientEmail: recurringForm.patientEmail,
          serviceType: recurringForm.serviceType,
          serviceName: `${svcName} (${effectiveOccurrences}x ${recurringForm.frequency})`,
          servicePrice: totalAmount,
          appointmentDate: slots[0]?.dateIso,
          appointmentTime: slots[0]?.time,
          address: recurringForm.address || 'TBD',
          memo: `Recurring: ${effectiveOccurrences} appointments, ${recurringForm.frequency}`,
        },
      }).then(undefined, (err: any) => console.error('Invoice error:', err));
    }

    // Owner SMS
    const modeLabel = isPrepaid ? `PREPAID $${(price * effectiveOccurrences * (1 - bundleDiscountPct / 100)).toFixed(2)} (${bundleDiscountPct}% off)` : recurringForm.waiveFee ? '0 (waived)' : `$${(price * effectiveOccurrences).toFixed(2)} per-visit`;
    supabase.functions.invoke('send-sms-notification', {
      body: { to: '9415279169', message: `Recurring Booking!\n\nPatient: ${recurringForm.patientName}\n${effectiveOccurrences}x ${svcName} (${recurringForm.frequency})\n${modeLabel}\nStarting: ${slots[0]?.dateIso}${recurringForm.endDate ? `\nEnds by: ${recurringForm.endDate}` : ''}` },
    }).then(undefined, () => {});

    toast.success(`${created?.length || effectiveOccurrences} recurring appointments created!`);
    setRecurringForm({ patientSearch: '', patientName: '', patientEmail: '', patientPhone: '', serviceType: 'mobile', frequency: 'weekly', occurrences: '4', startDate: '', endDate: '', time: '', address: '', notes: '', waiveFee: false, paymentMode: 'per_visit', dayOfWeek: null });
    setRecurringModalOpen(false);
    fetchAppointments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringForm]);

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

  // Custom event content renderer — Square-style compact cards
  const renderEventContent = (eventInfo: any) => {
    const appt = eventInfo.event.extendedProps.appointment;
    if (!appt || eventInfo.event.extendedProps.isBlock) {
      return <span>{eventInfo.event.title}</span>;
    }

    const viewType = eventInfo.view?.type || currentView;
    const isTimeGrid = viewType.startsWith('timeGrid');

    if (!isTimeGrid) {
      // Month view — keep compact single line
      return (
        <span>
          {eventInfo.timeText && <span className="fc-event-content-time">{eventInfo.timeText} </span>}
          {eventInfo.event.title}
        </span>
      );
    }

    // Week/Day view — Square-style stacked layout
    const serviceName = appt.service_name || appt.service_type || '';
    // Shorten common service names
    const shortService = serviceName
      .replace('At-Home Blood Work (Seminole, Orange, & Volusia County)', 'At-Home Blood Work')
      .replace('Mobile Blood Draw', 'At-Home Blood Work')
      .replace('Specialty Collection Kit', 'Specialty Kit')
      .replace('Therapeutic Phlebotomy', 'Therapeutic Blood Work')
      .replace('Senior Blood Draw', 'Senior (65+)')
      .replace("Patient's Pricing ONLY", "Patient's Pricing");

    return (
      <div style={{ overflow: 'hidden', height: '100%' }}>
        <div className="fc-event-content-time">{eventInfo.timeText}</div>
        <div className="fc-event-content-name">{eventInfo.event.title}</div>
        <div className="fc-event-content-service">{shortService}</div>
      </div>
    );
  };

  // Filter: always hide cancelled appointments from the calendar
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const [currentView, setCurrentView] = useState(isMobile ? 'timeGridDay' : 'timeGridWeek');
  const visibleAppointments = appointments.filter(a => a.status !== 'cancelled');

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
      try {
        await supabase.from('activity_log' as any).insert({
          patient_id: appt.patient_id || null,
          activity_type: 'reschedule',
          description: `Appointment drag-rescheduled to ${newDateStr} at ${newTimeStr}`,
          performed_by: 'admin',
          appointment_id: appt.id,
        });
      } catch { /* non-fatal */ }

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
      {/* Header — compact like Square */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Calendar</h2>
          <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{stats.today}</span> today
            <span className="text-muted-foreground/40">|</span>
            <span className="font-medium text-foreground">{stats.upcoming}</span> upcoming
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={fetchAppointments} className="h-8 px-2">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setBlockModalOpen(true)}>
            <CalendarOff className="h-3.5 w-3.5 mr-1" /> Block
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRecurringModalOpen(true)}>
            <Repeat className="h-3.5 w-3.5 mr-1" /> Recurring
          </Button>
          <Button size="sm" className="h-8 bg-[#1e293b] hover:bg-[#0f172a] text-white text-xs"
            onClick={() => { setScheduleDefaultDate(''); setScheduleModalOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Create
          </Button>
        </div>
      </div>

      {/* Status Legend — inline, subtle */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color, opacity: status === 'cancelled' ? 0.5 : 1 }} />
            <span className="capitalize text-muted-foreground">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <Card className="border shadow-sm">
        <CardContent className="p-2 sm:p-3">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay',
              }}
              titleFormat={{ year: 'numeric', month: 'short', day: 'numeric' }}
              dayHeaderFormat={{ weekday: 'short', month: '2-digit', day: '2-digit', omitCommas: true }}
              timeZone="America/New_York"
              events={allEvents}
              eventContent={renderEventContent}
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
                daysOfWeek: [1, 2, 3, 4, 5, 6],
                startTime: '06:00',
                endTime: '18:00',
              }}
              eventDidMount={(info) => {
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
            {/* Patient Name + autocomplete dropdown */}
            <div className="relative">
              <Label>Patient Name *</Label>
              <Input
                value={recurringForm.patientName}
                onChange={e => {
                  const v = e.target.value;
                  setRecurringForm(p => ({ ...p, patientName: v }));
                  searchPatients(v);
                  setShowPatientResults(true);
                }}
                onFocus={() => { if (patientResults.length > 0) setShowPatientResults(true); }}
                onBlur={() => setTimeout(() => setShowPatientResults(false), 180)}
                placeholder="Start typing — we'll search existing patients"
                autoComplete="off"
              />
              {showPatientResults && patientResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {patientResults.map(pat => {
                    const fullAddress = [pat.address, pat.city, pat.state, pat.zipcode].filter(Boolean).join(', ');
                    return (
                      <button
                        key={pat.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 flex items-start gap-2"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setRecurringForm(p => ({
                            ...p,
                            patientName: `${pat.first_name || ''} ${pat.last_name || ''}`.trim(),
                            patientEmail: pat.email || '',
                            patientPhone: pat.phone || '',
                            address: fullAddress || p.address,
                          }));
                          setShowPatientResults(false);
                          setPatientResults([]);
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{pat.first_name} {pat.last_name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {[pat.email, pat.phone].filter(Boolean).join(' · ') || 'No contact info'}
                          </p>
                          {fullAddress && (
                            <p className="text-[11px] text-gray-400 truncate">{fullAddress}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-gray-500 mt-1">
                Start typing — existing patients auto-fill name, email, phone, and address.
              </p>
            </div>
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
            {/* Day of Week (only meaningful for weekly / biweekly) */}
            {['weekly', 'biweekly'].includes(recurringForm.frequency) && (
              <div>
                <Label>Day of Week <span className="text-muted-foreground font-normal">(optional — defaults to start date's weekday)</span></Label>
                <div className="grid grid-cols-7 gap-1 mt-1">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setRecurringForm(p => ({ ...p, dayOfWeek: p.dayOfWeek === i ? null : i }))}
                      className={`h-9 rounded-md text-xs font-semibold border transition ${
                        recurringForm.dayOfWeek === i
                          ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Start Date *</Label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    type="date"
                    value={recurringForm.startDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={e => setRecurringForm(p => ({ ...p, startDate: e.target.value }))}
                    className="pl-9 cursor-pointer"
                    onClick={(e) => {
                      try { (e.currentTarget as any).showPicker?.(); } catch {}
                    }}
                  />
                </div>
              </div>
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
            {/* End date — optional cap; series stops at the earlier of endDate OR occurrences */}
            <div>
              <Label>End Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  type="date"
                  value={recurringForm.endDate}
                  min={recurringForm.startDate || new Date().toISOString().slice(0, 10)}
                  onChange={e => setRecurringForm(p => ({ ...p, endDate: e.target.value }))}
                  className="pl-9 cursor-pointer"
                  onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Series stops at the earlier of end date OR # occurrences. Leave blank to honor the count only.
              </p>
            </div>
            <div>
              <Label>Address</Label>
              <AddressAutocomplete
                value={recurringForm.address}
                onChange={(v) => setRecurringForm(p => ({ ...p, address: v }))}
                onPlaceSelected={(place) => {
                  // Normalize to "street, city, ST zip" for the single-field form
                  const full = [place.address, place.city, place.state, place.zipCode].filter(Boolean).join(', ');
                  setRecurringForm(p => ({ ...p, address: full || place.address }));
                }}
                placeholder="Start typing patient's address — Google suggestions"
              />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="waive-recurring" checked={recurringForm.waiveFee} onChange={e => setRecurringForm(p => ({ ...p, waiveFee: e.target.checked }))} className="rounded" />
              <label htmlFor="waive-recurring" className="text-sm">Waive all fees (no invoices)</label>
            </div>

            {/* Preview */}
            {/* Payment Mode — per-visit invoice vs. prepaid bundle (Sprint 4) */}
            <div className="border rounded-lg p-3 bg-gray-50">
              <Label className="text-xs uppercase tracking-wider text-gray-600 font-semibold">Payment</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => setRecurringForm(p => ({ ...p, paymentMode: 'per_visit' }))}
                  className={`px-3 py-2 rounded-md text-xs font-medium border transition text-left ${recurringForm.paymentMode === 'per_visit' ? 'bg-white border-[#B91C1C] text-[#B91C1C]' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
                >
                  <div className="font-semibold">Invoice per visit</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 font-normal">Full price each visit</div>
                </button>
                <button
                  type="button"
                  onClick={() => setRecurringForm(p => ({ ...p, paymentMode: 'prepaid_bundle' }))}
                  className={`px-3 py-2 rounded-md text-xs font-medium border transition text-left ${recurringForm.paymentMode === 'prepaid_bundle' ? 'bg-white border-emerald-600 text-emerald-700' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
                  disabled={recurringForm.waiveFee}
                >
                  <div className="font-semibold">Prepaid bundle · {BUNDLE_DISCOUNT_PCT}% off</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 font-normal">Single upfront charge</div>
                </button>
              </div>
              {recurringForm.paymentMode === 'prepaid_bundle' && !recurringForm.waiveFee && (
                <p className="text-[11px] text-emerald-700 mt-2 leading-relaxed">
                  Patient gets a single Stripe checkout for the whole series. Near-100% show rate (sunk-cost psychology) and cash lands Day 1.
                </p>
              )}
            </div>

            {recurringForm.startDate && recurringForm.time && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-semibold">Preview: {recurringForm.occurrences} appointments</p>
                <p className="text-muted-foreground">
                  {recurringForm.frequency === 'weekly' ? 'Every week' : recurringForm.frequency === 'biweekly' ? 'Every 2 weeks' : recurringForm.frequency === 'monthly' ? 'Every month' : 'Every 2 months'}
                  {' '}starting {recurringForm.startDate} at {recurringForm.time}
                </p>
                {!recurringForm.waiveFee && recurringForm.paymentMode === 'prepaid_bundle' && (
                  <p className="mt-1 font-medium text-emerald-700">
                    {(() => {
                      const prices: Record<string, number> = { mobile: 150, 'in-office': 55, senior: 100, therapeutic: 200 };
                      const p = prices[recurringForm.serviceType] || 150;
                      const n = parseInt(recurringForm.occurrences || '1');
                      const full = p * n;
                      const disc = full * (BUNDLE_DISCOUNT_PCT / 100);
                      return `Prepaid: $${(full - disc).toFixed(2)} (saves $${disc.toFixed(2)} vs $${full.toFixed(2)} list)`;
                    })()}
                  </p>
                )}
                {!recurringForm.waiveFee && recurringForm.paymentMode === 'per_visit' && (
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
                  // 1. Compute what dates + times we WANT to book
                  const proposed = computeProposedSlots();
                  if (proposed.length === 0) {
                    toast.error('No valid dates given the start/end/occurrences combination.');
                    setIsRecurringSubmitting(false);
                    return;
                  }

                  // 2. Pre-flight: any conflicts (holidays, existing appts, slot holds, office closures)?
                  const conflicts = await detectSeriesConflicts(proposed);
                  if (conflicts.length > 0) {
                    setDetectedConflicts(conflicts);
                    setPendingSlots(proposed);
                    setConflictModalOpen(true);
                    setIsRecurringSubmitting(false);
                    return;  // Admin resolves via SeriesConflictModal
                  }

                  // 3. Clean sail — proceed with insert
                  await createSeriesWithSlots(proposed.map(s => ({ dateIso: s.dateIso, time: s.time })));
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

      {/* Series conflict modal — fires when pre-flight finds conflicts */}
      <SeriesConflictModal
        open={conflictModalOpen}
        onClose={() => { setConflictModalOpen(false); setDetectedConflicts([]); setPendingSlots([]); }}
        conflicts={detectedConflicts}
        originalSlots={pendingSlots}
        onResolve={async (resolutions: Resolution[]) => {
          setConflictModalOpen(false);
          setIsRecurringSubmitting(true);
          try {
            const finalSlots = resolutions
              .filter(r => r.type !== 'skip')
              .map(r => ({ dateIso: r.dateIso, time: (r as any).time }));
            await createSeriesWithSlots(finalSlots);
          } catch (err: any) {
            toast.error(err.message || 'Failed to create recurring appointments');
          } finally {
            setIsRecurringSubmitting(false);
            setDetectedConflicts([]);
            setPendingSlots([]);
          }
        }}
      />

    </div>
  );
};

export default AdminCalendar;
