/**
 * LabOrdersTab — single-glance view of every provider-uploaded lab order.
 *
 * Hormozi structure: dream-outcome KPIs up top, status filter pills, then
 * a per-row action that's contextual to the status — never "what do I do
 * with this?" friction. Real-time toast + badge when a new order lands.
 *
 * Sources:
 *   - patient_lab_requests: the canonical "provider faxed/uploaded an order"
 *     row. Created by /create-lab-request (provider portal) OR by admin via
 *     the CreateLabRequestModal. Status pipeline:
 *       pending_schedule → scheduled → completed (or cancelled / expired)
 *
 * "Unread" semantics: admin_viewed_at IS NULL  →  green dot, badge counts it.
 * Opening the row stamps admin_viewed_at = now() so the badge clears.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  FlaskConical, Loader2, RefreshCw, Search, Filter, Mail, Phone,
  Calendar, CheckCircle2, Clock, AlertTriangle, ExternalLink, Send,
  FileText, Building2, User, ChevronRight, Eye, EyeOff, Zap, Download,
} from 'lucide-react';

// Download helper — fetches the signed URL then triggers a browser download
// with a sensible filename. Works for PDF + image lab orders.
async function downloadLabOrder(path: string, filename: string) {
  try {
    const { data, error } = await supabase.storage.from('lab-orders').createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw error || new Error('no_url');
    // Fetch + blob trick so the browser downloads instead of navigating.
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
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import SendBookingLinkModal from '@/components/admin/SendBookingLinkModal';

type LabRequestStatus = 'pending_schedule' | 'scheduled' | 'completed' | 'cancelled' | 'expired';

interface LabOrderRow {
  id: string;
  organization_id: string | null;
  organization_name?: string | null;
  // patient_lab_requests doesn't have a direct patient_id FK; the resolved
  // tenant_patients.id is looked up downstream by email when we need it
  // (e.g. to open Send Booking Link with the right patient context).
  resolved_patient_id?: string | null;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  patient_dob: string | null;
  lab_order_file_path: string | null;
  lab_order_panels: any;
  fasting_required: boolean | null;
  urine_required: boolean | null;
  draw_by_date: string | null;
  status: LabRequestStatus;
  appointment_id: string | null;
  access_token: string;
  patient_viewed_at: string | null;
  patient_scheduled_at: string | null;
  admin_viewed_at: string | null;
  created_at: string;
}

type FilterKey = 'new' | 'awaiting_patient' | 'scheduled' | 'overdue' | 'completed' | 'all';

const FILTER_DEFINITIONS: Array<{
  key: FilterKey;
  label: string;
  desc: string;
  match: (row: LabOrderRow) => boolean;
  colorClass: string;
}> = [
  {
    key: 'new',
    label: 'New',
    desc: 'Provider uploaded — you haven\'t reviewed yet',
    match: (r) => !r.admin_viewed_at && r.status === 'pending_schedule',
    colorClass: 'bg-emerald-50 border-emerald-300 text-emerald-700',
  },
  {
    key: 'awaiting_patient',
    label: 'Awaiting patient',
    desc: 'Sent — patient hasn\'t scheduled yet',
    match: (r) => r.status === 'pending_schedule' && !!r.admin_viewed_at,
    colorClass: 'bg-amber-50 border-amber-300 text-amber-700',
  },
  {
    key: 'scheduled',
    label: 'Scheduled',
    desc: 'Patient picked a slot · phleb assigned',
    match: (r) => r.status === 'scheduled',
    colorClass: 'bg-blue-50 border-blue-300 text-blue-700',
  },
  {
    key: 'overdue',
    label: 'Overdue',
    desc: 'Past draw-by date · not yet scheduled',
    match: (r) => r.status === 'pending_schedule' && !!r.draw_by_date && new Date(r.draw_by_date).getTime() < Date.now(),
    colorClass: 'bg-red-50 border-red-300 text-red-700',
  },
  {
    key: 'completed',
    label: 'Completed',
    desc: 'Specimen delivered to the lab',
    match: (r) => r.status === 'completed',
    colorClass: 'bg-gray-100 border-gray-300 text-gray-700',
  },
  {
    key: 'all',
    label: 'All',
    desc: 'Every order on file',
    match: () => true,
    colorClass: 'bg-gray-50 border-gray-200 text-gray-600',
  },
];

interface OrgMeta {
  name: string;
  auto_fulfill_lab_orders: boolean;
}

const LabOrdersTab: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<LabOrderRow[]>([]);
  const [orgMap, setOrgMap] = useState<Map<string, OrgMeta>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  // View mode: flat list (default) OR grouped by provider's office.
  // The grouped view is Hormozi's "per-org rollup" — Naquala uses it to
  // call partners and read off "you sent us N, we delivered M" without
  // counting manually. Persisted to localStorage so the choice sticks.
  const [viewMode, setViewMode] = useState<'list' | 'by_org'>(() => {
    try { return (localStorage.getItem('convelabs_lab_orders_view') as any) || 'list'; }
    catch { return 'list'; }
  });
  useEffect(() => { try { localStorage.setItem('convelabs_lab_orders_view', viewMode); } catch {} }, [viewMode]);
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState<LabOrderRow | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [sendLinkOpen, setSendLinkOpen] = useState(false);
  const [sendLinkPatient, setSendLinkPatient] = useState<any>(null);

  const [lastError, setLastError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const { data: lr, error: queryErr } = await supabase
        .from('patient_lab_requests' as any)
        .select('id, organization_id, patient_name, patient_email, patient_phone, patient_dob, lab_order_file_path, lab_order_panels, fasting_required, urine_required, draw_by_date, status, appointment_id, access_token, patient_viewed_at, patient_scheduled_at, admin_viewed_at, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (queryErr) {
        console.error('[LabOrdersTab] query error:', queryErr);
        setLastError(queryErr.message || String(queryErr));
      }
      const list = ((lr as any[]) || []) as LabOrderRow[];
      console.log(`[LabOrdersTab] fetched ${list.length} lab orders`);

      const orgIds = Array.from(new Set(list.map(r => r.organization_id).filter(Boolean) as string[]));
      const oMap = new Map<string, OrgMeta>();
      if (orgIds.length > 0) {
        const { data: orgs } = await supabase
          .from('organizations').select('id, name, auto_fulfill_lab_orders').in('id', orgIds);
        ((orgs as any[]) || []).forEach(o => oMap.set(o.id, {
          name: o.name,
          auto_fulfill_lab_orders: !!o.auto_fulfill_lab_orders,
        }));
      }
      setOrgMap(oMap);

      // Resolve tenant_patients.id by email for each row so the Send
      // Booking Link modal opens with the right patient context. Single
      // round-trip via .in() on emails (much faster than per-row).
      const emails = Array.from(new Set(list.map(r => (r.patient_email || '').toLowerCase().trim()).filter(Boolean)));
      const emailToPatientId = new Map<string, string>();
      if (emails.length > 0) {
        const { data: tps } = await supabase
          .from('tenant_patients')
          .select('id, email')
          .in('email', emails);
        ((tps as any[]) || []).forEach(tp => {
          if (tp.email) emailToPatientId.set(String(tp.email).toLowerCase().trim(), tp.id);
        });
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

  // Real-time: toast + auto-refresh on new lab_request row (provider-uploaded).
  // Updates also trigger refresh so status transitions reflect instantly.
  // Deps deliberately empty — orgMap is read via ref-pattern at toast time to
  // avoid re-subscribing on every refresh (caused channel churn + missed events).
  useEffect(() => {
    const channelName = `admin-lab-orders-feed-${Math.random().toString(36).slice(2, 8)}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'patient_lab_requests' }, (payload: any) => {
        const row = payload?.new || {};
        toast.success(`New lab order: ${row.patient_name || 'a patient'}`, { duration: 6000 });
        refresh();
      })
      .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'patient_lab_requests' }, () => {
        refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Counts for the KPI strip + filter pill badges
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { new: 0, awaiting_patient: 0, scheduled: 0, overdue: 0, completed: 0, all: rows.length };
    for (const r of rows) {
      for (const f of FILTER_DEFINITIONS) {
        if (f.key === 'all') continue;
        if (f.match(r)) c[f.key]++;
      }
    }
    return c;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const def = FILTER_DEFINITIONS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    return rows.filter(r => def.match(r) && (q === '' ||
      (r.patient_name || '').toLowerCase().includes(q) ||
      (r.organization_name || '').toLowerCase().includes(q) ||
      (r.patient_email || '').toLowerCase().includes(q) ||
      (r.patient_phone || '').includes(q)
    ));
  }, [rows, filter, search]);

  const openRow = useCallback(async (row: LabOrderRow) => {
    setSelectedRow(row);
    setFilePreviewUrl(null);
    // Stamp admin_viewed_at if first view — clears it from the New filter + badge
    if (!row.admin_viewed_at) {
      try {
        await supabase.from('patient_lab_requests' as any).update({
          admin_viewed_at: new Date().toISOString(),
          admin_viewed_by_user_id: user?.id || null,
        }).eq('id', row.id);
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, admin_viewed_at: new Date().toISOString() } : r));
      } catch { /* non-fatal */ }
    }
    // Pull a signed URL for the lab-order PDF
    if (row.lab_order_file_path) {
      try {
        const { data } = await supabase.storage.from('lab-orders').createSignedUrl(row.lab_order_file_path, 3600);
        if (data?.signedUrl) setFilePreviewUrl(data.signedUrl);
      } catch { /* non-fatal */ }
    }
  }, [user?.id]);

  const markAllAsViewed = async () => {
    const toMark = rows.filter(r => !r.admin_viewed_at && r.status === 'pending_schedule').map(r => r.id);
    if (toMark.length === 0) { toast.info('Nothing new to mark.'); return; }
    try {
      await supabase.from('patient_lab_requests' as any).update({
        admin_viewed_at: new Date().toISOString(),
        admin_viewed_by_user_id: user?.id || null,
      }).in('id', toMark);
      toast.success(`${toMark.length} order${toMark.length === 1 ? '' : 's'} marked reviewed`);
      refresh();
    } catch (e: any) { toast.error(e?.message || 'Failed to mark'); }
  };

  const handleSendBookingLink = (row: LabOrderRow) => {
    const [first, ...rest] = (row.patient_name || '').split(/\s+/);
    setSendLinkPatient({
      id: row.resolved_patient_id || null,
      firstName: first || row.patient_name || 'patient',
      lastName: rest.join(' '),
      email: row.patient_email,
      phone: row.patient_phone,
    });
    setSendLinkOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* HERO — Hormozi: dream outcome stated up top, with the metric that matters.
          MOBILE: compact title, hidden subtitle, KPI strip switches to horizontal-scroll
          so the user sees an actual row above the fold on a phone. */}
      <Card className="border-2 border-[#B91C1C]/20 bg-gradient-to-br from-red-50/40 to-white shadow-sm">
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-[#B91C1C]" />
                Lab Orders
              </h2>
              <p className="hidden sm:block text-sm text-gray-600 mt-0.5">
                Every order a provider's office has placed for a patient — newest first, real-time.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* View-mode toggle — list vs per-org rollup */}
              <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-3 h-9 sm:h-8 text-xs font-medium ${viewMode === 'list' ? 'bg-[#B91C1C] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  title="Flat list, newest first"
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('by_org')}
                  className={`px-3 h-9 sm:h-8 text-xs font-medium border-l border-gray-200 ${viewMode === 'by_org' ? 'bg-[#B91C1C] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  title="Grouped by provider's office"
                >
                  By provider
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5 text-xs h-9 sm:h-8 min-w-9" disabled={loading} title="Refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              {counts.new > 0 && (
                <Button size="sm" onClick={markAllAsViewed} className="gap-1.5 text-xs h-9 sm:h-8 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Mark all reviewed</span>
                  <span className="sm:hidden">Mark · {counts.new}</span>
                </Button>
              )}
            </div>
          </div>

          {/* KPI strip — horizontal-scroll on phones (snap-x), 5-col grid on ≥sm.
              Phones see all 5 buckets in a thumb-flick instead of a 3-row 2-col grid
              that eats 240px of first-screen real estate. */}
          <div className="-mx-3 sm:mx-0 px-3 sm:px-0 mt-3 sm:mt-4 overflow-x-auto sm:overflow-visible scroll-smooth snap-x snap-mandatory">
            <div className="grid grid-flow-col auto-cols-[42%] sm:auto-cols-auto sm:grid-cols-5 sm:grid-flow-row gap-2 pb-1 sm:pb-0">
            {(['new', 'awaiting_patient', 'scheduled', 'overdue', 'completed'] as FilterKey[]).map(k => {
              const def = FILTER_DEFINITIONS.find(f => f.key === k)!;
              const isActive = filter === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={`text-left rounded-lg border px-3 py-2 transition snap-start ${isActive ? 'ring-2 ring-[#B91C1C]/30 ' + def.colorClass : 'bg-white border-gray-200 hover:border-[#B91C1C]/40'}`}
                  title={def.desc}
                >
                  <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{def.label}</p>
                  <p className="text-3xl sm:text-2xl font-bold leading-tight mt-0.5">{counts[k]}</p>
                </button>
              );
            })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error banner — surfaces RLS / network errors so the user isn't
          staring at a blank page wondering what broke */}
      {lastError && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs flex-1">
              <p className="font-semibold text-red-800">Couldn't load lab orders</p>
              <p className="text-red-700 mt-0.5 font-mono break-all">{lastError}</p>
              <p className="text-red-600 mt-1">If this says "JWT" or "401/403", log out + back in to refresh your session.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + filter chip */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search patient, provider's office, email, phone…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Badge variant="outline" className="text-xs whitespace-nowrap">
          <Filter className="h-3 w-3 mr-1" />
          {FILTER_DEFINITIONS.find(f => f.key === filter)!.label} · {filteredRows.length}
        </Badge>
      </div>

      {/* Rows */}
      {loading ? (
        // Skeleton rows — page feels alive in 100ms instead of a spinner
        // spinning for 1.5s on flaky LTE. Hormozi: perceived speed > actual speed.
        <div className="space-y-1.5">
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
      ) : filteredRows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <FlaskConical className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-700">No orders in this view.</p>
            <p className="text-xs text-gray-500 mt-1">{FILTER_DEFINITIONS.find(f => f.key === filter)!.desc}</p>
            {rows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => setFilter('all')}
              >
                Show all {rows.length} orders →
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'by_org' ? (
        <GroupedByOrgView
          rows={filteredRows}
          orgMap={orgMap}
          onOpen={openRow}
          onSendLink={handleSendBookingLink}
          onAutoFulfillChange={(orgId, enabled) => {
            // Optimistic UI update — flip the orgMap entry so the toggle
            // moves immediately; server-side persist runs in the toggle component.
            setOrgMap(prev => {
              const next = new Map(prev);
              const cur = next.get(orgId);
              if (cur) next.set(orgId, { ...cur, auto_fulfill_lab_orders: enabled });
              return next;
            });
          }}
        />
      ) : (
        <div className="space-y-1.5">
          {filteredRows.map(row => <LabOrderRow key={row.id} row={row} onOpen={openRow} onSendLink={handleSendBookingLink} />)}
        </div>
      )}

      {/* Detail drawer — opens when a row is clicked */}
      {selectedRow && (
        <LabOrderDetailDrawer
          row={selectedRow}
          orgName={selectedRow.organization_name || null}
          filePreviewUrl={filePreviewUrl}
          onClose={() => { setSelectedRow(null); setFilePreviewUrl(null); }}
          onSendLink={() => handleSendBookingLink(selectedRow)}
        />
      )}

      <SendBookingLinkModal
        open={sendLinkOpen}
        onClose={() => { setSendLinkOpen(false); setSendLinkPatient(null); }}
        patient={sendLinkPatient}
      />
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Row
// ──────────────────────────────────────────────────────────────────
const LabOrderRow: React.FC<{
  row: LabOrderRow;
  onOpen: (r: LabOrderRow) => void;
  onSendLink: (r: LabOrderRow) => void;
}> = ({ row, onOpen, onSendLink }) => {
  const isNew = !row.admin_viewed_at && row.status === 'pending_schedule';
  const isOverdue = row.status === 'pending_schedule' && !!row.draw_by_date && new Date(row.draw_by_date).getTime() < Date.now();
  const isAwaiting = row.status === 'pending_schedule' && !!row.admin_viewed_at && !isOverdue;
  const panels: string[] = Array.isArray(row.lab_order_panels) ? row.lab_order_panels.slice(0, 4) : [];
  const ageDays = differenceInDays(new Date(), new Date(row.created_at));

  // HORMOZI #1 — aging colors. An awaiting-patient row sitting 7 days
  // looks identical to one sent today. Decay visually so drift surfaces
  // BEFORE the provider calls asking what happened.
  const isStale3 = isAwaiting && ageDays >= 3 && ageDays < 5;
  const isStale5 = isAwaiting && ageDays >= 5;

  let statusBadge: React.ReactNode;
  if (row.status === 'completed') statusBadge = <Badge className="bg-gray-100 text-gray-700 text-[10px]">✓ Completed</Badge>;
  else if (row.status === 'scheduled') statusBadge = <Badge className="bg-blue-100 text-blue-700 text-[10px]">📅 Scheduled</Badge>;
  else if (isOverdue) statusBadge = <Badge className="bg-red-100 text-red-700 text-[10px]">⚠ Overdue</Badge>;
  else if (isNew) statusBadge = <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">● New</Badge>;
  else if (isStale5) statusBadge = <Badge className="bg-red-100 text-red-700 text-[10px] animate-pulse">🚨 Stale {ageDays}d</Badge>;
  else if (isStale3) statusBadge = <Badge className="bg-orange-100 text-orange-800 text-[10px]">⏰ Aging {ageDays}d</Badge>;
  else statusBadge = <Badge className="bg-amber-100 text-amber-700 text-[10px]">⏳ Awaiting patient</Badge>;

  // Context-aware primary action — hidden on phones (the row tap opens
  // the drawer which has the same buttons bigger + easier to hit). Mobile
  // users gain ~130px of horizontal real estate for the patient name +
  // org pill which are the trust signals that should never truncate.
  let primaryAction: React.ReactNode;
  if (row.status === 'pending_schedule') {
    primaryAction = (
      <Button size="sm" className="hidden sm:inline-flex bg-[#B91C1C] hover:bg-[#991B1B] text-white h-9 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); onSendLink(row); }}>
        <Zap className="h-3.5 w-3.5" /> Send Booking Link
      </Button>
    );
  } else if (row.status === 'scheduled' && row.appointment_id) {
    primaryAction = (
      <Button size="sm" variant="outline" className="hidden sm:inline-flex h-9 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/super_admin/calendar?appointment=${row.appointment_id}`, '_blank'); }}>
        <Calendar className="h-3.5 w-3.5" /> View Appointment
      </Button>
    );
  } else {
    primaryAction = <span />;
  }

  const borderClass = isOverdue || isStale5
    ? 'border-l-4 border-l-red-500'
    : isStale3
      ? 'border-l-4 border-l-orange-500'
      : isNew
        ? 'border-l-4 border-l-emerald-500'
        : '';

  return (
    <Card
      className={`shadow-sm cursor-pointer hover:shadow-md transition ${borderClass}`}
      onClick={() => onOpen(row)}
    >
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0">
          <FileText className="h-4 w-4 text-[#B91C1C]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm truncate ${isNew ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>{row.patient_name}</p>
            {statusBadge}
            {row.organization_name && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                <Building2 className="h-2.5 w-2.5" />
                {row.organization_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5 flex-wrap">
            <Clock className="h-3 w-3" />
            <span>{formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}</span>
            {row.draw_by_date && (
              <>
                <span>·</span>
                <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                  draw by {format(new Date(row.draw_by_date + 'T12:00:00'), 'MMM d')}
                </span>
              </>
            )}
            {panels.length > 0 && (
              <>
                <span>·</span>
                <span className="truncate">Tests: {panels.join(', ')}{Array.isArray(row.lab_order_panels) && row.lab_order_panels.length > 4 ? ` +${row.lab_order_panels.length - 4} more` : ''}</span>
              </>
            )}
          </div>
        </div>
        {row.lab_order_file_path && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-9 p-0 flex-shrink-0"
            title="Download lab order"
            onClick={(e) => {
              e.stopPropagation();
              const ext = row.lab_order_file_path!.split('.').pop() || 'pdf';
              const safe = (row.patient_name || 'patient').replace(/[^A-Za-z0-9_-]/g, '_');
              downloadLabOrder(row.lab_order_file_path!, `lab-order_${safe}.${ext}`);
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
        {primaryAction}
        <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
      </CardContent>
    </Card>
  );
};

// ──────────────────────────────────────────────────────────────────
// Detail drawer (full-screen modal-ish)
// ──────────────────────────────────────────────────────────────────
const LabOrderDetailDrawer: React.FC<{
  row: LabOrderRow;
  orgName: string | null;
  filePreviewUrl: string | null;
  onClose: () => void;
  onSendLink: () => void;
}> = ({ row, orgName, filePreviewUrl, onClose, onSendLink }) => {
  return (
    // Centered modal on ≥sm, bottom-sheet on phones. The bottom-sheet
    // pattern is what phone users expect for "open detail" — slides up
    // from the thumb zone, swipes/taps backdrop to close, doesn't fight
    // the soft keyboard. Hormozi: "the UX has to feel like the app the
    // user already uses."
    <div className="fixed inset-0 z-50 bg-black/50 flex sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <Card
        className="w-full sm:max-w-4xl mt-auto sm:mt-0 sm:max-h-[92vh] max-h-[90vh] overflow-y-auto shadow-2xl rounded-b-none sm:rounded-lg rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-0">
          {/* Drag handle on mobile — visual cue this is a bottom sheet */}
          <div className="sm:hidden flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-4 sm:p-5 sticky top-0 z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider opacity-90">Lab Order</p>
                <h2 className="text-lg sm:text-xl font-bold mt-0.5 truncate">{row.patient_name}</h2>
                {orgName && (
                  <p className="text-sm opacity-95 mt-1 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">From {orgName}</span>
                  </p>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10 h-9 w-9 p-0 flex-shrink-0" title="Close">
                <span className="text-lg">✕</span>
              </Button>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* Quick actions — horizontal scroll on mobile so chips never wrap
                to 3 ugly rows. Single row, swipe to access. */}
            <div className="flex sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible -mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0">
              {row.status === 'pending_schedule' && (
                <Button onClick={onSendLink} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-9 text-xs flex-shrink-0">
                  <Zap className="h-3.5 w-3.5" /> Send Booking Link
                </Button>
              )}
              {row.patient_phone && (
                <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 flex-shrink-0" asChild>
                  <a href={`tel:${row.patient_phone}`}><Phone className="h-3.5 w-3.5" /> Call</a>
                </Button>
              )}
              {row.patient_email && (
                <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 flex-shrink-0" asChild>
                  <a href={`mailto:${row.patient_email}`}><Mail className="h-3.5 w-3.5" /> Email</a>
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 flex-shrink-0" asChild>
                <a href={`/lab-request/${row.access_token}`} target="_blank" rel="noopener">
                  <ExternalLink className="h-3.5 w-3.5" /> Patient view
                </a>
              </Button>
              {row.appointment_id && (
                <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 flex-shrink-0" asChild>
                  <a href={`/dashboard/super_admin/calendar?appointment=${row.appointment_id}`} target="_blank" rel="noopener">
                    <Calendar className="h-3.5 w-3.5" /> View appointment
                  </a>
                </Button>
              )}
              {row.lab_order_file_path && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-1.5 flex-shrink-0"
                  onClick={() => {
                    const ext = row.lab_order_file_path!.split('.').pop() || 'pdf';
                    const safe = (row.patient_name || 'patient').replace(/[^A-Za-z0-9_-]/g, '_');
                    downloadLabOrder(row.lab_order_file_path!, `lab-order_${safe}.${ext}`);
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Patient block */}
              <div className="space-y-1.5 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Patient</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="text-gray-500">Email:</span><span>{row.patient_email || '—'}</span>
                  <span className="text-gray-500">Phone:</span><span>{row.patient_phone || '—'}</span>
                  <span className="text-gray-500">DOB:</span><span>{row.patient_dob || '—'}</span>
                  <span className="text-gray-500">Patient ID:</span><span className="font-mono text-[10px]">{row.resolved_patient_id || '—'}</span>
                </div>
              </div>

              {/* Order block */}
              <div className="space-y-1.5 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Order</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="text-gray-500">Status:</span><span className="font-medium capitalize">{row.status.replace('_', ' ')}</span>
                  <span className="text-gray-500">Draw by:</span><span>{row.draw_by_date || '—'}</span>
                  <span className="text-gray-500">Fasting:</span><span>{row.fasting_required ? 'Yes' : 'No'}</span>
                  <span className="text-gray-500">Urine:</span><span>{row.urine_required ? 'Yes' : 'No'}</span>
                  <span className="text-gray-500">Received:</span><span>{format(new Date(row.created_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>
            </div>

            {/* OCR'd panels */}
            {Array.isArray(row.lab_order_panels) && row.lab_order_panels.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Detected tests (OCR)</p>
                <div className="flex flex-wrap gap-1.5">
                  {row.lab_order_panels.map((p: string, i: number) => (
                    <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* PDF preview */}
            {row.lab_order_file_path && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2 flex items-center gap-2">
                  Lab order document
                  {filePreviewUrl && (
                    <a href={filePreviewUrl} target="_blank" rel="noopener" className="text-[#B91C1C] hover:underline inline-flex items-center gap-1 normal-case font-normal">
                      <ExternalLink className="h-3 w-3" /> Open in new tab
                    </a>
                  )}
                </p>
                {filePreviewUrl ? (
                  <iframe src={filePreviewUrl} className="w-full h-[55vh] sm:h-[500px] min-h-[300px] border border-gray-200 rounded-md" title="Lab order PDF" />
                ) : (
                  <p className="text-xs text-gray-500">Generating preview…</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// HORMOZI #2 — Per-org rollup view
// Groups rows by organization with status breakdown in the header.
// Each org section has its own auto-fulfill toggle (Hormozi #4).
// ──────────────────────────────────────────────────────────────────
const GroupedByOrgView: React.FC<{
  rows: LabOrderRow[];
  orgMap: Map<string, OrgMeta>;
  onOpen: (r: LabOrderRow) => void;
  onSendLink: (r: LabOrderRow) => void;
  onAutoFulfillChange: (orgId: string, enabled: boolean) => void;
}> = ({ rows, orgMap, onOpen, onSendLink, onAutoFulfillChange }) => {
  // Group rows by org id. Rows with no org get bucketed under "Unattributed".
  const groups = useMemo(() => {
    const m = new Map<string, { orgId: string | null; name: string; rows: LabOrderRow[] }>();
    for (const r of rows) {
      const key = r.organization_id || '__unattributed__';
      const name = r.organization_id
        ? (orgMap.get(r.organization_id)?.name || 'Unknown org')
        : 'Unattributed (no provider linked)';
      if (!m.has(key)) m.set(key, { orgId: r.organization_id, name, rows: [] });
      m.get(key)!.rows.push(r);
    }
    return Array.from(m.values()).sort((a, b) => b.rows.length - a.rows.length);
  }, [rows, orgMap]);

  return (
    <div className="space-y-4">
      {groups.map(g => {
        const newCnt = g.rows.filter(r => !r.admin_viewed_at && r.status === 'pending_schedule').length;
        const awaiting = g.rows.filter(r => r.status === 'pending_schedule' && !!r.admin_viewed_at).length;
        const scheduled = g.rows.filter(r => r.status === 'scheduled').length;
        const completed = g.rows.filter(r => r.status === 'completed').length;
        const meta = g.orgId ? orgMap.get(g.orgId) : null;
        return (
          <Card key={g.orgId || g.name} className="shadow-sm overflow-hidden">
            {/* Org header — stacks on mobile (3 rows: title, badges, toggle).
                On desktop everything sits on one row. */}
            <div className="bg-gradient-to-r from-purple-50 to-white border-b border-purple-100 px-3 sm:px-4 py-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 text-purple-700 flex-shrink-0" />
                <h3 className="font-bold text-sm text-gray-900 truncate">{g.name}</h3>
                <span className="text-xs text-gray-500 flex-shrink-0">· {g.rows.length} order{g.rows.length === 1 ? '' : 's'}</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap pb-1 sm:pb-0">
                {newCnt > 0 && <Badge className="bg-emerald-100 text-emerald-700 text-[10px] flex-shrink-0">{newCnt} new</Badge>}
                {awaiting > 0 && <Badge className="bg-amber-100 text-amber-700 text-[10px] flex-shrink-0">{awaiting} awaiting</Badge>}
                {scheduled > 0 && <Badge className="bg-blue-100 text-blue-700 text-[10px] flex-shrink-0">{scheduled} scheduled</Badge>}
                {completed > 0 && <Badge className="bg-gray-100 text-gray-600 text-[10px] flex-shrink-0">{completed} done</Badge>}
                {g.orgId && (
                  <div className="flex-shrink-0 ml-auto sm:ml-0">
                    <AutoFulfillToggle
                      orgId={g.orgId}
                      enabled={meta?.auto_fulfill_lab_orders ?? false}
                      onChange={(en) => onAutoFulfillChange(g.orgId!, en)}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="p-2 sm:p-3 space-y-1.5 bg-white">
              {g.rows.map(row => (
                <LabOrderRow key={row.id} row={row} onOpen={onOpen} onSendLink={onSendLink} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// HORMOZI #4 — Auto-fulfill toggle per provider
// Persists organizations.auto_fulfill_lab_orders. When ON, new lab
// orders from this org auto-fire the HIPAA-safe booking SMS + email
// to the patient on receipt (logic lives in create-lab-request edge fn).
// ──────────────────────────────────────────────────────────────────
const AutoFulfillToggle: React.FC<{
  orgId: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ orgId, enabled, onChange }) => {
  const [saving, setSaving] = useState(false);
  const handleToggle = async () => {
    if (saving) return;
    const next = !enabled;
    setSaving(true);
    // Optimistic update
    onChange(next);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ auto_fulfill_lab_orders: next })
        .eq('id', orgId);
      if (error) throw error;
      toast.success(next
        ? 'Auto-fulfill ON — new orders will auto-send booking link'
        : 'Auto-fulfill OFF — manual review required'
      );
    } catch (e: any) {
      onChange(!next); // revert
      toast.error(`Couldn't update: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); handleToggle(); }}
      disabled={saving}
      className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[10px] font-semibold border transition ${
        enabled
          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
          : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
      } ${saving ? 'opacity-60' : ''}`}
      title={enabled
        ? 'Auto-fulfill is ON. New orders from this office will auto-send the booking link.'
        : 'Auto-fulfill is OFF. New orders require admin to click Send Booking Link.'}
    >
      <span className={`w-2 h-2 rounded-full ${enabled ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
      {enabled ? '⚡ Auto-fulfill ON' : 'Auto-fulfill OFF'}
    </button>
  );
};

export default LabOrdersTab;
