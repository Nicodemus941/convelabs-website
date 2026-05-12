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
  patient_id?: string | null;
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

const LabOrdersTab: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<LabOrderRow[]>([]);
  const [orgMap, setOrgMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  // Default to 'all' so an admin landing here for the first time sees
  // every order in the system — not just the small "new" subset. Hormozi:
  // never let the customer stare at an empty screen and conclude "this
  // doesn't work." The filter pills above make narrowing one click away.
  const [filter, setFilter] = useState<FilterKey>('all');
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
        .select('id, organization_id, patient_id, patient_name, patient_email, patient_phone, patient_dob, lab_order_file_path, lab_order_panels, fasting_required, urine_required, draw_by_date, status, appointment_id, access_token, patient_viewed_at, patient_scheduled_at, admin_viewed_at, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (queryErr) {
        console.error('[LabOrdersTab] query error:', queryErr);
        setLastError(queryErr.message || String(queryErr));
      }
      const list = ((lr as any[]) || []) as LabOrderRow[];
      console.log(`[LabOrdersTab] fetched ${list.length} lab orders`);

      const orgIds = Array.from(new Set(list.map(r => r.organization_id).filter(Boolean) as string[]));
      const oMap = new Map<string, string>();
      if (orgIds.length > 0) {
        const { data: orgs } = await supabase
          .from('organizations').select('id, name').in('id', orgIds);
        ((orgs as any[]) || []).forEach(o => oMap.set(o.id, o.name));
      }
      setOrgMap(oMap);
      setRows(list.map(r => ({ ...r, organization_name: r.organization_id ? oMap.get(r.organization_id) || null : null })));
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
      id: row.patient_id || null,
      firstName: first || row.patient_name || 'patient',
      lastName: rest.join(' '),
      email: row.patient_email,
      phone: row.patient_phone,
    });
    setSendLinkOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* HERO — Hormozi: dream outcome stated up top, with the metric that matters */}
      <Card className="border-2 border-[#B91C1C]/20 bg-gradient-to-br from-red-50/40 to-white shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-[#B91C1C]" />
                Lab Orders
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Every order a provider's office has placed for a patient — newest first, real-time.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5 text-xs h-8" disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              {counts.new > 0 && (
                <Button size="sm" onClick={markAllAsViewed} className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Eye className="h-3.5 w-3.5" /> Mark all reviewed
                </Button>
              )}
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
            {(['new', 'awaiting_patient', 'scheduled', 'overdue', 'completed'] as FilterKey[]).map(k => {
              const def = FILTER_DEFINITIONS.find(f => f.key === k)!;
              const isActive = filter === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={`text-left rounded-lg border px-3 py-2 transition ${isActive ? 'ring-2 ring-[#B91C1C]/30 ' + def.colorClass : 'bg-white border-gray-200 hover:border-[#B91C1C]/40'}`}
                  title={def.desc}
                >
                  <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{def.label}</p>
                  <p className="text-2xl font-bold leading-tight mt-0.5">{counts[k]}</p>
                </button>
              );
            })}
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
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#B91C1C]" /></div>
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
  const panels: string[] = Array.isArray(row.lab_order_panels) ? row.lab_order_panels.slice(0, 4) : [];
  const ageDays = differenceInDays(new Date(), new Date(row.created_at));

  let statusBadge: React.ReactNode;
  if (row.status === 'completed') statusBadge = <Badge className="bg-gray-100 text-gray-700 text-[10px]">✓ Completed</Badge>;
  else if (row.status === 'scheduled') statusBadge = <Badge className="bg-blue-100 text-blue-700 text-[10px]">📅 Scheduled</Badge>;
  else if (isOverdue) statusBadge = <Badge className="bg-red-100 text-red-700 text-[10px]">⚠ Overdue</Badge>;
  else if (isNew) statusBadge = <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">● New</Badge>;
  else statusBadge = <Badge className="bg-amber-100 text-amber-700 text-[10px]">⏳ Awaiting patient</Badge>;

  // Context-aware primary action
  let primaryAction: React.ReactNode;
  if (row.status === 'pending_schedule') {
    primaryAction = (
      <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); onSendLink(row); }}>
        <Zap className="h-3 w-3" /> Send Booking Link
      </Button>
    );
  } else if (row.status === 'scheduled' && row.appointment_id) {
    primaryAction = (
      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/super_admin/calendar?appointment=${row.appointment_id}`, '_blank'); }}>
        <Calendar className="h-3 w-3" /> View Appointment
      </Button>
    );
  } else {
    primaryAction = <span />;
  }

  return (
    <Card
      className={`shadow-sm cursor-pointer hover:shadow-md transition ${isNew ? 'border-l-4 border-l-emerald-500' : ''} ${isOverdue ? 'border-l-4 border-l-red-500' : ''}`}
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
            className="h-7 px-2 text-xs"
            title="Download lab order"
            onClick={(e) => {
              e.stopPropagation();
              const ext = row.lab_order_file_path!.split('.').pop() || 'pdf';
              const safe = (row.patient_name || 'patient').replace(/[^A-Za-z0-9_-]/g, '_');
              downloadLabOrder(row.lab_order_file_path!, `lab-order_${safe}.${ext}`);
            }}
          >
            <Download className="h-3 w-3" />
          </Button>
        )}
        {primaryAction}
        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-0">
          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider opacity-90">Lab Order</p>
                <h2 className="text-xl font-bold mt-0.5">{row.patient_name}</h2>
                {orgName && (
                  <p className="text-sm opacity-95 mt-1 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> From {orgName}
                  </p>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10">Close</Button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Quick actions */}
            <div className="flex flex-wrap gap-2">
              {row.status === 'pending_schedule' && (
                <Button onClick={onSendLink} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-9 text-xs">
                  <Zap className="h-3.5 w-3.5" /> Send Booking Link
                </Button>
              )}
              {row.patient_phone && (
                <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" asChild>
                  <a href={`tel:${row.patient_phone}`}><Phone className="h-3.5 w-3.5" /> Call</a>
                </Button>
              )}
              {row.patient_email && (
                <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" asChild>
                  <a href={`mailto:${row.patient_email}`}><Mail className="h-3.5 w-3.5" /> Email</a>
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" asChild>
                <a href={`/lab-request/${row.access_token}`} target="_blank" rel="noopener">
                  <ExternalLink className="h-3.5 w-3.5" /> Patient view
                </a>
              </Button>
              {row.appointment_id && (
                <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" asChild>
                  <a href={`/dashboard/super_admin/calendar?appointment=${row.appointment_id}`} target="_blank" rel="noopener">
                    <Calendar className="h-3.5 w-3.5" /> View appointment
                  </a>
                </Button>
              )}
              {row.lab_order_file_path && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-1.5"
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
                  <span className="text-gray-500">Patient ID:</span><span className="font-mono text-[10px]">{row.patient_id || '—'}</span>
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
                  <iframe src={filePreviewUrl} className="w-full h-[500px] border border-gray-200 rounded-md" title="Lab order PDF" />
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

export default LabOrdersTab;
