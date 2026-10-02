/**
 * LabOrdersTab — every provider-uploaded lab order, in one shared screen.
 *
 * Rendered for BOTH admin roles (super_admin + office_manager) via
 * Dashboard.tsx SECTION_SCREENS["lab/orders"]; there is deliberately one
 * component, not one per role. Role-specific behaviour (auto-fulfill
 * toggling) gates on `super_admin` inside this file.
 *
 * Source table: patient_lab_requests. Real status pipeline (from the edge
 * functions, not the old 5-value enum the UI used to assume):
 *
 *   pending_payment  → provider's office hasn't saved a card yet; the patient
 *                      has NOT been texted. Admin / provider action needed.
 *   pending_schedule → patient has the booking link; waiting on them.
 *   scheduled        → patient picked a slot (appointment_id set).
 *   completed        → specimen drawn / delivered.
 *   expired          → link expired without a booking.
 *   cancelled        → cancelled by provider / admin / reschedule carry-over.
 *
 * Every row maps to exactly ONE bucket (see deriveBucket) so the stat tiles,
 * the filter chips and the list always agree. "Unreviewed" (admin_viewed_at
 * IS NULL) is an orthogonal flag — it drives the nav badge, the bold name
 * and the "Mark reviewed" actions, not the bucket.
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase, publicStorageUrl } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  FlaskConical, Loader2, RefreshCw, Search, Mail, Phone, Calendar, AlertTriangle,
  ExternalLink, FileText, Building2, ChevronRight, ChevronDown, Eye, Zap, Download,
  MoreHorizontal, Copy, CreditCard, Layers, Check, X,
} from 'lucide-react';
import { format, formatDistanceToNowStrict, differenceInCalendarDays, isValid } from 'date-fns';
import { toast } from 'sonner';
import SendBookingLinkModal from '@/components/admin/SendBookingLinkModal';

// Untyped table access — patient_lab_requests isn't in the generated
// Database type, so every call goes through this loosely-typed handle.
const db = supabase as any;

// ──────────────────────────────────────────────────────────────────
// Download helper — signed URL + blob so the browser downloads instead of
// navigating. Works for PDF + image lab orders.
// ──────────────────────────────────────────────────────────────────
async function downloadLabOrder(path: string, filename: string) {
  try {
    const { data, error } = await supabase.storage.from('lab-orders').createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw error || new Error('no_url');
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e: any) {
    toast.error(`Couldn't download: ${e?.message || e}`);
  }
}

function downloadRow(row: LabOrderRow) {
  if (!row.lab_order_file_path) return;
  const ext = row.lab_order_file_path.split('.').pop() || 'pdf';
  const safe = (row.patient_name || 'patient').replace(/[^A-Za-z0-9_-]/g, '_');
  downloadLabOrder(row.lab_order_file_path, `lab-order_${safe}.${ext}`);
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Couldn't copy ${what.toLowerCase()}`);
  }
}

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────
type LabRequestStatus =
  | 'pending_payment' | 'pending_schedule' | 'scheduled' | 'completed' | 'cancelled' | 'expired';

export interface LabOrderRow {
  id: string;
  organization_id: string | null;
  organization_name?: string | null;
  /** tenant_patients.id resolved by email (no FK on the table). */
  resolved_patient_id?: string | null;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  patient_dob: string | null;
  lab_order_file_path: string | null;
  lab_order_panels: any;
  fasting_required: boolean | null;
  urine_required: boolean | null;
  gtt_required: boolean | null;
  draw_by_date: string | null;
  next_doctor_appt_date: string | null;
  admin_notes: string | null;
  status: LabRequestStatus | string;
  appointment_id: string | null;
  access_token: string;
  access_token_expires_at: string | null;
  patient_notified_at: string | null;
  patient_reminded_at: string | null;
  patient_reminder_count: number | null;
  patient_viewed_at: string | null;
  patient_scheduled_at: string | null;
  last_inbound_sms_at: string | null;
  last_inbound_sms_body: string | null;
  provider_payment_status: string | null;
  provider_paid_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  specimen_delivered_at: string | null;
  specimen_tracking_id: string | null;
  household_group_id: string | null;
  admin_viewed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

const SELECT_COLUMNS = [
  'id', 'organization_id', 'patient_name', 'patient_email', 'patient_phone', 'patient_dob',
  'lab_order_file_path', 'lab_order_panels', 'fasting_required', 'urine_required', 'gtt_required',
  'draw_by_date', 'next_doctor_appt_date', 'admin_notes', 'status', 'appointment_id', 'access_token',
  'access_token_expires_at', 'patient_notified_at', 'patient_reminded_at', 'patient_reminder_count',
  'patient_viewed_at', 'patient_scheduled_at', 'last_inbound_sms_at', 'last_inbound_sms_body',
  'provider_payment_status', 'provider_paid_at', 'completed_at', 'cancelled_at',
  'specimen_delivered_at', 'specimen_tracking_id', 'household_group_id', 'admin_viewed_at',
  'created_at', 'updated_at',
].join(', ');

// ──────────────────────────────────────────────────────────────────
// Status derivation — ONE bucket per row, so counts always match the list.
// ──────────────────────────────────────────────────────────────────
export type Bucket =
  | 'new' | 'overdue' | 'awaiting_provider' | 'awaiting_patient'
  | 'scheduled' | 'completed' | 'closed';

const OPEN_STATUSES = new Set(['pending_payment', 'pending_schedule']);

/** Local-date "is the draw-by date already behind us". Dates are DATE
 *  columns (no TZ) so we compare on calendar days, not instants. */
export function drawByDaysLeft(drawBy: string | null): number | null {
  if (!drawBy) return null;
  const d = new Date(drawBy + 'T12:00:00');
  if (!isValid(d)) return null;
  return differenceInCalendarDays(d, new Date());
}

export function isUnreviewed(r: LabOrderRow): boolean {
  return !r.admin_viewed_at && OPEN_STATUSES.has(r.status);
}

export function deriveBucket(r: LabOrderRow): Bucket {
  if (r.status === 'scheduled') return 'scheduled';
  if (r.status === 'completed') return 'completed';
  if (r.status === 'cancelled' || r.status === 'expired') return 'closed';
  // Open orders: pending_payment / pending_schedule (and anything unknown —
  // treat as open so it is never silently hidden).
  const left = drawByDaysLeft(r.draw_by_date);
  if (left !== null && left < 0) return 'overdue';
  if (r.status === 'pending_payment') return 'awaiting_provider';
  if (!r.admin_viewed_at) return 'new';
  return 'awaiting_patient';
}

const NEEDS_ACTION: ReadonlySet<Bucket> = new Set<Bucket>(['new', 'overdue', 'awaiting_provider']);

interface BucketMeta {
  label: string;
  short: string;
  desc: string;
  pill: string;      // status pill classes
  tile: string;      // active tile classes
  dot: string;
}

const BUCKET_META: Record<Bucket, BucketMeta> = {
  new: {
    label: 'New', short: 'New',
    desc: 'Provider uploaded — not reviewed yet',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    tile: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    dot: 'bg-emerald-500',
  },
  overdue: {
    label: 'Overdue', short: 'Overdue',
    desc: 'Draw-by date has passed and nothing is booked',
    pill: 'bg-red-100 text-red-800 border-red-200',
    tile: 'border-red-300 bg-red-50 text-red-800',
    dot: 'bg-red-500',
  },
  awaiting_provider: {
    label: 'Awaiting provider card', short: 'Provider card',
    desc: "Provider's office hasn't saved a payment card — patient has not been contacted",
    pill: 'bg-orange-100 text-orange-800 border-orange-200',
    tile: 'border-orange-300 bg-orange-50 text-orange-800',
    dot: 'bg-orange-500',
  },
  awaiting_patient: {
    label: 'Awaiting patient', short: 'Awaiting patient',
    desc: 'Booking link sent — patient hasn\'t picked a slot',
    pill: 'bg-amber-100 text-amber-800 border-amber-200',
    tile: 'border-amber-300 bg-amber-50 text-amber-800',
    dot: 'bg-amber-500',
  },
  scheduled: {
    label: 'Scheduled', short: 'Scheduled',
    desc: 'Patient picked a slot · phlebotomist assigned',
    pill: 'bg-blue-100 text-blue-800 border-blue-200',
    tile: 'border-blue-300 bg-blue-50 text-blue-800',
    dot: 'bg-blue-500',
  },
  completed: {
    label: 'Completed', short: 'Completed',
    desc: 'Specimen drawn and delivered to the lab',
    pill: 'bg-gray-100 text-gray-700 border-gray-200',
    tile: 'border-gray-300 bg-gray-100 text-gray-800',
    dot: 'bg-gray-400',
  },
  closed: {
    label: 'Closed', short: 'Closed',
    desc: 'Expired or cancelled — no further action',
    pill: 'bg-white text-gray-500 border-gray-300',
    tile: 'border-gray-300 bg-gray-50 text-gray-700',
    dot: 'bg-gray-300',
  },
};

type FilterKey = 'all' | 'needs_action' | Bucket;

const FILTERS: Array<{ key: FilterKey; label: string; desc: string; match: (b: Bucket) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Every order on file', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'New, overdue, or waiting on the provider\'s card', match: (b) => NEEDS_ACTION.has(b) },
  { key: 'new', label: 'New', desc: BUCKET_META.new.desc, match: (b) => b === 'new' },
  { key: 'overdue', label: 'Overdue', desc: BUCKET_META.overdue.desc, match: (b) => b === 'overdue' },
  { key: 'awaiting_provider', label: 'Provider card', desc: BUCKET_META.awaiting_provider.desc, match: (b) => b === 'awaiting_provider' },
  { key: 'awaiting_patient', label: 'Awaiting patient', desc: BUCKET_META.awaiting_patient.desc, match: (b) => b === 'awaiting_patient' },
  { key: 'scheduled', label: 'Scheduled', desc: BUCKET_META.scheduled.desc, match: (b) => b === 'scheduled' },
  { key: 'completed', label: 'Completed', desc: BUCKET_META.completed.desc, match: (b) => b === 'completed' },
  { key: 'closed', label: 'Closed', desc: BUCKET_META.closed.desc, match: (b) => b === 'closed' },
];

/** The five tiles. Together they partition every row (needs_action =
 *  new + overdue + awaiting_provider), so their sum equals "All". */
const TILE_KEYS: FilterKey[] = ['needs_action', 'awaiting_patient', 'scheduled', 'completed', 'closed'];

const TILE_STYLE: Record<string, string> = {
  needs_action: 'border-red-300 bg-red-50 text-red-800',
  awaiting_patient: BUCKET_META.awaiting_patient.tile,
  scheduled: BUCKET_META.scheduled.tile,
  completed: BUCKET_META.completed.tile,
  closed: BUCKET_META.closed.tile,
};

// ──────────────────────────────────────────────────────────────────
// Last activity — the most recent timestamp we know about, with a label.
// ──────────────────────────────────────────────────────────────────
interface Activity { at: Date; label: string }

export function lastActivity(r: LabOrderRow): Activity {
  const candidates: Array<[string | null | undefined, string]> = [
    [r.created_at, 'Received'],
    [r.admin_viewed_at, 'Reviewed'],
    [r.provider_paid_at, 'Provider card saved'],
    [r.patient_notified_at, 'Link sent'],
    [r.patient_reminded_at, 'Reminder sent'],
    [r.patient_viewed_at, 'Patient opened link'],
    [r.last_inbound_sms_at, 'Patient replied'],
    [r.patient_scheduled_at, 'Patient booked'],
    [r.specimen_delivered_at, 'Specimen delivered'],
    [r.completed_at, 'Completed'],
    [r.cancelled_at, 'Cancelled'],
  ];
  let best: Activity = { at: new Date(r.created_at), label: 'Received' };
  for (const [ts, label] of candidates) {
    if (!ts) continue;
    const d = new Date(ts);
    if (isValid(d) && d.getTime() > best.at.getTime()) best = { at: d, label };
  }
  return best;
}

const ago = (d: Date | string) => formatDistanceToNowStrict(typeof d === 'string' ? new Date(d) : d, { addSuffix: true });

function statusLabel(r: LabOrderRow): string {
  const b = deriveBucket(r);
  if (b === 'closed') return r.status === 'expired' ? 'Expired' : 'Cancelled';
  return BUCKET_META[b].label;
}

// ──────────────────────────────────────────────────────────────────
// Duplicate grouping — same patient + same provider + same day.
// The leader is the "most alive" row; the rest fold under it.
// ──────────────────────────────────────────────────────────────────
export interface OrderGroup { leader: LabOrderRow; others: LabOrderRow[] }

const LEADER_RANK: Record<string, number> = {
  scheduled: 0, completed: 1, pending_schedule: 2, pending_payment: 3, expired: 4, cancelled: 5,
};

function groupKey(r: LabOrderRow): string {
  return [
    (r.patient_name || '').trim().toLowerCase().replace(/\s+/g, ' '),
    r.organization_id || '',
    (r.created_at || '').slice(0, 10),
  ].join('|');
}

export function groupDuplicates(rows: LabOrderRow[], enabled: boolean): OrderGroup[] {
  if (!enabled) return rows.map(r => ({ leader: r, others: [] }));
  const map = new Map<string, LabOrderRow[]>();
  const order: string[] = [];
  for (const r of rows) {
    const k = groupKey(r);
    if (!map.has(k)) { map.set(k, []); order.push(k); }
    map.get(k)!.push(r);
  }
  return order.map(k => {
    const list = [...map.get(k)!].sort((a, b) => {
      const ra = LEADER_RANK[a.status] ?? 9, rb = LEADER_RANK[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return { leader: list[0], others: list.slice(1) };
  });
}

interface OrgMeta {
  name: string;
  auto_fulfill_lab_orders: boolean;
}

// Shared per-row callbacks threaded through every view.
interface RowHandlers {
  basePath: string;
  canEditAutoFulfill: boolean;
  onOpen: (r: LabOrderRow) => void;
  onSendLink: (r: LabOrderRow) => void;
  onMarkReviewed: (r: LabOrderRow) => void;
}

const panelsOf = (r: LabOrderRow): string[] =>
  Array.isArray(r.lab_order_panels) ? r.lab_order_panels.filter((p: any) => typeof p === 'string') : [];

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────
const LabOrdersTab: React.FC = () => {
  const { user } = useAuth();
  const basePath = `/dashboard/${user?.role === 'office_manager' ? 'office_manager' : 'super_admin'}`;
  // Changing an org's auto-fulfill setting is an admin-only control.
  const canEditAutoFulfill = user?.role === 'super_admin';

  const [rows, setRows] = useState<LabOrderRow[]>([]);
  const [orgMap, setOrgMap] = useState<Map<string, OrgMeta>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [groupDupes, setGroupDupes] = useState<boolean>(() => {
    try { return localStorage.getItem('convelabs_lab_orders_group_dupes') !== '0'; } catch { return true; }
  });
  useEffect(() => { try { localStorage.setItem('convelabs_lab_orders_group_dupes', groupDupes ? '1' : '0'); } catch {} }, [groupDupes]);

  // View mode: flat list OR grouped by provider's office. Persisted.
  const [viewMode, setViewMode] = useState<'list' | 'by_org'>(() => {
    try { return (localStorage.getItem('convelabs_lab_orders_view') as any) === 'by_org' ? 'by_org' : 'list'; }
    catch { return 'list'; }
  });
  useEffect(() => { try { localStorage.setItem('convelabs_lab_orders_view', viewMode); } catch {} }, [viewMode]);

  const [selectedRow, setSelectedRow] = useState<LabOrderRow | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [sendLinkOpen, setSendLinkOpen] = useState(false);
  const [sendLinkPatient, setSendLinkPatient] = useState<any>(null);
  const [sendLinkContext, setSendLinkContext] = useState<{
    organizationId: string | null; organizationName: string | null;
    labOrderPath: string | null; serviceType: string | null;
  }>({ organizationId: null, organizationName: null, labOrderPath: null, serviceType: null });

  const refresh = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const { data: lr, error: queryErr } = await db
        .from('patient_lab_requests')
        .select(SELECT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(500);
      if (queryErr) {
        console.error('[LabOrdersTab] query error:', queryErr);
        setLastError(queryErr.message || String(queryErr));
      }
      const list = ((lr as any[]) || []) as LabOrderRow[];

      const orgIds = Array.from(new Set(list.map(r => r.organization_id).filter(Boolean) as string[]));
      const oMap = new Map<string, OrgMeta>();
      if (orgIds.length > 0) {
        const { data: orgs } = await db.from('organizations').select('id, name, auto_fulfill_lab_orders').in('id', orgIds);
        ((orgs as any[]) || []).forEach(o => oMap.set(o.id, { name: o.name, auto_fulfill_lab_orders: !!o.auto_fulfill_lab_orders }));
      }
      setOrgMap(oMap);

      // Resolve tenant_patients.id by email so Send Booking Link opens with
      // the right patient context. One round-trip via .in().
      const emails = Array.from(new Set(list.map(r => (r.patient_email || '').toLowerCase().trim()).filter(Boolean)));
      const emailToPatientId = new Map<string, string>();
      if (emails.length > 0) {
        const { data: tps } = await db.from('tenant_patients').select('id, email').in('email', emails);
        ((tps as any[]) || []).forEach(tp => { if (tp.email) emailToPatientId.set(String(tp.email).toLowerCase().trim(), tp.id); });
      }

      setRows(list.map(r => ({
        ...r,
        organization_name: r.organization_id ? oMap.get(r.organization_id)?.name || null : null,
        resolved_patient_id: r.patient_email ? emailToPatientId.get(r.patient_email.toLowerCase().trim()) || null : null,
      })));
    } catch (err: any) {
      console.error('[LabOrdersTab] load crashed:', err);
      setLastError(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Real-time: toast on a new provider upload; refresh on any change so
  // status transitions (webhook, patient booking, cron expiry) show instantly.
  useEffect(() => {
    const channelName = `admin-lab-orders-feed-${Math.random().toString(36).slice(2, 8)}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'patient_lab_requests' }, (payload: any) => {
        const row = payload?.new || {};
        toast.success(`New lab order: ${row.patient_name || 'a patient'}`, { duration: 6000 });
        refresh();
      })
      .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'patient_lab_requests' }, () => refresh())
      .on('postgres_changes' as any, { event: 'DELETE', schema: 'public', table: 'patient_lab_requests' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  // Keep the open drawer in sync with realtime refreshes.
  useEffect(() => {
    if (!selectedRow) return;
    const fresh = rows.find(r => r.id === selectedRow.id);
    if (fresh && fresh !== selectedRow) setSelectedRow(fresh);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bucket every row once; counts for tiles/chips derive from the same map
  // the list filters on, so they can never disagree.
  const bucketOf = useMemo(() => {
    const m = new Map<string, Bucket>();
    for (const r of rows) m.set(r.id, deriveBucket(r));
    return m;
  }, [rows]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map(f => [f.key, 0])) as Record<FilterKey, number>;
    for (const r of rows) {
      const b = bucketOf.get(r.id)!;
      for (const f of FILTERS) if (f.match(b)) c[f.key]++;
    }
    return c;
  }, [rows, bucketOf]);

  const unreviewedIds = useMemo(() => rows.filter(isUnreviewed).map(r => r.id), [rows]);

  const filteredRows = useMemo(() => {
    const def = FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    return rows.filter(r => def.match(bucketOf.get(r.id)!) && (q === '' ||
      (r.patient_name || '').toLowerCase().includes(q) ||
      (r.organization_name || '').toLowerCase().includes(q) ||
      (r.patient_email || '').toLowerCase().includes(q) ||
      (r.patient_phone || '').includes(q) ||
      panelsOf(r).some(p => p.toLowerCase().includes(q))
    ));
  }, [rows, filter, search, bucketOf]);

  const groups = useMemo(() => groupDuplicates(filteredRows, groupDupes), [filteredRows, groupDupes]);
  const hiddenDupes = useMemo(() => groups.reduce((n, g) => n + g.others.length, 0), [groups]);

  // "Needs action" lane on top of the flat list when viewing everything.
  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = groups.filter(g => NEEDS_ACTION.has(bucketOf.get(g.leader.id)!));
    if (action.length === 0) return null;
    const rest = groups.filter(g => !NEEDS_ACTION.has(bucketOf.get(g.leader.id)!));
    return { action, rest };
  }, [groups, filter, bucketOf]);

  const stampReviewed = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const { error } = await db.from('patient_lab_requests')
      .update({ admin_viewed_at: now, admin_viewed_by_user_id: user?.id || null })
      .in('id', ids);
    if (error) throw error;
    setRows(prev => prev.map(r => ids.includes(r.id) && !r.admin_viewed_at ? { ...r, admin_viewed_at: now } : r));
  }, [user?.id]);

  const openRow = useCallback(async (row: LabOrderRow) => {
    setSelectedRow(row);
    setFilePreviewUrl(row.lab_order_file_path ? publicStorageUrl('lab-orders', row.lab_order_file_path) : null);
    if (!row.admin_viewed_at) {
      try { await stampReviewed([row.id]); } catch { /* non-fatal */ }
    }
  }, [stampReviewed]);

  const markReviewed = useCallback(async (row: LabOrderRow) => {
    try {
      await stampReviewed([row.id]);
      toast.success(`${row.patient_name} marked reviewed`);
    } catch (e: any) { toast.error(e?.message || 'Failed to mark reviewed'); }
  }, [stampReviewed]);

  const markAllAsViewed = async () => {
    if (unreviewedIds.length === 0) { toast.info('Nothing new to mark.'); return; }
    try {
      await stampReviewed(unreviewedIds);
      toast.success(`${unreviewedIds.length} order${unreviewedIds.length === 1 ? '' : 's'} marked reviewed`);
    } catch (e: any) { toast.error(e?.message || 'Failed to mark'); }
  };

  const handleSendBookingLink = useCallback((row: LabOrderRow) => {
    const [first, ...rest] = (row.patient_name || '').split(/\s+/);
    setSendLinkPatient({
      id: row.resolved_patient_id || null,
      firstName: first || row.patient_name || 'patient',
      lastName: rest.join(' '),
      email: row.patient_email,
      phone: row.patient_phone,
    });
    // Well-known partner orgs map to their canonical service_type so the
    // user can one-tap send. Falls back to 'mobile'.
    const orgNameLower = (row.organization_name || '').toLowerCase();
    const inferredServiceType =
      orgNameLower.includes('elite medical') ? 'partner-elite-medical-concierge' :
      orgNameLower.includes('nd wellness') ? 'partner-nd-wellness' :
      orgNameLower.includes('naturamed') ? 'partner-naturamed' :
      orgNameLower.includes('restoration place') ? 'partner-restoration-place' :
      orgNameLower.includes('aristotle') ? 'partner-aristotle-education' :
      'mobile';
    setSendLinkContext({
      organizationId: row.organization_id,
      organizationName: row.organization_name || null,
      labOrderPath: row.lab_order_file_path,
      serviceType: inferredServiceType,
    });
    setSendLinkOpen(true);
  }, []);

  const handlers: RowHandlers = {
    basePath, canEditAutoFulfill,
    onOpen: openRow, onSendLink: handleSendBookingLink, onMarkReviewed: markReviewed,
  };

  const onAutoFulfillChange = (orgId: string, enabled: boolean) => {
    setOrgMap(prev => {
      const next = new Map(prev);
      const cur = next.get(orgId);
      if (cur) next.set(orgId, { ...cur, auto_fulfill_lab_orders: enabled });
      return next;
    });
  };

  const optedOutOrgs = useMemo(() => Array.from(orgMap.values()).filter(o => !o.auto_fulfill_lab_orders).map(o => o.name), [orgMap]);
  const activeFilter = FILTERS.find(f => f.key === filter)!;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900">
            <FlaskConical className="h-6 w-6 text-[#B91C1C]" aria-hidden="true" />
            Lab orders
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every order a provider's office has placed — updates in real time.
            {unreviewedIds.length > 0 && (
              <span className="ml-1 font-medium text-emerald-700">{unreviewedIds.length} unreviewed.</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={cn('px-3 h-10 sm:h-9 text-xs font-medium transition', viewMode === 'list' ? 'bg-[#B91C1C] text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('by_org')}
              aria-pressed={viewMode === 'by_org'}
              className={cn('px-3 h-10 sm:h-9 text-xs font-medium border-l border-gray-200 transition', viewMode === 'by_org' ? 'bg-[#B91C1C] text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}
            >
              By provider
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {unreviewedIds.length > 0 && (
            <Button size="sm" onClick={markAllAsViewed} className="gap-1.5 text-xs h-10 sm:h-9 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Eye className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Mark all reviewed</span>
              <span className="sm:hidden">Reviewed · {unreviewedIds.length}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Stat tiles — click to filter. The five tiles partition every row. */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible snap-x">
        <div className="grid grid-flow-col auto-cols-[46%] sm:auto-cols-auto sm:grid-cols-5 sm:grid-flow-row gap-2" role="group" aria-label="Order counts">
          {TILE_KEYS.map(k => {
            const def = FILTERS.find(f => f.key === k)!;
            const active = filter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(active ? 'all' : k)}
                aria-pressed={active}
                title={def.desc}
                className={cn(
                  'text-left rounded-lg border px-3 py-2.5 min-h-[64px] snap-start transition shadow-sm',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                  active ? cn('ring-2 ring-[#B91C1C]/30', TILE_STYLE[k]) : 'bg-white border-gray-200 hover:border-[#B91C1C]/40',
                )}
              >
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 truncate">{def.label}</p>
                <p className={cn('text-2xl font-bold leading-tight mt-0.5', k === 'needs_action' && counts[k] > 0 && !active && 'text-red-700')}>
                  {loading ? '–' : counts[k]}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <AutoFulfillNotice optedOut={optedOutOrgs} onShowByProvider={() => setViewMode('by_org')} />

      {lastError && (
        <Card className="border-red-300 bg-red-50" role="alert">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs flex-1">
              <p className="font-semibold text-red-800">Couldn't load lab orders</p>
              <p className="text-red-700 mt-0.5 font-mono break-all">{lastError}</p>
              <p className="text-red-600 mt-1">If this says "JWT" or "401/403", log out and back in to refresh your session.</p>
            </div>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={refresh}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Search + filter chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search patient, provider, email, phone, test…"
              aria-label="Search lab orders"
              className="h-10 sm:h-9 pl-8 text-sm"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setGroupDupes(v => !v)}
                aria-pressed={groupDupes}
                className={cn('inline-flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-md border text-xs font-medium transition whitespace-nowrap',
                  groupDupes ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')}
              >
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Group duplicates</span>
                {hiddenDupes > 0 && <span className={cn('rounded-full px-1.5 text-[10px]', groupDupes ? 'bg-white/20' : 'bg-gray-100')}>{hiddenDupes}</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent>Fold orders for the same patient, provider and day under one row</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap" role="group" aria-label="Status filter">
          {FILTERS.map(f => {
            const active = filter === f.key;
            const n = counts[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                title={f.desc}
                className={cn(
                  'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                  active ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
                  !active && n === 0 && 'text-gray-400',
                )}
              >
                {f.key !== 'all' && f.key !== 'needs_action' && (
                  <span className={cn('w-1.5 h-1.5 rounded-full', active ? 'bg-white' : BUCKET_META[f.key as Bucket].dot)} aria-hidden="true" />
                )}
                {f.label}
                <span className={cn('tabular-nums', active ? 'opacity-90' : 'text-gray-500')}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      {loading && rows.length === 0 ? (
        <LoadingRows />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          filterLabel={activeFilter.label}
          filterDesc={activeFilter.desc}
          hasSearch={search.trim() !== ''}
          total={rows.length}
          onReset={() => { setFilter('all'); setSearch(''); }}
        />
      ) : viewMode === 'by_org' ? (
        <GroupedByOrgView groups={groups} orgMap={orgMap} bucketOf={bucketOf} handlers={handlers} onAutoFulfillChange={onAutoFulfillChange} />
      ) : lanes ? (
        <div className="space-y-5">
          <section aria-labelledby="lane-action">
            <LaneHeader id="lane-action" title="Needs action" count={lanes.action.length} tone="red" />
            <OrderRows groups={lanes.action} bucketOf={bucketOf} handlers={handlers} />
          </section>
          {lanes.rest.length > 0 && (
            <section aria-labelledby="lane-rest">
              <LaneHeader id="lane-rest" title="Everything else" count={lanes.rest.length} tone="gray" />
              <OrderRows groups={lanes.rest} bucketOf={bucketOf} handlers={handlers} />
            </section>
          )}
        </div>
      ) : (
        <OrderRows groups={groups} bucketOf={bucketOf} handlers={handlers} />
      )}

      <p className="text-[11px] text-gray-400">
        Showing {filteredRows.length} of {rows.length} order{rows.length === 1 ? '' : 's'}
        {hiddenDupes > 0 && groupDupes ? ` · ${hiddenDupes} duplicate${hiddenDupes === 1 ? '' : 's'} folded` : ''}
        {rows.length >= 500 ? ' · showing the newest 500' : ''}
      </p>

      {selectedRow && (
        <LabOrderDetailDrawer
          row={selectedRow}
          bucket={bucketOf.get(selectedRow.id) || deriveBucket(selectedRow)}
          orgName={selectedRow.organization_name || null}
          filePreviewUrl={filePreviewUrl}
          basePath={basePath}
          onClose={() => { setSelectedRow(null); setFilePreviewUrl(null); }}
          onSendLink={() => handleSendBookingLink(selectedRow)}
        />
      )}

      <SendBookingLinkModal
        open={sendLinkOpen}
        onClose={() => {
          setSendLinkOpen(false);
          setSendLinkPatient(null);
          setSendLinkContext({ organizationId: null, organizationName: null, labOrderPath: null, serviceType: null });
        }}
        patient={sendLinkPatient}
        presetOrganizationId={sendLinkContext.organizationId}
        presetOrganizationName={sendLinkContext.organizationName}
        presetLabOrderPath={sendLinkContext.labOrderPath}
        presetServiceType={sendLinkContext.serviceType}
      />
    </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Small presentational pieces
// ──────────────────────────────────────────────────────────────────
const LaneHeader: React.FC<{ id: string; title: string; count: number; tone: 'red' | 'gray' }> = ({ id, title, count, tone }) => (
  <div className="flex items-center gap-2 mb-2">
    <h2 id={id} className={cn('text-sm font-bold', tone === 'red' ? 'text-red-800' : 'text-gray-700')}>{title}</h2>
    <span className={cn('inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full', tone === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')}>{count}</span>
  </div>
);

const LoadingRows: React.FC = () => (
  <div className="space-y-1.5" aria-busy="true" aria-label="Loading lab orders">
    {[1, 2, 3, 4, 5].map(i => (
      <Card key={i} className="shadow-sm">
        <CardContent className="p-3 flex items-center gap-3 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-3.5 bg-gray-200 rounded w-32" />
              <div className="h-3 bg-gray-100 rounded w-16" />
            </div>
            <div className="h-2.5 bg-gray-100 rounded w-48" />
          </div>
          <div className="h-7 w-20 bg-gray-100 rounded flex-shrink-0 hidden sm:block" />
        </CardContent>
      </Card>
    ))}
  </div>
);

const EmptyState: React.FC<{ filterLabel: string; filterDesc: string; hasSearch: boolean; total: number; onReset: () => void }> = ({ filterLabel, filterDesc, hasSearch, total, onReset }) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center">
      <FlaskConical className="h-10 w-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
      {total === 0 ? (
        <>
          <p className="text-sm font-semibold text-gray-700">No lab orders yet.</p>
          <p className="text-xs text-gray-500 mt-1">Orders appear here the moment a provider's office uploads one.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-700">
            {hasSearch ? 'No orders match your search.' : `Nothing in "${filterLabel}".`}
          </p>
          <p className="text-xs text-gray-500 mt-1">{hasSearch ? 'Try a patient name, provider, email, phone or test.' : filterDesc}</p>
          <Button variant="outline" size="sm" className="mt-3 text-xs h-9" onClick={onReset}>
            Show all {total} orders
          </Button>
        </>
      )}
    </CardContent>
  </Card>
);

const StatusPill: React.FC<{ row: LabOrderRow; bucket: Bucket; className?: string }> = ({ row, bucket, className }) => {
  const meta = BUCKET_META[bucket];
  const left = drawByDaysLeft(row.draw_by_date);
  let text = statusLabel(row);
  if (bucket === 'overdue' && left !== null) text = `Overdue ${Math.abs(left)}d`;
  if (bucket === 'awaiting_patient') {
    const age = differenceInCalendarDays(new Date(), new Date(row.patient_notified_at || row.admin_viewed_at || row.created_at));
    if (age >= 5) text = `Awaiting patient · ${age}d`;
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 h-6 rounded-full border text-[11px] font-semibold whitespace-nowrap', meta.pill, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {text}
    </span>
  );
};

const DrawBy: React.FC<{ row: LabOrderRow; bucket: Bucket }> = ({ row, bucket }) => {
  if (!row.draw_by_date) return <span className="text-gray-400">—</span>;
  const left = drawByDaysLeft(row.draw_by_date);
  const d = format(new Date(row.draw_by_date + 'T12:00:00'), 'MMM d');
  const open = bucket === 'new' || bucket === 'overdue' || bucket === 'awaiting_provider' || bucket === 'awaiting_patient';
  if (left === null) return <span>{d}</span>;
  if (bucket === 'overdue') {
    return <span className="text-red-700 font-semibold">{d} <span className="font-normal">· {Math.abs(left)}d late</span></span>;
  }
  if (open && left <= 3) {
    return <span className="text-amber-700 font-semibold">{d} <span className="font-normal">· {left === 0 ? 'today' : `${left}d left`}</span></span>;
  }
  return <span className="text-gray-700">{d}</span>;
};

const TestsSummary: React.FC<{ row: LabOrderRow; max?: number }> = ({ row, max = 3 }) => {
  const panels = panelsOf(row);
  if (panels.length === 0) return <span className="text-gray-400">—</span>;
  const shown = panels.slice(0, max);
  const extra = panels.length - shown.length;
  const flags = [row.fasting_required && 'Fasting', row.urine_required && 'Urine', row.gtt_required && 'GTT'].filter(Boolean) as string[];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block max-w-full truncate align-middle cursor-default">
          {shown.join(', ')}{extra > 0 ? ` +${extra}` : ''}
          {flags.length > 0 && <span className="text-gray-400"> · {flags.join(' · ')}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {panels.join(', ')}
        {flags.length > 0 && <div className="mt-1 text-gray-300">{flags.join(' · ')}</div>}
      </TooltipContent>
    </Tooltip>
  );
};

const PrimaryAction: React.FC<{ row: LabOrderRow; bucket: Bucket; h: RowHandlers; className?: string }> = ({ row, bucket, h, className }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (row.status === 'pending_schedule') {
    const resend = !!row.patient_notified_at;
    return (
      <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onSendLink(row); }}>
        <Zap className="h-3.5 w-3.5" aria-hidden="true" /> {resend ? 'Resend link' : 'Send booking link'}
      </Button>
    );
  }
  if (bucket === 'awaiting_provider') {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5 border-orange-300 text-orange-800 hover:bg-orange-50', className)} onClick={(e) => { stop(e); h.onOpen(row); }}>
        <CreditCard className="h-3.5 w-3.5" aria-hidden="true" /> Provider card needed
      </Button>
    );
  }
  if (row.status === 'scheduled' && row.appointment_id) {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} asChild>
        <a href={`${h.basePath}/calendar?appointment=${row.appointment_id}`} target="_blank" rel="noopener noreferrer" onClick={stop}>
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> View appointment
        </a>
      </Button>
    );
  }
  return null;
};

/** Overflow menu — every secondary action in one predictable place. */
const RowMenu: React.FC<{ row: LabOrderRow; h: RowHandlers; className?: string }> = ({ row, h, className }) => {
  const patientUrl = `${window.location.origin}/lab-request/${row.access_token}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${row.patient_name}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => h.onOpen(row)}>
          <FileText className="h-4 w-4 mr-2" aria-hidden="true" /> Open order
        </DropdownMenuItem>
        {row.status === 'pending_schedule' && (
          <DropdownMenuItem onSelect={() => h.onSendLink(row)}>
            <Zap className="h-4 w-4 mr-2" aria-hidden="true" /> {row.patient_notified_at ? 'Resend booking link' : 'Send booking link'}
          </DropdownMenuItem>
        )}
        {row.appointment_id && (
          <DropdownMenuItem onSelect={() => window.open(`${h.basePath}/calendar?appointment=${row.appointment_id}`, '_blank', 'noopener,noreferrer')}>
            <Calendar className="h-4 w-4 mr-2" aria-hidden="true" /> View appointment
          </DropdownMenuItem>
        )}
        {isUnreviewed(row) && (
          <DropdownMenuItem onSelect={() => h.onMarkReviewed(row)}>
            <Check className="h-4 w-4 mr-2" aria-hidden="true" /> Mark reviewed
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {row.lab_order_file_path && (
          <DropdownMenuItem onSelect={() => downloadRow(row)}>
            <Download className="h-4 w-4 mr-2" aria-hidden="true" /> Download order
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => window.open(patientUrl, '_blank', 'noopener,noreferrer')}>
          <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" /> Open patient view
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copyText(patientUrl, 'Booking link')}>
          <Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy booking link
        </DropdownMenuItem>
        {(row.patient_phone || row.patient_email) && <DropdownMenuSeparator />}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const rowKeyHandler = (open: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return; // let buttons/links inside handle their own keys
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
};

// ──────────────────────────────────────────────────────────────────
// Rows — table on ≥md, cards below. One component so both the flat list,
// the lanes and the per-provider rollup render identically.
// ──────────────────────────────────────────────────────────────────
const OrderRows: React.FC<{
  groups: OrderGroup[];
  bucketOf: Map<string, Bucket>;
  handlers: RowHandlers;
  compact?: boolean;
}> = ({ groups, bucketOf, handlers, compact }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const bucket = (r: LabOrderRow) => bucketOf.get(r.id) || deriveBucket(r);

  return (
    <>
      {/* Desktop table */}
      <div className={cn('hidden md:block overflow-hidden', compact ? '' : 'rounded-lg border border-gray-200 bg-white shadow-sm')}>
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500 pl-4">Patient</TableHead>
              {!compact && <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500">Provider</TableHead>}
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500">Tests</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500 whitespace-nowrap">Draw by</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500">Status</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500 whitespace-nowrap">Last activity</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500 text-right pr-3">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(g => {
              const isOpen = expanded.has(g.leader.id);
              const render = (row: LabOrderRow, nested: boolean) => {
                const b = bucket(row);
                const unread = isUnreviewed(row);
                const act = lastActivity(row);
                const open = () => handlers.onOpen(row);
                return (
                  <TableRow
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={open}
                    onKeyDown={rowKeyHandler(open)}
                    aria-label={`${row.patient_name}, ${statusLabel(row)}. Open order`}
                    className={cn(
                      'cursor-pointer focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40',
                      nested ? 'bg-gray-50/70' : 'bg-white',
                      b === 'overdue' && !nested && 'border-l-4 border-l-red-500',
                      b === 'new' && !nested && 'border-l-4 border-l-emerald-500',
                      b === 'awaiting_provider' && !nested && 'border-l-4 border-l-orange-400',
                    )}
                  >
                    <TableCell className={cn('py-2.5 pl-4 align-top', nested && 'pl-10')}>
                      <div className="flex items-start gap-2 min-w-0">
                        {unread && !nested && <span className="mt-1.5 w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" aria-label="Unreviewed" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn('text-sm truncate', unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800')}>{row.patient_name}</span>
                            {!nested && g.others.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggle(g.leader.id); }}
                                aria-expanded={isOpen}
                                className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold hover:bg-purple-100"
                                title="Other orders for this patient from the same provider on the same day"
                              >
                                <Layers className="h-2.5 w-2.5" aria-hidden="true" /> +{g.others.length}
                                <ChevronDown className={cn('h-3 w-3 transition', isOpen && 'rotate-180')} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 truncate">
                            {row.patient_phone || row.patient_email || 'No contact on file'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    {!compact && (
                      <TableCell className="py-2.5 align-top text-xs text-gray-700 max-w-[180px]">
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <Building2 className="h-3 w-3 text-purple-600 flex-shrink-0" aria-hidden="true" />
                          <span className="truncate">{row.organization_name || <span className="text-gray-400">Unattributed</span>}</span>
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="py-2.5 align-top text-xs text-gray-700 max-w-[240px]">
                      <TestsSummary row={row} />
                    </TableCell>
                    <TableCell className="py-2.5 align-top text-xs whitespace-nowrap">
                      <DrawBy row={row} bucket={b} />
                    </TableCell>
                    <TableCell className="py-2.5 align-top">
                      <StatusPill row={row} bucket={b} />
                    </TableCell>
                    <TableCell className="py-2.5 align-top text-xs text-gray-600 whitespace-nowrap">
                      <span className="block">{act.label}</span>
                      <span className="block text-[11px] text-gray-400">{ago(act.at)}</span>
                    </TableCell>
                    <TableCell className="py-2 align-top pr-3">
                      <div className="flex items-center justify-end gap-1">
                        <PrimaryAction row={row} bucket={b} h={handlers} className="h-9" />
                        {row.lab_order_file_path && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label="Download lab order" onClick={(e) => { e.stopPropagation(); downloadRow(row); }}>
                                <Download className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download order</TooltipContent>
                          </Tooltip>
                        )}
                        <RowMenu row={row} h={handlers} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              };
              return (
                <React.Fragment key={g.leader.id}>
                  {render(g.leader, false)}
                  {isOpen && g.others.map(o => render(o, true))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {groups.map(g => {
          const isOpen = expanded.has(g.leader.id);
          const render = (row: LabOrderRow, nested: boolean) => {
            const b = bucket(row);
            const unread = isUnreviewed(row);
            const act = lastActivity(row);
            const open = () => handlers.onOpen(row);
            return (
              <Card
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={open}
                onKeyDown={rowKeyHandler(open)}
                aria-label={`${row.patient_name}, ${statusLabel(row)}. Open order`}
                className={cn(
                  'shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                  nested && 'ml-4 bg-gray-50/70',
                  b === 'overdue' && 'border-l-4 border-l-red-500',
                  b === 'new' && 'border-l-4 border-l-emerald-500',
                  b === 'awaiting_provider' && 'border-l-4 border-l-orange-400',
                )}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {unread && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" aria-label="Unreviewed" />}
                        <span className={cn('text-sm', unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800')}>{row.patient_name}</span>
                        {!nested && g.others.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggle(g.leader.id); }}
                            aria-expanded={isOpen}
                            className="inline-flex items-center gap-0.5 h-6 px-2 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold"
                          >
                            <Layers className="h-2.5 w-2.5" aria-hidden="true" /> +{g.others.length}
                            <ChevronDown className={cn('h-3 w-3 transition', isOpen && 'rotate-180')} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {!compact && row.organization_name && (
                        <p className="text-[11px] text-purple-700 flex items-center gap-1 mt-0.5 truncate">
                          <Building2 className="h-3 w-3 flex-shrink-0" aria-hidden="true" /> <span className="truncate">{row.organization_name}</span>
                        </p>
                      )}
                    </div>
                    <StatusPill row={row} bucket={b} />
                  </div>
                  <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>Draw by <DrawBy row={row} bucket={b} /></span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-500">{act.label} {ago(act.at)}</span>
                  </div>
                  <div className="text-xs text-gray-700 truncate"><TestsSummary row={row} /></div>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <PrimaryAction row={row} bucket={b} h={handlers} className="h-11 flex-1 justify-center" />
                    {row.lab_order_file_path && (
                      <Button size="sm" variant="outline" className="h-11 w-11 p-0 flex-shrink-0" aria-label="Download lab order" onClick={(e) => { e.stopPropagation(); downloadRow(row); }}>
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                    <RowMenu row={row} h={handlers} className="h-11 w-11 flex-shrink-0 border border-gray-200" />
                    <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" aria-hidden="true" />
                  </div>
                </CardContent>
              </Card>
            );
          };
          return (
            <React.Fragment key={g.leader.id}>
              {render(g.leader, false)}
              {isOpen && g.others.map(o => render(o, true))}
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
};

// ──────────────────────────────────────────────────────────────────
// Auto-fulfill notice — one line, expandable.
// ──────────────────────────────────────────────────────────────────
const AutoFulfillNotice: React.FC<{ optedOut: string[]; onShowByProvider: () => void }> = ({ optedOut, onShowByProvider }) => {
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('convelabs_lab_orders_autofulfill_help') === '1'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem('convelabs_lab_orders_autofulfill_help', open ? '1' : '0'); } catch {} }, [open]);
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 text-xs">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 min-h-[44px] sm:min-h-[40px] text-left"
      >
        <Zap className="h-3.5 w-3.5 text-emerald-700 flex-shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0 text-emerald-900">
          <span className="font-semibold">Auto-fulfill is ON by default</span>
          <span className="text-emerald-800"> — patients get the booking link the moment an order is uploaded.</span>
          {optedOut.length > 0 && (
            <span className="text-emerald-800"> {optedOut.length} provider{optedOut.length === 1 ? '' : 's'} opted out.</span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-emerald-700 flex-shrink-0 transition', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div className="px-3 pb-3 text-emerald-900 space-y-1.5 leading-relaxed">
          <p>When a provider uploads a lab order, the system sends the patient a HIPAA-safe booking link by SMS and email automatically. Those orders land here as <strong>Awaiting patient</strong>.</p>
          <p>If the provider's office still needs to save a payment card, the order waits as <strong>Awaiting provider card</strong> and the patient is not contacted until it's done.</p>
          <p>
            To review an office's orders by hand before the patient is texted, switch to{' '}
            <button type="button" className="underline font-semibold" onClick={onShowByProvider}>By provider</button>
            {' '}and turn Auto-fulfill off for that office (admin only).
            {optedOut.length > 0 && <> Currently off for: <strong>{optedOut.join(', ')}</strong>.</>}
          </p>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Per-provider rollup
// ──────────────────────────────────────────────────────────────────
const GroupedByOrgView: React.FC<{
  groups: OrderGroup[];
  orgMap: Map<string, OrgMeta>;
  bucketOf: Map<string, Bucket>;
  handlers: RowHandlers;
  onAutoFulfillChange: (orgId: string, enabled: boolean) => void;
}> = ({ groups, orgMap, bucketOf, handlers, onAutoFulfillChange }) => {
  const orgGroups = useMemo(() => {
    const m = new Map<string, { orgId: string | null; name: string; groups: OrderGroup[]; rows: LabOrderRow[] }>();
    for (const g of groups) {
      const r = g.leader;
      const key = r.organization_id || '__unattributed__';
      const name = r.organization_id ? (orgMap.get(r.organization_id)?.name || 'Unknown org') : 'Unattributed (no provider linked)';
      if (!m.has(key)) m.set(key, { orgId: r.organization_id, name, groups: [], rows: [] });
      const entry = m.get(key)!;
      entry.groups.push(g);
      entry.rows.push(g.leader, ...g.others);
    }
    return Array.from(m.values()).sort((a, b) => b.rows.length - a.rows.length);
  }, [groups, orgMap]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setCollapsed(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="space-y-4">
      {orgGroups.map(g => {
        const key = g.orgId || g.name;
        const tally: Partial<Record<Bucket, number>> = {};
        for (const r of g.rows) { const b = bucketOf.get(r.id) || deriveBucket(r); tally[b] = (tally[b] || 0) + 1; }
        const meta = g.orgId ? orgMap.get(g.orgId) : null;
        const isCollapsed = collapsed.has(key);
        return (
          <Card key={key} className="shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-purple-50 to-white border-b border-purple-100 px-3 sm:px-4 py-2.5 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-expanded={!isCollapsed}
                className="flex items-center gap-2 min-w-0 text-left min-h-[36px]"
              >
                <ChevronDown className={cn('h-4 w-4 text-purple-700 flex-shrink-0 transition', isCollapsed && '-rotate-90')} aria-hidden="true" />
                <Building2 className="h-4 w-4 text-purple-700 flex-shrink-0" aria-hidden="true" />
                <h3 className="font-bold text-sm text-gray-900 truncate">{g.name}</h3>
                <span className="text-xs text-gray-500 flex-shrink-0">· {g.rows.length} order{g.rows.length === 1 ? '' : 's'}</span>
              </button>
              <div className="flex items-center gap-1.5 overflow-x-auto sm:overflow-visible sm:flex-wrap pb-1 sm:pb-0">
                {(['new', 'overdue', 'awaiting_provider', 'awaiting_patient', 'scheduled', 'completed', 'closed'] as Bucket[]).map(b =>
                  tally[b] ? (
                    <span key={b} className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[10px] font-semibold whitespace-nowrap', BUCKET_META[b].pill)}>
                      {tally[b]} {BUCKET_META[b].short.toLowerCase()}
                    </span>
                  ) : null,
                )}
                {g.orgId && (
                  <div className="flex-shrink-0 ml-auto sm:ml-1">
                    <AutoFulfillToggle
                      orgId={g.orgId}
                      enabled={meta?.auto_fulfill_lab_orders ?? false}
                      canEdit={handlers.canEditAutoFulfill}
                      onChange={(en) => onAutoFulfillChange(g.orgId!, en)}
                    />
                  </div>
                )}
              </div>
            </div>
            {!isCollapsed && (
              <div className="p-2 sm:p-0 bg-white">
                <OrderRows groups={g.groups} bucketOf={bucketOf} handlers={handlers} compact />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Auto-fulfill toggle per provider. Persists organizations.auto_fulfill_lab_orders.
// Only super_admin can flip it; office managers see the state read-only.
// ──────────────────────────────────────────────────────────────────
const AutoFulfillToggle: React.FC<{
  orgId: string;
  enabled: boolean;
  canEdit: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ orgId, enabled, canEdit, onChange }) => {
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    if (saving || !canEdit) return;
    const next = !enabled;
    setSaving(true);
    onChange(next);
    try {
      const { error } = await db.from('organizations').update({ auto_fulfill_lab_orders: next }).eq('id', orgId);
      if (error) throw error;
      toast.success(next
        ? 'Auto-fulfill ON — patients get the booking link the moment this provider submits an order'
        : 'Auto-fulfill OFF — you\'ll review every new order from this office before the patient is texted');
    } catch (e: any) {
      onChange(!next);
      toast.error(`Couldn't update: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const label = enabled ? 'Auto-fulfill ON' : 'Auto-fulfill OFF';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${label} for this provider`}
          onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          disabled={saving || !canEdit}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full text-[11px] font-semibold border transition',
            enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-gray-50 text-gray-600 border-gray-300',
            canEdit ? (enabled ? 'hover:bg-emerald-100' : 'hover:bg-gray-100') : 'cursor-default',
            saving && 'opacity-60',
          )}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <span className={cn('w-2 h-2 rounded-full', enabled ? 'bg-emerald-500' : 'bg-gray-400')} aria-hidden="true" />}
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {enabled
          ? 'Patients from this office get the booking link automatically on upload.'
          : 'New orders from this office wait as "New" until you send the booking link.'}
        {!canEdit && <div className="mt-1 text-gray-300">Only a super admin can change this.</div>}
      </TooltipContent>
    </Tooltip>
  );
};

// ──────────────────────────────────────────────────────────────────
// Detail drawer — centered dialog on ≥sm, bottom sheet on phones.
// ──────────────────────────────────────────────────────────────────
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <span className="text-gray-500">{label}</span>
    <span className="min-w-0 break-words">{children}</span>
  </>
);

const LabOrderDetailDrawer: React.FC<{
  row: LabOrderRow;
  bucket: Bucket;
  orgName: string | null;
  filePreviewUrl: string | null;
  basePath: string;
  onClose: () => void;
  onSendLink: () => void;
}> = ({ row, bucket, orgName, filePreviewUrl, basePath, onClose, onSendLink }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = `lab-order-title-${row.id}`;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  const patientUrl = `${window.location.origin}/lab-request/${row.access_token}`;
  const panels = panelsOf(row);
  const act = lastActivity(row);

  const timeline: Array<{ at: string | null; label: string }> = [
    { at: row.created_at, label: 'Order received' },
    { at: row.admin_viewed_at, label: 'Reviewed by admin' },
    { at: row.provider_paid_at, label: 'Provider card saved' },
    { at: row.patient_notified_at, label: 'Booking link sent to patient' },
    { at: row.patient_reminded_at, label: `Reminder sent${row.patient_reminder_count ? ` (${row.patient_reminder_count}×)` : ''}` },
    { at: row.patient_viewed_at, label: 'Patient opened the link' },
    { at: row.last_inbound_sms_at, label: 'Patient replied by SMS' },
    { at: row.patient_scheduled_at, label: 'Patient booked' },
    { at: row.specimen_delivered_at, label: `Specimen delivered${row.specimen_tracking_id ? ` · ${row.specimen_tracking_id}` : ''}` },
    { at: row.completed_at, label: 'Completed' },
    { at: row.cancelled_at, label: 'Cancelled' },
  ].filter(t => !!t.at).sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime());

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full sm:max-w-4xl mt-auto sm:mt-0 sm:max-h-[92vh] max-h-[90vh] overflow-y-auto shadow-2xl rounded-b-none sm:rounded-lg rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-0">
          <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-4 sm:p-5 sticky top-0 z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider opacity-90">Lab order</p>
                <h2 id={titleId} className="text-lg sm:text-xl font-bold mt-0.5 truncate">{row.patient_name}</h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <StatusPill row={row} bucket={bucket} className="bg-white/95" />
                  {orgName && (
                    <span className="text-sm opacity-95 flex items-center gap-1.5 min-w-0">
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /> <span className="truncate">{orgName}</span>
                    </span>
                  )}
                </div>
              </div>
              <Button ref={closeRef} size="sm" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10 h-10 w-10 p-0 flex-shrink-0" aria-label="Close">
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {bucket === 'awaiting_provider' && (
              <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900 flex items-start gap-2">
                <CreditCard className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p>The provider's office hasn't finished saving a payment card for this order, so the patient hasn't been contacted yet. Once the card is on file the booking link goes out automatically.</p>
              </div>
            )}
            {bucket === 'overdue' && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p>The draw-by date ({row.draw_by_date}) has passed and nothing is booked. Call the patient or resend the link.</p>
              </div>
            )}

            {/* Quick actions */}
            <div className="flex sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible -mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0">
              {row.status === 'pending_schedule' && (
                <Button onClick={onSendLink} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-10 text-xs flex-shrink-0">
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" /> {row.patient_notified_at ? 'Resend booking link' : 'Send booking link'}
                </Button>
              )}
              {row.patient_phone && (
                <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
                  <a href={`tel:${row.patient_phone}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call</a>
                </Button>
              )}
              {row.patient_email && (
                <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
                  <a href={`mailto:${row.patient_email}`}><Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email</a>
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
                <a href={patientUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Patient view
                </a>
              </Button>
              <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={() => copyText(patientUrl, 'Booking link')}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy link
              </Button>
              {row.appointment_id && (
                <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
                  <a href={`${basePath}/calendar?appointment=${row.appointment_id}`} target="_blank" rel="noopener noreferrer">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> View appointment
                  </a>
                </Button>
              )}
              {row.lab_order_file_path && (
                <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={() => downloadRow(row)}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Patient</p>
                <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                  <Field label="Email">{row.patient_email || '—'}</Field>
                  <Field label="Phone">{row.patient_phone || '—'}</Field>
                  <Field label="DOB">{row.patient_dob || '—'}</Field>
                  <Field label="Patient ID"><span className="font-mono text-[10px]">{row.resolved_patient_id || '—'}</span></Field>
                  {row.household_group_id && <Field label="Household"><span className="font-mono text-[10px]">{row.household_group_id.slice(0, 8)}…</span></Field>}
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Order</p>
                <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                  <Field label="Status"><span className="font-medium">{statusLabel(row)}</span> <span className="text-gray-400 font-mono text-[10px]">({row.status})</span></Field>
                  <Field label="Draw by"><DrawBy row={row} bucket={bucket} /></Field>
                  <Field label="Fasting">{row.fasting_required ? 'Yes' : 'No'}</Field>
                  <Field label="Urine">{row.urine_required ? 'Yes' : 'No'}</Field>
                  {row.gtt_required && <Field label="GTT">Yes</Field>}
                  {row.next_doctor_appt_date && <Field label="Next doctor appt">{row.next_doctor_appt_date}</Field>}
                  <Field label="Received">{format(new Date(row.created_at), 'MMM d, yyyy h:mm a')}</Field>
                  {row.provider_payment_status && row.provider_payment_status !== 'none' && (
                    <Field label="Provider payment"><span className="capitalize">{row.provider_payment_status.replace(/_/g, ' ')}</span></Field>
                  )}
                  {row.access_token_expires_at && <Field label="Link expires">{format(new Date(row.access_token_expires_at), 'MMM d, yyyy')}</Field>}
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Activity</p>
                {timeline.length === 0 ? (
                  <p className="text-xs text-gray-500">No activity yet.</p>
                ) : (
                  <ol className="space-y-1 text-xs">
                    {timeline.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0', i === timeline.length - 1 ? 'bg-[#B91C1C]' : 'bg-gray-300')} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="text-gray-800">{t.label}</span>
                          <span className="block text-[10px] text-gray-400">{format(new Date(t.at!), 'MMM d, h:mm a')} · {ago(t.at!)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {row.last_inbound_sms_body && (
                  <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1 mt-1">
                    Last reply: “{row.last_inbound_sms_body}”
                  </p>
                )}
              </div>
            </div>

            {row.admin_notes && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Admin notes</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap bg-amber-50 border border-amber-200 rounded px-3 py-2">{row.admin_notes}</p>
              </div>
            )}

            {panels.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Detected tests (OCR)</p>
                <div className="flex flex-wrap gap-1.5">
                  {panels.map((p, i) => (
                    <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">{p}</span>
                  ))}
                </div>
              </div>
            )}

            {row.lab_order_file_path && (
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Lab order document</p>
                  {filePreviewUrl && (
                    <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={() => window.open(filePreviewUrl, '_blank', 'noopener,noreferrer')}>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open in new tab
                    </Button>
                  )}
                </div>
                {filePreviewUrl ? (
                  <object data={filePreviewUrl} type="application/pdf" className="w-full h-[55vh] sm:h-[500px] min-h-[300px] border border-gray-200 rounded-md">
                    <iframe src={filePreviewUrl} className="w-full h-full border-0" title="Lab order PDF">
                      <div className="p-6 text-center bg-gray-50">
                        <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
                        <p className="text-sm font-medium text-gray-700">Your browser can't preview this PDF inline.</p>
                        <Button onClick={() => window.open(filePreviewUrl, '_blank', 'noopener,noreferrer')} className="mt-3 bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                          Open PDF in new tab
                        </Button>
                      </div>
                    </iframe>
                  </object>
                ) : (
                  <p className="text-xs text-gray-500">Generating preview…</p>
                )}
              </div>
            )}

            <p className="text-[10px] text-gray-400">Last activity: {act.label} {ago(act.at)} · Order ID <span className="font-mono">{row.id}</span></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LabOrdersTab;
