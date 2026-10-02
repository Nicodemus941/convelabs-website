/**
 * EnhancedAppointmentsTab — every appointment, in one list.
 *
 * Rendered for BOTH admin roles (super_admin + office_manager) via
 * Dashboard.tsx SECTION_SCREENS["schedule/appointments"]. Owner-only bits
 * (CSV export, revenue strip, bulk "Mark paid") gate on `super_admin` inside
 * this file, mirroring LabOrdersTab / SpecimenTrackingTab.
 *
 * Every row maps to exactly ONE bucket (deriveApptBucket in scheduleShared):
 *   overdue   → visit date passed, still scheduled/confirmed/en_route/in_progress
 *   today     → today's visit (Eastern) still open
 *   upcoming  → future date, open
 *   completed → completed / specimen_delivered
 *   cancelled → cancelled / no-show
 * so the stat tiles, the chips and the list always agree. Range / service /
 * status selects narrow the population the tiles count over; search only
 * trims the list.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DayPicker } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  CalendarDays, CalendarIcon, Check, ChevronDown, ChevronRight, Copy, DollarSign, Download, ExternalLink, Eye,
  Mail, MapPin, MessageSquare, MoreHorizontal, Phone, Plus, RefreshCw, Search, X, XCircle, Navigation,
} from 'lucide-react';
import AppointmentDetailModal from '@/components/calendar/AppointmentDetailModal';
import ScheduleAppointmentModal from '@/components/calendar/ScheduleAppointmentModal';
import {
  APPT_FILTERS, APPT_TILE_KEYS, APPT_TILE_STYLE, BUCKET_META, NEEDS_ACTION, type ApptBucket, type ApptFilterKey,
  apptDateKey, deriveApptBucket, downloadCsv, EmptyState, ErrorCard, etDateKey, FilterChips, fmtDateKey, fmtTime12,
  isOpenStatus, isUnpaid, LaneHeader, LoadingRows, money, patientNameOf, PaymentPill, rowKeyHandler, serviceLabel,
  serviceTypeLabel, shiftKey, StatTiles, statusMeta, StatusPill, weekBounds, DONE_STATUSES,
} from './scheduleShared';

// Generated Database types are stale for several columns; one loose handle,
// same as LabOrdersTab.
const db = supabase as any;

const SELECT_COLUMNS = [
  'id', 'patient_id', 'patient_name', 'patient_email', 'patient_phone', 'appointment_date', 'appointment_time',
  'duration_minutes', 'status', 'service_type', 'service_name', 'address', 'zipcode', 'total_amount', 'tip_amount',
  'payment_status', 'invoice_status', 'booking_source', 'phlebotomist_id', 'notes', 'no_show', 'family_group_id',
  'companion_role', 'recurrence_group_id', 'recurrence_sequence', 'recurrence_total', 'organization_id',
  'cancelled_at', 'completion_time', 'patient_confirmed_at', 'fasting_required', 'lab_destination',
  'created_at', 'updated_at',
].join(', ');

type RangeKey = 'today' | 'week' | 'month' | 'all';
const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

interface RowHandlers {
  isSuperAdmin: boolean;
  calendarHref: (a: any) => string;
  onOpen: (a: any) => void;
  onStatus: (a: any, status: string) => void;
  onCancel: (a: any) => void;
}

const EnhancedAppointmentsTab: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const basePath = `/dashboard/${user?.role === 'office_manager' ? 'office_manager' : 'super_admin'}`;
  const isSuperAdmin = user?.role === 'super_admin';

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const [filter, setFilter] = useState<ApptFilterKey>('all');
  const [range, setRange] = useState<RangeKey>(() => {
    try { return (localStorage.getItem('convelabs_appts_range') as RangeKey) || 'all'; } catch { return 'all'; }
  });
  useEffect(() => { try { localStorage.setItem('convelabs_appts_range', range); } catch {} }, [range]);
  const [pickedDate, setPickedDate] = useState<Date | undefined>(undefined);
  const [service, setService] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false);
  const [bulkSmsMessage, setBulkSmsMessage] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const todayKey = etDateKey();

  const refresh = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const all: any[] = [];
      const page = 1000;
      for (let from = 0, guard = 0; guard < 50; guard++, from += page) {
        const { data, error } = await db.from('appointments').select(SELECT_COLUMNS)
          .order('appointment_date', { ascending: false })
          .order('appointment_time', { ascending: false })
          .range(from, from + page - 1);
        if (error) throw error;
        const chunk = (data as any[]) || [];
        all.push(...chunk);
        if (chunk.length < page) break;
      }
      setRows(all);
    } catch (err: any) {
      console.error('[EnhancedAppointmentsTab] load failed:', err);
      setLastError(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: a booking, a phleb status change or a cancellation shows up
  // without a manual refresh.
  useEffect(() => {
    const ch = supabase.channel(`admin-appointments-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'appointments' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  // Keep the open detail in sync with refreshes.
  useEffect(() => {
    if (!selected) return;
    const fresh = rows.find(r => r.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const bucketOf = useMemo(() => {
    const m = new Map<string, ApptBucket>();
    for (const r of rows) m.set(r.id, deriveApptBucket(r, todayKey));
    return m;
  }, [rows, todayKey]);

  // Range / picked date / service / status narrow the population the tiles
  // count over, so the numbers describe what you're looking at.
  const scoped = useMemo(() => {
    const pickedKey = pickedDate ? `${pickedDate.getFullYear()}-${String(pickedDate.getMonth() + 1).padStart(2, '0')}-${String(pickedDate.getDate()).padStart(2, '0')}` : null;
    const wk = weekBounds(todayKey);
    const monthStart = todayKey.slice(0, 7) + '-01';
    const monthEnd = shiftKey(shiftKey(monthStart, 32).slice(0, 7) + '-01', -1);
    return rows.filter(r => {
      const key = apptDateKey(r);
      if (pickedKey) { if (key !== pickedKey) return false; }
      else if (range === 'today' && key !== todayKey) return false;
      else if (range === 'week' && (key < wk.start || key > wk.end)) return false;
      else if (range === 'month' && (key < monthStart || key > monthEnd)) return false;
      if (service !== 'all' && (r.service_type || '') !== service) return false;
      if (status !== 'all' && (r.status || '') !== status) return false;
      return true;
    });
  }, [rows, range, pickedDate, service, status, todayKey]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(APPT_FILTERS.map(f => [f.key, 0])) as Record<ApptFilterKey, number>;
    for (const r of scoped) {
      const b = bucketOf.get(r.id)!;
      for (const f of APPT_FILTERS) if (f.match(b)) c[f.key]++;
    }
    return c;
  }, [scoped, bucketOf]);

  const serviceOptions = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) { const k = r.service_type || ''; c.set(k, (c.get(k) || 0) + 1); }
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const statusOptions = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) { const k = r.status || ''; c.set(k, (c.get(k) || 0) + 1); }
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const def = APPT_FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    const list = scoped.filter(r => {
      if (!def.match(bucketOf.get(r.id)!)) return false;
      if (q === '') return true;
      return [patientNameOf(r), r.patient_email, r.patient_phone, r.address, r.zipcode, r.service_name, r.service_type, r.notes]
        .some(h => (h || '').toString().toLowerCase().includes(q));
    });
    // Needs-action rows read best oldest-first (the most overdue on top);
    // everything else newest-first, like the raw query.
    return list;
  }, [scoped, filter, search, bucketOf]);

  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(r => NEEDS_ACTION.has(bucketOf.get(r.id)!)).sort((a, b) => apptDateKey(a).localeCompare(apptDateKey(b)));
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(r => !NEEDS_ACTION.has(bucketOf.get(r.id)!)) };
  }, [filtered, filter, bucketOf]);

  const revenue = useMemo(() => {
    let done = 0, doneN = 0, unpaid = 0, unpaidN = 0;
    for (const r of scoped) {
      if (DONE_STATUSES.has(r.status)) { done += Number(r.total_amount) || 0; doneN++; }
      if (isUnpaid(r) && isOpenStatus(r.status)) { unpaid += Number(r.total_amount) || 0; unpaidN++; }
    }
    return { done, doneN, unpaid, unpaidN };
  }, [scoped]);

  // ── Mutations ────────────────────────────────────────────────────
  const setStatusFor = useCallback(async (appt: any, next: string) => {
    const patch: Record<string, any> = { status: next };
    if (next === 'cancelled') patch.cancelled_at = new Date().toISOString();
    const { error } = await db.from('appointments').update(patch).eq('id', appt.id);
    if (error) { toast.error(`Couldn't update: ${error.message}`); return; }
    setRows(prev => prev.map(r => r.id === appt.id ? { ...r, ...patch } : r));
    toast.success(`${patientNameOf(appt)} → ${statusMeta(next).label}`);
  }, []);

  const cancelOne = useCallback((appt: any) => {
    if (!window.confirm(`Cancel ${patientNameOf(appt)}'s appointment on ${fmtDateKey(apptDateKey(appt))}?`)) return;
    setStatusFor(appt, 'cancelled');
  }, [setStatusFor]);

  // Bulk selection
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allVisibleSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(r => r.id)));
  };
  const selectedAppts = useMemo(() => rows.filter(r => selectedIds.has(r.id)), [rows, selectedIds]);

  const handleBulkSms = async () => {
    if (!bulkSmsMessage.trim()) { toast.error('Message is required'); return; }
    setBulkProcessing(true);
    let sent = 0;
    for (const appt of selectedAppts) {
      if (appt.patient_phone) {
        await supabase.functions.invoke('send-sms-notification', { body: { to: appt.patient_phone, message: bulkSmsMessage } }).catch(() => {});
        sent++;
      }
    }
    toast.success(`SMS sent to ${sent}/${selectedAppts.length} patients`);
    setBulkProcessing(false);
    setBulkSmsOpen(false);
    setBulkSmsMessage('');
  };

  const handleBulkCancel = async () => {
    if (!window.confirm(`Cancel ${selectedIds.size} appointment(s)? This cannot be undone.`)) return;
    setBulkProcessing(true);
    const { error } = await db.from('appointments').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).in('id', Array.from(selectedIds));
    if (error) toast.error('Failed: ' + error.message);
    else { toast.success(`${selectedIds.size} appointments cancelled`); setSelectedIds(new Set()); refresh(); }
    setBulkProcessing(false);
  };

  const handleBulkMarkPaid = async () => {
    if (!window.confirm(`Mark ${selectedIds.size} appointment(s) as paid? This records the payment as settled outside Stripe.`)) return;
    setBulkProcessing(true);
    const { error } = await db.from('appointments').update({ payment_status: 'completed', invoice_status: 'paid' }).in('id', Array.from(selectedIds));
    if (error) toast.error('Failed: ' + error.message);
    else { toast.success(`${selectedIds.size} appointments marked as paid`); setSelectedIds(new Set()); refresh(); }
    setBulkProcessing(false);
  };

  const exportCSV = () => {
    const headers = ['Date', 'Time', 'Patient', 'Phone', 'Email', 'Address', 'Zip', 'Status', 'Bucket', 'Service', 'Payment', 'Amount', 'Booking source', 'Appointment ID'];
    const lines = filtered.map(r => [
      apptDateKey(r), fmtTime12(r.appointment_time), patientNameOf(r), r.patient_phone || '', r.patient_email || '', r.address || '',
      r.zipcode || '', r.status || '', BUCKET_META[bucketOf.get(r.id)!].label, serviceLabel(r), r.payment_status || '',
      (Number(r.total_amount) || 0).toFixed(2), r.booking_source || '', r.id,
    ]);
    downloadCsv(headers, lines, `convelabs-appointments-${todayKey}.csv`);
    toast.success(`${filtered.length} row${filtered.length === 1 ? '' : 's'} exported`);
  };

  const clearFilters = () => {
    setFilter('all'); setRange('all'); setPickedDate(undefined); setService('all'); setStatus('all'); setSearch('');
  };
  const hasNarrowing = range !== 'all' || !!pickedDate || service !== 'all' || status !== 'all' || search.trim() !== '' || filter !== 'all';

  const handlers: RowHandlers = {
    isSuperAdmin,
    calendarHref: (a) => `${basePath}/schedule/calendar?appointment=${a.id}`,
    onOpen: setSelected,
    onStatus: setStatusFor,
    onCancel: cancelOne,
  };

  const activeFilter = APPT_FILTERS.find(f => f.key === filter)!;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900">
            <CalendarDays className="h-6 w-6 text-[#B91C1C]" aria-hidden="true" />
            All appointments
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every booked visit — updates in real time.
            {counts.overdue > 0 && <span className="ml-1 font-medium text-red-700">{counts.overdue} past due and never closed out.</span>}
            {counts.overdue === 0 && counts.today > 0 && <span className="ml-1 font-medium text-amber-700">{counts.today} today.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {isSuperAdmin && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 text-xs h-10 sm:h-9" disabled={filtered.length === 0} aria-label="Export CSV">
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5 text-xs h-10 sm:h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                <Plus className="h-4 w-4" aria-hidden="true" /> New appointment <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={() => setScheduleOpen(true)}>
                <CalendarDays className="h-4 w-4 mr-2" aria-hidden="true" />
                <span>Quick book (admin)<span className="block text-[11px] text-gray-500">Search patient, pick a slot, invoice or waive</span></span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate('/book-now')}>
                <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                <span>Patient booking flow<span className="block text-[11px] text-gray-500">Full checkout, as the patient sees it</span></span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stat tiles — click to filter. Four tiles partition every row in view. */}
      <StatTiles
        keys={APPT_TILE_KEYS}
        defs={APPT_FILTERS}
        counts={counts}
        active={filter}
        loading={loading}
        styles={APPT_TILE_STYLE}
        onPick={(k, isActive) => setFilter(isActive ? 'all' : (k as ApptFilterKey))}
        ariaLabel="Appointment counts"
      />

      {isSuperAdmin && !loading && scoped.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /><span className="font-semibold text-gray-900">{money(revenue.done)}</span> from {revenue.doneN} completed visit{revenue.doneN === 1 ? '' : 's'} in view</span>
          {revenue.unpaidN > 0 && <span className="text-amber-700"><span className="font-semibold">{money(revenue.unpaid)}</span> unpaid across {revenue.unpaidN} open visit{revenue.unpaidN === 1 ? '' : 's'}</span>}
          <span className="text-gray-400 text-[11px]">Owner view · amounts are stored in dollars</span>
        </div>
      )}

      {lastError && <ErrorCard title="Couldn't load appointments" message={lastError} onRetry={refresh} />}

      {/* Search + secondary filters + bucket chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search patient, phone, email, address, zip, notes…"
              aria-label="Search appointments"
              className="h-10 sm:h-9 pl-8 text-sm"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="Date range (Eastern time)">
            {RANGES.map((r, i) => (
              <button
                key={r.key}
                type="button"
                onClick={() => { setRange(r.key); setPickedDate(undefined); }}
                aria-pressed={range === r.key && !pickedDate}
                className={cn('px-3 h-10 sm:h-9 text-xs font-medium transition', i > 0 && 'border-l border-gray-200', range === r.key && !pickedDate ? 'bg-[#B91C1C] text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-10 sm:h-9 text-xs gap-1.5', pickedDate && 'border-gray-900 text-gray-900')} aria-label="Pick a date">
                <CalendarIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {pickedDate ? fmtDateKey(`${pickedDate.getFullYear()}-${String(pickedDate.getMonth() + 1).padStart(2, '0')}-${String(pickedDate.getDate()).padStart(2, '0')}`, { month: 'short', day: 'numeric' }) : 'Pick a date'}
                {pickedDate && <X className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" onClick={(e) => { e.stopPropagation(); setPickedDate(undefined); }} />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <DayPicker mode="single" selected={pickedDate} onSelect={setPickedDate} initialFocus />
            </PopoverContent>
          </Popover>
          <select
            value={service}
            onChange={e => setService(e.target.value)}
            aria-label="Filter by service"
            className={cn('h-10 sm:h-9 rounded-md border px-2.5 text-xs font-medium bg-white max-w-[200px]', service === 'all' ? 'border-gray-200 text-gray-700' : 'border-gray-900 text-gray-900')}
          >
            <option value="all">All services</option>
            {serviceOptions.map(([k, n]) => <option key={k || '__none'} value={k}>{serviceTypeLabel(k)} ({n})</option>)}
          </select>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            aria-label="Filter by raw status"
            className={cn('h-10 sm:h-9 rounded-md border px-2.5 text-xs font-medium bg-white', status === 'all' ? 'border-gray-200 text-gray-700' : 'border-gray-900 text-gray-900')}
          >
            <option value="all">All statuses</option>
            {statusOptions.map(([k, n]) => <option key={k || '__none'} value={k}>{statusMeta(k).label} ({n})</option>)}
          </select>
          {hasNarrowing && (
            <Button variant="ghost" size="sm" className="h-10 sm:h-9 text-xs" onClick={clearFilters}>Clear all</Button>
          )}
        </div>
        <FilterChips
          defs={APPT_FILTERS}
          counts={counts}
          active={filter}
          dotFor={(k) => (k !== 'all' && k !== 'needs_action') ? BUCKET_META[k as ApptBucket].dot : null}
          onPick={(k) => setFilter(k as ApptFilterKey)}
          ariaLabel="Bucket filter"
        />
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-[#B91C1C]/5 border border-[#B91C1C]/20 rounded-lg p-3 flex flex-wrap items-center gap-2" role="region" aria-label="Bulk actions">
          <span className="text-sm font-medium text-[#B91C1C] mr-1">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" className="text-xs gap-1 h-9" onClick={() => setBulkSmsOpen(true)} disabled={bulkProcessing}>
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Send SMS
          </Button>
          {isSuperAdmin && (
            <Button size="sm" variant="outline" className="text-xs gap-1 h-9" onClick={handleBulkMarkPaid} disabled={bulkProcessing}>
              <DollarSign className="h-3.5 w-3.5" aria-hidden="true" /> Mark paid
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs gap-1 h-9 text-red-600 hover:text-red-700" onClick={handleBulkCancel} disabled={bulkProcessing}>
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Cancel all
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-9" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

      {/* Body */}
      {loading && rows.length === 0 ? (
        <LoadingRows label="Loading appointments" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? 'No appointments yet.' : search.trim() ? 'No appointments match your search.' : `Nothing in "${activeFilter.label}".`}
          hint={rows.length === 0 ? 'Bookings appear here the moment a patient or admin creates one.' : search.trim() ? 'Try a patient name, phone, email, address or zip.' : hasNarrowing ? `${activeFilter.desc} — within the current range and filters.` : activeFilter.desc}
          total={rows.length}
          onReset={clearFilters}
          resetLabel={`Show all ${rows.length} appointments`}
        />
      ) : lanes ? (
        <div className="space-y-5">
          <section aria-labelledby="lane-action">
            <LaneHeader id="lane-action" title="Needs action" count={lanes.action.length} tone="red" hint="past due first" />
            <ApptRows rows={lanes.action} bucketOf={bucketOf} handlers={handlers} selectedIds={selectedIds} onToggle={toggleSelect} />
          </section>
          {lanes.rest.length > 0 && (
            <section aria-labelledby="lane-rest">
              <LaneHeader id="lane-rest" title="Everything else" count={lanes.rest.length} tone="gray" />
              <ApptRows rows={lanes.rest} bucketOf={bucketOf} handlers={handlers} selectedIds={selectedIds} onToggle={toggleSelect} onToggleAll={toggleSelectAll} allSelected={allVisibleSelected} />
            </section>
          )}
        </div>
      ) : (
        <ApptRows rows={filtered} bucketOf={bucketOf} handlers={handlers} selectedIds={selectedIds} onToggle={toggleSelect} onToggleAll={toggleSelectAll} allSelected={allVisibleSelected} />
      )}

      <p className="text-[11px] text-gray-400">
        Showing {filtered.length} of {scoped.length} in view · {rows.length} appointment{rows.length === 1 ? '' : 's'} total
        {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
      </p>

      {/* Bulk SMS */}
      <Dialog open={bulkSmsOpen} onOpenChange={setBulkSmsOpen}>
        <DialogContent className="max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-[#B91C1C]" aria-hidden="true" /> Text {selectedIds.size} patient{selectedIds.size !== 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1 max-h-32 overflow-y-auto">
              {selectedAppts.map(a => (
                <p key={a.id} className={cn(!a.patient_phone && 'text-gray-400')}>{patientNameOf(a)} — {a.patient_phone || 'no phone'}</p>
              ))}
            </div>
            <Textarea value={bulkSmsMessage} onChange={e => setBulkSmsMessage(e.target.value)} placeholder="Type your message…" rows={4} />
            <p className="text-xs text-gray-500">{selectedAppts.filter(a => a.patient_phone).length}/{selectedIds.size} have a phone number. Quiet hours (9pm–8am ET) apply on the sending side.</p>
            <Button className="w-full h-11 bg-[#B91C1C] hover:bg-[#991B1B] text-white" disabled={!bulkSmsMessage.trim() || bulkProcessing} onClick={handleBulkSms}>
              {bulkProcessing ? 'Sending…' : `Send to ${selectedAppts.filter(a => a.patient_phone).length} patient${selectedAppts.filter(a => a.patient_phone).length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AppointmentDetailModal
        appointment={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onUpdate={refresh}
      />

      <ScheduleAppointmentModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onCreated={refresh}
      />
    </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Row pieces
// ──────────────────────────────────────────────────────────────────
const PrimaryAction: React.FC<{ row: any; bucket: ApptBucket; h: RowHandlers; className?: string }> = ({ row, bucket, h, className }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (row.status === 'scheduled' && (bucket === 'today' || bucket === 'upcoming')) {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5 border-blue-300 text-blue-800 hover:bg-blue-50', className)} onClick={(e) => { stop(e); h.onStatus(row, 'confirmed'); }}>
        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Confirm
      </Button>
    );
  }
  if (isOpenStatus(row.status) && (bucket === 'overdue' || bucket === 'today')) {
    return (
      <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onStatus(row, 'completed'); }}>
        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Mark completed
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onOpen(row); }}>
      <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Open
    </Button>
  );
};

const RowMenu: React.FC<{ row: any; h: RowHandlers; className?: string }> = ({ row, h, className }) => {
  const open = isOpenStatus(row.status);
  const name = patientNameOf(row);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${name}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => h.onOpen(row)}>
          <Eye className="h-4 w-4 mr-2" aria-hidden="true" /> Open full manager
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.open(h.calendarHref(row), '_blank', 'noopener,noreferrer')}>
          <CalendarDays className="h-4 w-4 mr-2" aria-hidden="true" /> Show on calendar
        </DropdownMenuItem>
        {open && <DropdownMenuSeparator />}
        {row.status === 'scheduled' && (
          <DropdownMenuItem onSelect={() => h.onStatus(row, 'confirmed')}>
            <Check className="h-4 w-4 mr-2" aria-hidden="true" /> Confirm appointment
          </DropdownMenuItem>
        )}
        {(row.status === 'scheduled' || row.status === 'confirmed') && (
          <DropdownMenuItem onSelect={() => h.onStatus(row, 'en_route')}>
            <Navigation className="h-4 w-4 mr-2" aria-hidden="true" /> Mark en route
          </DropdownMenuItem>
        )}
        {open && (
          <DropdownMenuItem onSelect={() => h.onStatus(row, 'completed')}>
            <Check className="h-4 w-4 mr-2" aria-hidden="true" /> Mark completed
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {row.patient_phone && (
          <DropdownMenuItem asChild>
            <a href={`tel:${row.patient_phone}`}><Phone className="h-4 w-4 mr-2" aria-hidden="true" /> Call {row.patient_phone}</a>
          </DropdownMenuItem>
        )}
        {row.patient_email && (
          <DropdownMenuItem asChild>
            <a href={`mailto:${row.patient_email}`}><Mail className="h-4 w-4 mr-2" aria-hidden="true" /> Email patient</a>
          </DropdownMenuItem>
        )}
        {row.address && (
          <DropdownMenuItem onSelect={async () => { try { await navigator.clipboard.writeText(row.address); toast.success('Address copied'); } catch { toast.error("Couldn't copy address"); } }}>
            <Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy address
          </DropdownMenuItem>
        )}
        {open && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={() => h.onCancel(row)}>
              <XCircle className="h-4 w-4 mr-2" aria-hidden="true" /> Cancel appointment
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const When: React.FC<{ row: any; bucket: ApptBucket; todayKey: string }> = ({ row, bucket, todayKey }) => {
  const key = apptDateKey(row);
  const time = fmtTime12(row.appointment_time);
  let rel: string | null = null;
  if (key && bucket === 'overdue') {
    const days = Math.round((new Date(todayKey + 'T12:00:00').getTime() - new Date(key + 'T12:00:00').getTime()) / 86400000);
    rel = `${days}d ago`;
  } else if (key === todayKey) rel = 'today';
  else if (key === shiftKey(todayKey, 1)) rel = 'tomorrow';
  return (
    <>
      <span className={cn('block font-medium', bucket === 'overdue' ? 'text-red-700' : 'text-gray-900')}>
        {key ? fmtDateKey(key, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}
        {rel && <span className="font-normal text-gray-500"> · {rel}</span>}
      </span>
      <span className="block text-[11px] text-gray-500">{time || 'Time TBD'}{row.duration_minutes ? ` · ${row.duration_minutes} min` : ''}</span>
    </>
  );
};

const RowBadges: React.FC<{ row: any }> = ({ row }) => (
  <>
    {row.recurrence_group_id && (
      <span className="inline-flex items-center h-5 px-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold" title="Part of a recurring series">
        Series{row.recurrence_sequence && row.recurrence_total ? ` ${row.recurrence_sequence}/${row.recurrence_total}` : ''}
      </span>
    )}
    {row.family_group_id && row.companion_role && (
      <span className="inline-flex items-center h-5 px-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold" title="Companion in a household visit">Companion</span>
    )}
    {row.fasting_required && (
      <span className="inline-flex items-center h-5 px-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">Fasting</span>
    )}
  </>
);

const ApptRows: React.FC<{
  rows: any[];
  bucketOf: Map<string, ApptBucket>;
  handlers: RowHandlers;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
}> = ({ rows, bucketOf, handlers, selectedIds, onToggle, onToggleAll, allSelected }) => {
  const todayKey = etDateKey();
  const bucket = (r: any) => bucketOf.get(r.id) || deriveApptBucket(r, todayKey);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className="h-9 w-10 pl-3">
                {onToggleAll ? (
                  <Checkbox checked={!!allSelected} onCheckedChange={onToggleAll} aria-label="Select all visible" />
                ) : <span className="sr-only">Select</span>}
              </TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500">Patient</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500 whitespace-nowrap">When</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500">Service</TableHead>
              <TableHead className="hidden lg:table-cell h-9 text-[11px] uppercase tracking-wider text-gray-500">Address</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500">Status</TableHead>
              <TableHead className="hidden xl:table-cell h-9 text-[11px] uppercase tracking-wider text-gray-500">Payment</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500 text-right">Amount</TableHead>
              {/* Actions stay pinned to the right edge so they are never scrolled out of view on narrower screens. */}
              <TableHead className="sticky right-0 z-10 bg-gray-50 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)] h-9 text-[11px] uppercase tracking-wider text-gray-500 text-right pr-3">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => {
              const b = bucket(row);
              const open = () => handlers.onOpen(row);
              const checked = selectedIds.has(row.id);
              const name = patientNameOf(row);
              return (
                <TableRow
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={rowKeyHandler(open)}
                  aria-label={`${name}, ${statusMeta(row.status).label}. Open appointment`}
                  className={cn(
                    'cursor-pointer focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40',
                    checked ? 'bg-[#B91C1C]/5' : 'bg-white',
                    b === 'overdue' && 'border-l-4 border-l-red-500',
                    b === 'today' && 'border-l-4 border-l-amber-400',
                  )}
                >
                  <TableCell className="py-2.5 pl-3 align-top" onClick={stop}>
                    <Checkbox checked={checked} onCheckedChange={() => onToggle(row.id)} aria-label={`Select ${name}`} />
                  </TableCell>
                  <TableCell className="py-2.5 align-top">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800 truncate">{name}</span>
                        <RowBadges row={row} />
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {row.patient_phone || row.patient_email || 'No contact on file'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs whitespace-nowrap">
                    <When row={row} bucket={b} todayKey={todayKey} />
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 max-w-[180px]">
                    <span className="block truncate" title={row.service_name || row.service_type || ''}>{serviceLabel(row)}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell py-2.5 align-top text-xs text-gray-600 max-w-[220px]">
                    {row.address ? (
                      <span className="inline-flex items-start gap-1 min-w-0" title={row.address}>
                        <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <span className="truncate">{row.address}</span>
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="py-2.5 align-top">
                    <StatusPill status={row.no_show ? 'no_show' : row.status} />
                  </TableCell>
                  <TableCell className="hidden xl:table-cell py-2.5 align-top">
                    <PaymentPill appt={row} />
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-right font-medium text-gray-900 whitespace-nowrap tabular-nums">
                    {money(row.total_amount)}
                    {Number(row.tip_amount) > 0 && <span className="block text-[10px] text-gray-400 font-normal">+{money(row.tip_amount)} tip</span>}
                  </TableCell>
                  <TableCell className={cn('sticky right-0 z-10 py-2 align-top pr-3 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]', checked ? 'bg-[#FDF5F5]' : 'bg-white')}>
                    <div className="flex items-center justify-end gap-1">
                      <PrimaryAction row={row} bucket={b} h={handlers} className="h-9" />
                      <RowMenu row={row} h={handlers} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map(row => {
          const b = bucket(row);
          const open = () => handlers.onOpen(row);
          const checked = selectedIds.has(row.id);
          const name = patientNameOf(row);
          return (
            <Card
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={rowKeyHandler(open)}
              aria-label={`${name}, ${statusMeta(row.status).label}. Open appointment`}
              className={cn(
                'shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                checked && 'bg-[#B91C1C]/5',
                b === 'overdue' && 'border-l-4 border-l-red-500',
                b === 'today' && 'border-l-4 border-l-amber-400',
              )}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div onClick={stop} className="pt-0.5">
                    <Checkbox checked={checked} onCheckedChange={() => onToggle(row.id)} aria-label={`Select ${name}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{name}</span>
                      <RowBadges row={row} />
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">{serviceLabel(row)}{row.patient_phone ? ` · ${row.patient_phone}` : ''}</p>
                  </div>
                  <StatusPill status={row.no_show ? 'no_show' : row.status} />
                </div>
                <div className="text-xs text-gray-600 flex items-center justify-between gap-2">
                  <span><When row={row} bucket={b} todayKey={todayKey} /></span>
                  <span className="text-right">
                    <span className="block font-medium text-gray-900 tabular-nums">{money(row.total_amount)}</span>
                    <PaymentPill appt={row} className="mt-0.5" />
                  </span>
                </div>
                {row.address && (
                  <p className="text-xs text-gray-600 flex items-start gap-1 min-w-0">
                    <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="truncate">{row.address}</span>
                  </p>
                )}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <PrimaryAction row={row} bucket={b} h={handlers} className="h-11 flex-1 justify-center" />
                  <RowMenu row={row} h={handlers} className="h-11 w-11 flex-shrink-0 border border-gray-200" />
                  <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
};

export default EnhancedAppointmentsTab;
