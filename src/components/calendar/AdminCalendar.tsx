/**
 * AdminCalendar — the schedule as a calendar (month / week / day).
 *
 * Rendered for BOTH admin roles (super_admin + office_manager) via
 * Dashboard.tsx SECTION_SCREENS["schedule/calendar"]. Shares its header,
 * KPI tiles, chips, lane and pill language with EnhancedAppointmentsTab
 * through ../dashboards/admin/enhanced/scheduleShared.
 *
 * Tiles partition every non-cancelled appointment by WHEN it happens
 * (past due / today / this week / later / done); clicking one both filters
 * the events drawn and jumps the calendar there. Status chips toggle which
 * statuses are drawn (cancelled is off by default, as before). Search trims.
 *
 * Deep links: `?appointment=<id>` opens that visit and jumps to its date
 * (LabOrdersTab / SpecimenTrackingTab / the appointments list link here);
 * `?date=YYYY-MM-DD` just jumps.
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import { blockedDays } from '@/lib/blockedDays';
import { timeBlockAppliesOn } from '@/lib/timeBlocks';
import { gridRange, regularSlots, toBusinessHours } from '@/lib/officeHours';
import { useOfficeHours } from '@/hooks/useOfficeHours';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, CalendarDays, Check, ChevronDown, Eye, Plus, RefreshCw, CalendarOff, Repeat, Search, Trash2, X, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import AppointmentDetailModal from './AppointmentDetailModal';
import ScheduleAppointmentModal from './ScheduleAppointmentModal';
import SeriesConflictModal, { type Resolution } from './SeriesConflictModal';
import AddressAutocomplete from '@/components/ui/address-autocomplete';
import { detectSeriesConflicts, type Conflict, type ProposedSlot } from '@/lib/seriesConflicts';
import {
  apptDateKey, CLOSED_STATUSES, ErrorCard, etDateKey, fmtDateKey, fmtTime12, isOpenStatus, LaneHeader, money,
  patientNameOf, serviceLabel, shortServiceName, StatTiles, STATUS_META, statusMeta, StatusPill, weekBounds,
} from '@/components/dashboards/admin/enhanced/scheduleShared';
import './calendar-styles.css';

// Generated Database types are stale for several tables (time_blocks,
// activity_log, booking_audit_log) — one loose handle, same as LabOrdersTab.
const db = supabase as any;

// ──────────────────────────────────────────────────────────────────
// Calendar buckets — ONE per non-cancelled row, by WHEN it happens. The
// five tiles partition everything that is drawn by default.
// ──────────────────────────────────────────────────────────────────
type CalBucket = 'overdue' | 'today' | 'week' | 'later' | 'done' | 'cancelled';
type CalFilterKey = 'all' | CalBucket;

function calBucket(appt: any, todayKey: string, weekEnd: string): CalBucket {
  if (CLOSED_STATUSES.has(appt.status) || appt.no_show) return 'cancelled';
  const key = apptDateKey(appt);
  if (!key) return 'later';
  if (key < todayKey) return isOpenStatus(appt.status) ? 'overdue' : 'done';
  if (key === todayKey) return 'today';
  if (key <= weekEnd) return 'week';
  return 'later';
}

const CAL_FILTERS: Array<{ key: CalFilterKey; label: string; desc: string }> = [
  { key: 'all', label: 'All', desc: 'Everything on the calendar' },
  { key: 'overdue', label: 'Past due', desc: 'Visit date has passed and it was never completed or cancelled' },
  { key: 'today', label: 'Today', desc: "Today's visits (Eastern time)" },
  { key: 'week', label: 'This week', desc: 'Later this week (Sunday–Saturday)' },
  { key: 'later', label: 'Later', desc: 'After this week' },
  { key: 'done', label: 'Done', desc: 'Completed or specimen delivered' },
];
const CAL_TILE_KEYS: CalFilterKey[] = ['overdue', 'today', 'week', 'later', 'done'];
const CAL_TILE_STYLE: Record<string, string> = {
  overdue: 'border-red-300 bg-red-50 text-red-800',
  today: 'border-amber-300 bg-amber-50 text-amber-800',
  week: 'border-blue-300 bg-blue-50 text-blue-800',
  later: 'border-indigo-300 bg-indigo-50 text-indigo-800',
  done: 'border-gray-300 bg-gray-100 text-gray-800',
};

/** Status chips, in pipeline order. Cancelled is drawn only when toggled on. */
const CHIP_STATUSES = ['scheduled', 'confirmed', 'en_route', 'in_progress', 'completed', 'specimen_delivered', 'cancelled'];

const AdminCalendar: React.FC = () => {
  // One editable source for the shaded window, the grid span and the time
  // pickers below -- see Settings > Office Hours. Falls back to the hours that
  // were hardcoded here, so nothing moves until someone changes them.
  const { hours: officeHours } = useOfficeHours();
  const { slotMinTime, slotMaxTime } = gridRange(officeHours);
  // regularSlots, not allSlots: createRecurring bills a flat
  // prices[serviceType] with no after-hours surcharge, so offering a
  // surcharged start here would under-bill every occurrence in the series.
  const officeTimeOptions = regularSlots(officeHours);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleDefaultDate, setScheduleDefaultDate] = useState<string>('');
  const [lastError, setLastError] = useState<string | null>(null);
  // Tile filter (by when), status chips (which statuses are drawn), search.
  const [filter, setFilter] = useState<CalFilterKey>('all');
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(() => new Set(['cancelled']));
  const [search, setSearch] = useState('');
  const [laneOpen, setLaneOpen] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  // startTime / endTime are optional. When both are blank, the block
  // covers the entire date range (legacy behavior). When set, they
  // restrict the block to that time-of-day window so admins can carve
  // out a single slot (e.g. 6am 5/4) without burning the whole day.
  const [blockForm, setBlockForm] = useState({ startDate: '', endDate: '', startTime: '', endTime: '', reason: '', blockType: 'office_closure' });
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
  // Ref for FullCalendar so we can gotoDate() after a recurring series is created
  const calendarRef = useRef<FullCalendar | null>(null);

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
    // Occurrence count resolution (Lawrence Carpenter bug 2026-07-13): staff
    // cleared the "# Occurrences" box intending "weekly until the end date",
    // and parseInt('' || '1') silently produced a ONE-visit series — the
    // invoice then "totaled" a single $150 draw. Rules now:
    //   - explicit count 1..52 → honored (end date still caps it)
    //   - blank count + end date → FILL the whole range (cap 52)
    //   - blank count + no end date → 0 slots (submit blocks with an error
    //     instead of silently booking one visit)
    const parsed = parseInt(recurringForm.occurrences, 10);
    const hasExplicitCount = Number.isFinite(parsed) && parsed >= 1;
    const occurrences = hasExplicitCount
      ? Math.min(parsed, 52)
      : (recurringForm.endDate ? 52 : 0);
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
    const prices: Record<string, number> = { mobile: 150, 'in-office': 55, senior: 110, therapeutic: 200 };
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
      // Noon-ET anchor so appointment_date column is TZ-stable across renders
      // (matches verify-appointment-checkout pattern). The real-time info stays
      // in appointment_time. Avoids the "appointments stored as UTC midnight
      // render on previous day" class of bug.
      const apptDateTime = `${slot.dateIso}T12:00:00-04:00`;
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

    // Auto-navigate the calendar to the first new appointment's month so the
    // admin immediately SEES what was just created — no more "where did they go?"
    try {
      const firstDateIso = slots[0]?.dateIso;
      if (firstDateIso && calendarRef.current) {
        const api = calendarRef.current.getApi();
        api.gotoDate(firstDateIso);
      }
    } catch (e) { console.warn('[recurring] calendar auto-navigate failed:', e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringForm]);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      // The default PostgREST page is 1000 rows; the table is past 500 and
      // growing, so page explicitly like the appointments list does.
      const all: any[] = [];
      const page = 1000;
      for (let from = 0, guard = 0; guard < 50; guard++, from += page) {
        const { data, error } = await db
          .from('appointments')
          .select('*')
          .order('appointment_date', { ascending: true })
          .order('appointment_time', { ascending: true })
          .range(from, from + page - 1);
        if (error) throw error;
        const chunk = (data as any[]) || [];
        all.push(...chunk);
        if (chunk.length < page) break;
      }
      setAppointments(all);
    } catch (err: any) {
      console.error('Failed to fetch appointments:', err);
      setLastError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const [timeBlocks, setTimeBlocks] = useState<any[]>([]);

  const fetchTimeBlocks = useCallback(async () => {
    const { data } = await db.from('time_blocks').select('*').order('start_date');
    setTimeBlocks(data || []);
  }, []);

  useEffect(() => { fetchAppointments(); fetchTimeBlocks(); }, [fetchAppointments, fetchTimeBlocks]);

  // Realtime: a booking, a phleb status change or a cancellation shows up
  // without a manual refresh.
  useEffect(() => {
    const ch = supabase.channel(`admin-calendar-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'appointments' }, () => fetchAppointments())
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'time_blocks' }, () => fetchTimeBlocks())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAppointments, fetchTimeBlocks]);

  // Keep the open detail in sync with refreshes.
  useEffect(() => {
    if (!selectedAppointment) return;
    const fresh = appointments.find(a => a.id === selectedAppointment.id);
    if (fresh && fresh !== selectedAppointment) setSelectedAppointment(fresh);
  }, [appointments]); // eslint-disable-line react-hooks/exhaustive-deps

  const gotoDate = useCallback((key: string, view?: string) => {
    try {
      const api = calendarRef.current?.getApi();
      if (!api) return;
      if (view && api.view.type !== view) api.changeView(view, key);
      else api.gotoDate(key);
    } catch (e) { console.warn('[calendar] navigate failed:', e); }
  }, []);

  // Deep links: ?appointment=<id> opens the visit and jumps to its date;
  // ?date=YYYY-MM-DD just jumps. Consumed once, then stripped from the URL.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || loading) return;
    const apptId = searchParams.get('appointment');
    const date = searchParams.get('date');
    if (!apptId && !date) return;
    deepLinkDone.current = true;
    if (apptId) {
      const appt = appointments.find(a => a.id === apptId);
      if (appt) {
        const key = apptDateKey(appt);
        if (key) setTimeout(() => gotoDate(key, 'timeGridDay'), 0);
        if (CLOSED_STATUSES.has(appt.status)) setHiddenStatuses(prev => { const n = new Set(prev); n.delete('cancelled'); return n; });
        setSelectedAppointment(appt);
        setDetailModalOpen(true);
      } else {
        toast.error('That appointment is not on the calendar (it may have been deleted).');
      }
    } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setTimeout(() => gotoDate(date), 0);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('appointment'); next.delete('date');
    setSearchParams(next, { replace: true });
  }, [loading, appointments, searchParams, setSearchParams, gotoDate]);

  const getPatientName = (appt: any): string => patientNameOf(appt);

  // ── Buckets, counts, visibility ──────────────────────────────────
  const todayKey = etDateKey();
  const weekEnd = weekBounds(todayKey).end;
  const bucketOf = useMemo(() => {
    const m = new Map<string, CalBucket>();
    for (const a of appointments) m.set(a.id, calBucket(a, todayKey, weekEnd));
    return m;
  }, [appointments, todayKey, weekEnd]);

  const tileCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0, overdue: 0, today: 0, week: 0, later: 0, done: 0 };
    for (const a of appointments) {
      const b = bucketOf.get(a.id)!;
      if (b === 'cancelled') continue;
      c.all++; c[b]++;
    }
    return c;
  }, [appointments, bucketOf]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of appointments) {
      if (filter !== 'all' && bucketOf.get(a.id) !== filter) continue;
      const s = a.status || 'unknown';
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [appointments, bucketOf, filter]);

  const overdueRows = useMemo(() =>
    appointments.filter(a => bucketOf.get(a.id) === 'overdue')
      .sort((a, b) => apptDateKey(a).localeCompare(apptDateKey(b))),
  [appointments, bucketOf]);

  const upcomingBlocks = useMemo(() =>
    timeBlocks.filter((b: any) => (b.end_date || b.start_date) >= todayKey)
      .sort((a: any, b: any) => String(a.start_date).localeCompare(String(b.start_date))),
  [timeBlocks, todayKey]);

  const q = search.trim().toLowerCase();
  const matchesSearch = (a: any) => q === '' ||
    [patientNameOf(a), a.patient_email, a.patient_phone, a.address, a.service_name, a.service_type]
      .some(h => (h || '').toString().toLowerCase().includes(q));

  const pickTile = (k: string, isActive: boolean) => {
    const next = isActive ? 'all' : (k as CalFilterKey);
    setFilter(next);
    if (next === 'all') return;
    const first = appointments
      .filter(a => bucketOf.get(a.id) === next && matchesSearch(a))
      .map(apptDateKey).filter(Boolean).sort();
    if (next === 'today') gotoDate(todayKey, 'timeGridDay');
    else if (next === 'week') gotoDate(todayKey, 'timeGridWeek');
    else if (next === 'overdue' || next === 'done') { if (first.length) gotoDate(first[first.length - 1], 'dayGridMonth'); }
    else if (first.length) gotoDate(first[0], 'dayGridMonth');
  };

  const toggleStatus = (s: string) => setHiddenStatuses(prev => {
    const n = new Set(prev);
    if (n.has(s)) n.delete(s); else n.add(s);
    return n;
  });

  // Close out a past-due visit straight from the lane.
  const closeOut = useCallback(async (appt: any, status: 'completed' | 'cancelled') => {
    if (status === 'cancelled' && !window.confirm(`Cancel ${patientNameOf(appt)}'s visit from ${fmtDateKey(apptDateKey(appt))}?`)) return;
    const patch: Record<string, any> = { status };
    if (status === 'cancelled') patch.cancelled_at = new Date().toISOString();
    else patch.completion_time = new Date().toISOString();
    const { error } = await db.from('appointments').update(patch).eq('id', appt.id);
    if (error) { toast.error(`Couldn't update: ${error.message}`); return; }
    setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, ...patch } : a));
    toast.success(`${patientNameOf(appt)} → ${statusMeta(status).label}`);
  }, []);

  const removeBlock = useCallback(async (blockId: string, title: string) => {
    // Removing deletes the whole block row, i.e. EVERY date it covers —
    // say so, rather than implying only the clicked day reopens.
    const row: any = timeBlocks.find((b: any) => b.id === blockId);
    const weekday = String(row?.recurring_day || '').replace(/^./, (c: string) => c.toUpperCase());
    const scope = row?.recurring
      ? `This removes the weekly block on every ${weekday}${row.end_date && row.end_date > row.start_date ? ` through ${row.end_date}` : ''}.`
      : row?.end_date && row.end_date !== row.start_date
        ? `This removes the block on every day from ${row.start_date} to ${row.end_date}.`
        : 'Slots in this window will become bookable again.';
    if (!window.confirm(`${title}\n\nRemove this block? ${scope}\n\nTo book one patient inside a block without removing it, use New appointment and tick "Override Availability".`)) return;
    const { error } = await db.from('time_blocks').delete().eq('id', blockId);
    if (error) toast.error(`Couldn't remove block: ${error.message}`);
    else { toast.success('Block removed — slots reopened.'); fetchTimeBlocks(); }
  }, [fetchTimeBlocks, timeBlocks]);

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
    const shortService = appt.service_name ? shortServiceName(appt.service_name) : serviceLabel(appt);

    return (
      <div style={{ overflow: 'hidden', height: '100%' }}>
        <div className="fc-event-content-time">{eventInfo.timeText}</div>
        <div className="fc-event-content-name">{eventInfo.event.title}</div>
        <div className="fc-event-content-service">{shortService}</div>
      </div>
    );
  };

  // Visibility: status chips (cancelled off by default), the active tile and
  // the search box all narrow what is drawn.
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const [currentView, setCurrentView] = useState(isMobile ? 'timeGridDay' : 'timeGridWeek');
  const nonCancelled = appointments.filter(a =>
    !hiddenStatuses.has(a.status) &&
    (filter === 'all' || bucketOf.get(a.id) === filter) &&
    matchesSearch(a),
  );

  // Family-group dedupe: when a household books multiple patients in the
  // same visit, the modal creates one primary row + one row per companion
  // (linked by family_group_id, companion_role set on the children). The
  // calendar should show ONE block at the visit time with all patient names
  // — not a separate event per patient.
  // Convention: primary row has id === family_group_id (or family_group_id NULL).
  // Companion rows have family_group_id pointing to the primary's id.
  const companionsByGroup = new Map<string, string[]>();
  for (const a of nonCancelled) {
    if (a.family_group_id && a.id !== a.family_group_id && a.companion_role) {
      const list = companionsByGroup.get(a.family_group_id) || [];
      list.push(a.patient_name || 'Companion');
      companionsByGroup.set(a.family_group_id, list);
    }
  }
  const visibleAppointments = nonCancelled.filter(a =>
    !a.family_group_id || a.id === a.family_group_id || !a.companion_role
  );

  // Convert appointments to FullCalendar events
  const calendarEvents = visibleAppointments.map(appt => {
    const name = getPatientName(appt);
    // Companion names are intentionally NOT appended — the calendar shows
    // the primary patient only. Companion rows are filtered out above
    // (companionsByGroup), and their info is available on the appointment
    // detail modal for clinical/billing context.
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

    return {
      id: appt.id,
      title: name,
      start: startStr,
      end: endStr,
      allDay: !appt.appointment_time,
      className: `fc-event-${appt.status}`,
      backgroundColor: statusMeta(appt.status).color,
      borderColor: 'transparent',
      extendedProps: { appointment: appt },
    };
  });

  // Convert "6:00 PM" / "6:00 AM" → "HH:MM:SS" for ISO datetime composition.
  const time12to24 = (t: string | null | undefined): string | null => {
    if (!t) return null;
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/.exec(String(t).trim());
    if (!m) {
      // Already 24h "HH:MM" or "HH:MM:SS" — pass through padded to seconds
      const h24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(t).trim());
      if (h24) return `${h24[1].padStart(2, '0')}:${h24[2]}:00`;
      return null;
    }
    let h = parseInt(m[1], 10);
    const period = m[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]}:00`;
  };

  // Render blocks correctly based on whether they're partial-day or full-day.
  //   - start_time + end_time SET   → timed band (only the blocked hours grey)
  //   - start_time + end_time NULL  → all-day background covering the whole date
  // Pre-fix bug (Tuesday 5/19 case): every block rendered allDay=true regardless
  // of times, so a 12:30 PM–8:00 PM block painted the entire day red and staff
  // had no idea why the morning was also greyed.
  // Which dates a block actually lands on. One-off blocks: every day of the
  // stored range. Recurring blocks: only their weekday (timeBlockAppliesOn,
  // the same rule the booking engine uses), from start_date on. Before this,
  // the five Mon–Fri 6:15–7:45 rows (one per weekday, same range) were each
  // drawn on EVERY day of the range — five stacked bands on every date,
  // Saturdays included — while bookings correctly honoured the weekday.
  // A recurring row saved with end_date == start_date repeats open-ended, so
  // walk a one-year horizon for it.
  const blockDates = (block: any): string[] => {
    if (!block.recurring) return blockedDays(block.start_date, block.end_date);
    let end = block.end_date;
    if (!end || end <= block.start_date) {
      const d = new Date(`${block.start_date}T12:00:00`);
      d.setDate(d.getDate() + 365);
      end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return blockedDays(block.start_date, end).filter((day) => timeBlockAppliesOn(block, day));
  };

  const blockEvents = timeBlocks.flatMap((block: any) => {
    const start24 = time12to24(block.start_time);
    const end24 = time12to24(block.end_time);
    const isPartial = !!(start24 && end24);
    const reasonLine = block.reason ? `: ${block.reason}` : '';
    const timeLine = isPartial ? ` (${block.start_time}–${block.end_time})` : '';
    const title = `🚫 BLOCKED${reasonLine}${timeLine}`;

    if (isPartial) {
      // ONE BAND PER DAY. A time window on a multi-day block means "these
      // hours, on each of those days" — not one unbroken stretch from the
      // first morning to the last.
      //
      // Built as a single event it ran start_date T07:00 → end_date T08:45,
      // which FullCalendar draws as a continuous band covering every hour in
      // between: a Mon–Fri 7:00–8:45 block painted the whole working week
      // solid red, and the recurring "transport mom" blocks did it every week.
      // (The 5/19 fix above separated timed from all-day, but both branches
      // still assumed a block lived on one date.)
      //
      // Dates are walked at NOON LOCAL for the same reason the appointment
      // list does it: parsing 'YYYY-MM-DD' alone lands on UTC midnight, which
      // is the previous day for a US-East user.
      const days = blockDates(block);

      return days.map(day => ({
        id: `block-${block.id}-${day}`,
        title,
        start: `${day}T${start24}`,
        end: `${day}T${end24}`,
        allDay: false,
        backgroundColor: '#fecaca',
        borderColor: '#ef4444',
        textColor: '#7f1d1d',
        classNames: ['fc-blocked-date'],
        extendedProps: { isBlock: true, reason: block.reason, partial: true, start_time: block.start_time, end_time: block.end_time },
      }));
    }

    // Recurring full-day block (e.g. "closed every Sunday"): one all-day
    // background + label per matching date, not one span over the range.
    if (block.recurring) {
      return blockDates(block).flatMap((day) => [
        {
          id: `block-${block.id}-${day}`,
          title, start: day, allDay: true, display: 'background',
          backgroundColor: '#fecaca', borderColor: '#ef4444', classNames: ['fc-blocked-date'],
          extendedProps: { isBlock: true, reason: block.reason, partial: false },
        },
        {
          id: `block-label-${block.id}-${day}`,
          title, start: day, allDay: true,
          backgroundColor: '#ef4444', borderColor: '#dc2626', textColor: '#ffffff',
          extendedProps: { isBlock: true, reason: block.reason },
        },
      ]);
    }

    // Full-day block — covers the whole date as a background event + a
    // visible all-day label strip so staff sees the reason at a glance.
    const inclusiveEnd = block.end_date
      ? new Date(new Date(block.end_date + 'T00:00:00').getTime() + 86400000).toISOString().split('T')[0]
      : block.start_date;
    return [
      {
        id: `block-${block.id}`,
        title,
        start: block.start_date,
        end: inclusiveEnd,
        allDay: true,
        display: 'background',
        backgroundColor: '#fecaca',
        borderColor: '#ef4444',
        classNames: ['fc-blocked-date'],
        extendedProps: { isBlock: true, reason: block.reason, partial: false },
      },
      {
        id: `block-label-${block.id}`,
        title,
        start: block.start_date,
        end: inclusiveEnd,
        allDay: true,
        backgroundColor: '#ef4444',
        borderColor: '#dc2626',
        textColor: '#ffffff',
        extendedProps: { isBlock: true, reason: block.reason },
      },
    ];
  });

  // No separate blockLabelEvents — partial blocks render their own band with
  // title; full-day blocks include the label strip in blockEvents above.
  const blockLabelEvents: any[] = [];

  const allEvents = [...calendarEvents, ...blockEvents, ...blockLabelEvents];

  const handleEventClick = (info: any) => {
    // Block events: clicking offers to REMOVE the block (this is how you
    // unblock a slot/date — previously clicking just showed a toast with no
    // way to delete it).
    if (info.event.extendedProps.isBlock) {
      const rawId = String(info.event.id || '');
      // Timed bands are drawn one per day with ids `block-<uuid>-YYYY-MM-DD`;
      // strip both affixes or the delete targets a malformed id.
      const blockId = rawId.replace(/^block-(label-)?/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
      if (!blockId) { toast.info(info.event.title); return; }
      removeBlock(blockId, info.event.title);
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
      // Pre-flight conflict check — drag had no guardrails; admin could
      // drop an appt on top of another and the double-booking detector would
      // fire patient apology credits because the override wasn't flagged.
      const newDateOnly = newDateStr;
      const newSlotMin = h * 60 + m;
      const { data: conflictRows } = await supabase
        .from('appointments')
        .select('id, patient_name, appointment_time, duration_minutes')
        .gte('appointment_date', `${newDateOnly}T00:00:00`)
        .lte('appointment_date', `${newDateOnly}T23:59:59`)
        .in('status', ['scheduled', 'confirmed', 'en_route', 'arrived', 'in_progress'])
        .neq('id', appt.id);
      const conflictsAt = (conflictRows || []).filter((r: any) => {
        const t = String(r.appointment_time || '');
        const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
        let sMin = -1;
        if (ampm) {
          let hh = parseInt(ampm[1], 10);
          const mm = parseInt(ampm[2], 10);
          if (ampm[3].toUpperCase() === 'PM' && hh !== 12) hh += 12;
          if (ampm[3].toUpperCase() === 'AM' && hh === 12) hh = 0;
          sMin = hh * 60 + mm;
        } else {
          const mil = /^(\d{1,2}):(\d{2})/.exec(t.trim());
          if (mil) sMin = parseInt(mil[1], 10) * 60 + parseInt(mil[2], 10);
        }
        if (sMin < 0) return false;
        const dur = r.duration_minutes || 60;
        return newSlotMin >= sMin && newSlotMin < sMin + dur;
      });
      if (conflictsAt.length > 0) {
        const conflictNames = conflictsAt.map((c: any) => c.patient_name || 'patient').join(', ');
        if (!window.confirm(`This slot already has: ${conflictNames}. Drop on top anyway? (Both appointments will keep this time — phleb will see overlap.)`)) {
          info.revert();
          return;
        }
      }

      const { error } = await supabase
        .from('appointments')
        .update({
          appointment_date: newDateTimestamp,
          appointment_time: newTimeStr,
          rescheduled_at: new Date().toISOString(),
          // Suppress false apology credits — admin moved the appt
          // intentionally, not a system double-booking.
          booking_source: 'manual_reschedule',
        })
        .eq('id', appt.id);

      if (error) throw error;

      // Log activity + booking audit trail (drag had zero audit trail before)
      try {
        await db.from('activity_log').insert({
          patient_id: appt.patient_id || null,
          activity_type: 'reschedule',
          description: `Appointment drag-rescheduled to ${newDateStr} at ${newTimeStr}${conflictsAt.length > 0 ? ` (overlapping ${conflictsAt.length} other)` : ''}`,
          performed_by: 'admin',
          appointment_id: appt.id,
        });
      } catch { /* non-fatal */ }
      try {
        await db.from('booking_audit_log').insert({
          stage: 'admin_drag_reschedule',
          patient_email: appt.patient_email || null,
          patient_phone: appt.patient_phone || null,
          patient_name: appt.patient_name || null,
          client_appointment_date: appt.appointment_date || null,
          client_appointment_time: appt.appointment_time || null,
          server_appointment_date: newDateStr,
          server_appointment_time: newTimeStr,
          raw_payload: { drag: true, conflicts: conflictsAt.map((c: any) => ({ id: c.id, name: c.patient_name, time: c.appointment_time })) },
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
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900">
            <CalendarDays className="h-6 w-6 text-[#B91C1C]" aria-hidden="true" />
            Calendar
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Drag to reschedule, click a day to book, click a visit to manage it — updates in real time.
            {tileCounts.overdue > 0 && <span className="ml-1 font-medium text-red-700">{tileCounts.overdue} past due and never closed out.</span>}
            {tileCounts.overdue === 0 && tileCounts.today > 0 && <span className="ml-1 font-medium text-amber-700">{tileCounts.today} today.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { fetchAppointments(); fetchTimeBlocks(); }} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-10 sm:h-9" onClick={() => setBlockModalOpen(true)}>
            <CalendarOff className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Block time</span>
            {upcomingBlocks.length > 0 && <span className="rounded-full bg-red-100 text-red-800 px-1.5 text-[10px] font-bold">{upcomingBlocks.length}</span>}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-10 sm:h-9" onClick={() => setRecurringModalOpen(true)}>
            <Repeat className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Recurring series</span>
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-10 sm:h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white"
            onClick={() => { setScheduleDefaultDate(''); setScheduleModalOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New appointment
          </Button>
        </div>
      </div>

      {/* Stat tiles — click to filter AND jump the calendar there. The five
          tiles partition every non-cancelled appointment. */}
      <StatTiles
        keys={CAL_TILE_KEYS}
        defs={CAL_FILTERS}
        counts={tileCounts}
        active={filter}
        loading={loading && appointments.length === 0}
        styles={CAL_TILE_STYLE}
        hotKey="overdue"
        onPick={pickTile}
        ariaLabel="Appointment counts by when"
        cols={5}
      />

      {lastError && <ErrorCard title="Couldn't load the calendar" message={lastError} onRetry={fetchAppointments} />}

      {/* Needs action lane — past-due visits never closed out. */}
      {overdueRows.length > 0 && (filter === 'all' || filter === 'overdue') && (
        <section aria-labelledby="lane-overdue" className="rounded-lg border border-red-200 bg-red-50/40 p-3">
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => setLaneOpen(o => !o)} aria-expanded={laneOpen} aria-controls="lane-overdue-list" aria-label={laneOpen ? 'Collapse' : 'Expand'} className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-100 flex-shrink-0">
              <ChevronDown className={cn('h-4 w-4 text-red-700 transition', !laneOpen && '-rotate-90')} aria-hidden="true" />
            </button>
            <div className="flex-1 min-w-0 [&>div]:mb-0">
              <LaneHeader id="lane-overdue" title="Needs action" count={overdueRows.length} tone="red" hint="past-due visits still marked open — close them out so stats, payouts and reminders stay right" />
            </div>
          </div>
          {laneOpen && (
            <ul id="lane-overdue-list" className="mt-2 space-y-1.5">
              {overdueRows.slice(0, 8).map(a => (
                <li key={a.id} className="rounded-md border border-gray-200 bg-white px-3 py-2 flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{patientNameOf(a)}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {fmtDateKey(apptDateKey(a), { weekday: 'short', month: 'short', day: 'numeric' })}{fmtTime12(a.appointment_time) ? ` · ${fmtTime12(a.appointment_time)}` : ''} · {serviceLabel(a)} · {money(a.total_amount)}
                    </p>
                  </div>
                  <StatusPill status={a.status} />
                  <div className="flex items-center gap-1 w-full sm:w-auto">
                    <Button size="sm" className="h-9 text-xs gap-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white flex-1 sm:flex-none" onClick={() => closeOut(a, 'completed')}>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Completed
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs gap-1 text-red-700" onClick={() => closeOut(a, 'cancelled')}>
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label={`Open ${patientNameOf(a)}`} onClick={() => { setSelectedAppointment(a); setDetailModalOpen(true); }}>
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
              {overdueRows.length > 8 && (
                <li className="text-[11px] text-gray-500 px-1">
                  {overdueRows.length - 8} more — use <button type="button" className="underline font-semibold" onClick={() => pickTile('overdue', false)}>Past due</button> or the All appointments list.
                </li>
              )}
            </ul>
          )}
        </section>
      )}

      {/* Search + status chips (toggle which statuses are drawn) */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Find a patient on the calendar — name, phone, email, address…"
            aria-label="Search calendar"
            className="h-10 sm:h-9 pl-8 text-sm"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap" role="group" aria-label="Statuses shown">
          <span className="text-[11px] text-gray-500 whitespace-nowrap mr-0.5">Show</span>
          {CHIP_STATUSES.map(s => {
            const on = !hiddenStatuses.has(s);
            const meta = STATUS_META[s];
            const n = statusCounts[s] || 0;
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={on}
                title={on ? `Hide ${meta.label.toLowerCase()} visits` : `Show ${meta.label.toLowerCase()} visits`}
                className={cn(
                  'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                  on ? 'bg-white text-gray-800 border-gray-300' : 'bg-gray-50 text-gray-400 border-gray-200 line-through decoration-gray-300',
                )}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: meta.color, opacity: on ? 1 : 0.35 }} aria-hidden="true" />
                {meta.label}
                <span className={cn('tabular-nums', on ? 'text-gray-500' : 'text-gray-400')}>{n}</span>
              </button>
            );
          })}
          {(filter !== 'all' || search) && (
            <button type="button" onClick={() => { setFilter('all'); setSearch(''); }} className="h-9 px-3 text-xs font-medium text-[#B91C1C] whitespace-nowrap">
              Clear filter
            </button>
          )}
        </div>
      </div>

      {/* Calendar */}
      <Card className="border shadow-sm">
        <CardContent className="p-2 sm:p-3">
          {loading && appointments.length === 0 ? (
            <div className="flex flex-col justify-center items-center py-20 gap-3" aria-busy="true" aria-label="Loading calendar">
              <div className="w-8 h-8 border-2 border-[#B91C1C] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-gray-500">Loading the calendar…</p>
            </div>
          ) : (
            <FullCalendar
              ref={calendarRef}
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
              slotMinTime={slotMinTime}
              slotMaxTime={slotMaxTime}
              slotDuration="00:30:00"
              allDaySlot={false}
              weekends={true}
              businessHours={toBusinessHours(officeHours)}
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

      <p className="text-[11px] text-gray-400">
        Drawing {calendarEvents.length} of {appointments.length} appointment{appointments.length === 1 ? '' : 's'}
        {filter !== 'all' ? ` · ${CAL_FILTERS.find(f => f.key === filter)?.label}` : ''}
        {q ? ` · matching “${search.trim()}”` : ''}
        {hiddenStatuses.size > 0 ? ` · hiding ${Array.from(hiddenStatuses).map(s => statusMeta(s).label.toLowerCase()).join(', ')}` : ''}
        {' · '}{timeBlocks.length} block{timeBlocks.length === 1 ? '' : 's'} · times in Eastern
        {!loading && appointments.length > 0 && calendarEvents.length === 0 && (
          <> · <button type="button" className="underline text-[#B91C1C] font-semibold" onClick={() => { setFilter('all'); setSearch(''); setHiddenStatuses(new Set(['cancelled'])); }}>nothing matches — reset</button></>
        )}
      </p>

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

            {/* Optional time-of-day window — leave blank to block the
                entire day(s). Useful for "I can't do 6am tomorrow" style
                surgical blocks instead of taking the whole day off. */}
            <div className="rounded-lg border border-dashed border-gray-300 p-3 bg-gray-50">
              <p className="text-xs text-gray-600 mb-2">
                <strong>Optional:</strong> block a specific time window only. Leave blank to block the entire day(s).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Start Time</Label>
                  <Input
                    type="time"
                    value={blockForm.startTime}
                    onChange={e => setBlockForm(p => ({ ...p, startTime: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">End Time</Label>
                  <Input
                    type="time"
                    value={blockForm.endTime}
                    onChange={e => setBlockForm(p => ({ ...p, endTime: e.target.value }))}
                  />
                </div>
              </div>
              {blockForm.startTime && !blockForm.endTime && (
                <p className="text-[11px] text-amber-700 mt-1.5">⚠ Add an end time too, or both fields will be ignored.</p>
              )}
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
                  // Convert HH:MM (24h) → "h:mm AM/PM" to match the
                  // format the rest of the slot-availability logic
                  // expects (parseTime in the booking flow + edge fns).
                  const to12h = (hhmm: string): string | null => {
                    if (!hhmm) return null;
                    const [hStr, mStr] = hhmm.split(':');
                    const h = parseInt(hStr, 10);
                    const m = parseInt(mStr, 10);
                    if (isNaN(h) || isNaN(m)) return null;
                    const period = h >= 12 ? 'PM' : 'AM';
                    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
                    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
                  };
                  const startTime12 = to12h(blockForm.startTime);
                  const endTime12 = to12h(blockForm.endTime);
                  // Only persist time fields when BOTH are valid — partial
                  // input gets ignored (warned in UI above).
                  const useTimeWindow = !!(startTime12 && endTime12);

                  // Gap #4 fix (2026-05-18): warn the admin if existing
                  // appointments fall inside the block they're about to
                  // create. Pre-fix, the block went in silently and any
                  // patient already booked in that window stayed scheduled
                  // — phleb would either no-show or have to be there
                  // anyway. Now we surface the conflicts BEFORE the insert
                  // so admin can either reschedule them first or
                  // explicitly acknowledge the override.
                  const overlapStartIso = `${blockForm.startDate}T00:00:00`;
                  const overlapEndIso = `${blockForm.endDate}T23:59:59`;
                  const { data: conflicting } = await supabase.from('appointments')
                    .select('id, patient_name, appointment_date, appointment_time, service_type')
                    .gte('appointment_date', overlapStartIso)
                    .lte('appointment_date', overlapEndIso)
                    .not('status', 'in', '("cancelled","no_show")');

                  // Helper: 12h parser identical to slot-blocking logic so
                  // window math agrees across the codebase.
                  const parse12 = (s: string | null | undefined): number | null => {
                    if (!s) return null;
                    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(s).trim());
                    if (!m) return null;
                    let h = parseInt(m[1], 10);
                    const mm = parseInt(m[2], 10);
                    if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
                    if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
                    return h * 60 + mm;
                  };
                  const blkStart = parse12(startTime12);
                  const blkEnd = parse12(endTime12);
                  const conflicts = (conflicting || []).filter((a: any) => {
                    if (!useTimeWindow) return true; // full-day block hits every appt that day
                    if (!a.appointment_time) return true; // unknown time → assume conflict
                    const tRaw = String(a.appointment_time);
                    // appointment_time may be "11:30:00" (24h) or "11:30 AM" (12h)
                    let apptMin: number | null = null;
                    const m24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(tRaw.trim());
                    if (m24) {
                      apptMin = parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
                    } else {
                      apptMin = parse12(tRaw);
                    }
                    if (apptMin === null || blkStart === null || blkEnd === null) return true;
                    return apptMin >= blkStart && apptMin < blkEnd;
                  });

                  if (conflicts.length > 0) {
                    const list = conflicts.slice(0, 5).map((a: any) =>
                      `• ${String(a.patient_name || 'Unknown')} — ${String(a.appointment_time || '?').slice(0, 5)} (${a.service_type || 'visit'})`
                    ).join('\n');
                    const extra = conflicts.length > 5 ? `\n…and ${conflicts.length - 5} more` : '';
                    const ok = window.confirm(
                      `⚠️ ${conflicts.length} appointment${conflicts.length === 1 ? '' : 's'} will be inside this block:\n\n${list}${extra}\n\n` +
                      `Continuing will leave these scheduled — you'll need to reschedule them manually.\n\n` +
                      `Block anyway?`
                    );
                    if (!ok) {
                      setIsBlockSubmitting(false);
                      return;
                    }
                  }

                  const { error } = await db.from('time_blocks').insert({
                    start_date: blockForm.startDate, end_date: blockForm.endDate,
                    reason: blockForm.reason || 'Blocked', block_type: blockForm.blockType,
                    ...(useTimeWindow ? { start_time: startTime12, end_time: endTime12 } : {}),
                  }).select();
                  if (error) throw error;
                  const conflictsNote = conflicts.length > 0
                    ? ` · ⚠ ${conflicts.length} overlapping appt${conflicts.length === 1 ? '' : 's'} — reschedule manually`
                    : '';
                  toast.success((useTimeWindow
                    ? `Blocked ${startTime12}–${endTime12} on ${blockForm.startDate}`
                    : 'Dates blocked successfully') + conflictsNote);
                  setBlockForm({ startDate: '', endDate: '', startTime: '', endTime: '', reason: '', blockType: 'office_closure' });
                  setBlockModalOpen(false);
                  fetchTimeBlocks();
                  fetchAppointments();
                } catch (err: any) { toast.error(err.message || 'Failed to block dates'); }
                finally { setIsBlockSubmitting(false); }
              }}>
              {isBlockSubmitting ? 'Blocking...' : 'Block Dates'}
            </Button>

            {/* Upcoming blocks — the only other way to remove one was to find
                and click its band on the calendar. */}
            <div className="border-t border-gray-200 pt-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">
                Upcoming blocks <span className="text-gray-400 font-normal normal-case tracking-normal">· {upcomingBlocks.length}</span>
              </p>
              {upcomingBlocks.length === 0 ? (
                <p className="text-xs text-gray-500">Nothing blocked from today on.</p>
              ) : (
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {upcomingBlocks.map((b: any) => {
                    const span = b.end_date && b.end_date !== b.start_date
                      ? `${fmtDateKey(b.start_date, { month: 'short', day: 'numeric' })} – ${fmtDateKey(b.end_date, { month: 'short', day: 'numeric' })}`
                      : fmtDateKey(b.start_date, { weekday: 'short', month: 'short', day: 'numeric' });
                    const window_ = b.start_time && b.end_time ? `${b.start_time}–${b.end_time}` : 'all day';
                    const title = `🚫 BLOCKED${b.reason ? `: ${b.reason}` : ''}${b.start_time && b.end_time ? ` (${window_})` : ''}`;
                    return (
                      <li key={b.id} className="flex items-center gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-800 truncate">{span} <span className="text-gray-500 font-normal">· {window_}</span></p>
                          <p className="text-[11px] text-gray-500 truncate">{b.reason || 'Blocked'}{b.block_type === 'time_off' ? ' · staff time off' : ''}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-500 hover:text-red-700" aria-label="Remove block" onClick={() => removeBlock(b.id, title)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
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
                    <SelectItem value="senior">Senior 65+ ($110)</SelectItem>
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
                    {officeTimeOptions.map(t =>
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

            {recurringForm.startDate && recurringForm.time && (() => {
              // Preview from the ACTUAL computed slot list — the same list the
              // create button books — never from the raw occurrences string.
              // (The raw string showed "4" while a cleared box booked 1 visit
              // and invoiced $150 for a whole weekly series.)
              const slots = computeProposedSlots();
              const n = slots.length;
              const prices: Record<string, number> = { mobile: 150, 'in-office': 55, senior: 110, therapeutic: 200 };
              const p = prices[recurringForm.serviceType] || 150;
              const full = p * n;
              return (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-semibold">
                  Preview: {n} appointment{n === 1 ? '' : 's'}
                  {n > 0 && <span className="font-normal text-muted-foreground"> · {slots[0].dateIso} → {slots[n - 1].dateIso}</span>}
                </p>
                {n === 0 && (
                  <p className="text-[#B91C1C] font-medium">Enter a # of occurrences or an end date to build the series.</p>
                )}
                {n === 1 && (
                  <p className="text-amber-700 font-medium">⚠ Only ONE visit will be booked (and invoiced). For a weekly series, raise # Occurrences or set a later end date.</p>
                )}
                <p className="text-muted-foreground">
                  {recurringForm.frequency === 'weekly' ? 'Every week' : recurringForm.frequency === 'biweekly' ? 'Every 2 weeks' : recurringForm.frequency === 'monthly' ? 'Every month' : 'Every 2 months'}
                  {' '}starting {recurringForm.startDate} at {recurringForm.time}
                </p>
                {!recurringForm.waiveFee && recurringForm.paymentMode === 'prepaid_bundle' && n > 0 && (
                  <p className="mt-1 font-medium text-emerald-700">
                    {(() => {
                      const disc = full * (BUNDLE_DISCOUNT_PCT / 100);
                      return `Prepaid: $${(full - disc).toFixed(2)} (saves $${disc.toFixed(2)} vs $${full.toFixed(2)} list)`;
                    })()}
                  </p>
                )}
                {!recurringForm.waiveFee && recurringForm.paymentMode === 'per_visit' && n > 0 && (
                  <p className="font-medium text-[#B91C1C]">
                    Total: ${full.toFixed(2)} ({n} × ${p.toFixed(2)} — invoice sent to patient)
                  </p>
                )}
              </div>
              );
            })()}

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
              {isRecurringSubmitting
                ? 'Creating...'
                : (() => {
                    const n = recurringForm.startDate ? computeProposedSlots().length : 0;
                    return n > 0 ? `Create ${n} Appointment${n === 1 ? '' : 's'}` : 'Create Appointments';
                  })()}
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
