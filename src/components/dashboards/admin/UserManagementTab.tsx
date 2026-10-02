/**
 * UserManagementTab — every patient on file (tenant_patients), in the shared
 * admin list language (see adminListKit + LabOrdersTab for the reference).
 *
 * Rendered via Dashboard.tsx SECTION_SCREENS["team/users"] (nav label
 * "Portal users", super_admin only via adminNav roles).
 *
 * Every patient maps to exactly ONE bucket (deriveBucket) so the stat tiles,
 * the filter chips and the list always agree:
 *
 *   no_contact   → no phone AND no email — we cannot reach them (needs action)
 *   member       → active membership (membership_status active/member/vip)
 *   partner      → referred by / linked to a partner organization
 *   booked       → at least one non-cancelled appointment
 *   never_booked → on file, never booked
 *
 * Soft-deleted patients (deleted_at IS NOT NULL) are excluded — deleted_at is
 * the canonical soft-delete flag (see PatientProfileTab), not is_active.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Users, Download, Phone, Mail, Zap, MoreHorizontal, Copy, KeyRound, MessageSquare,
  Building2, Crown, ChevronRight, AlertTriangle, CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import SendBookingLinkModal from '@/components/admin/SendBookingLinkModal';
import PatientCommsTimeline from '@/components/admin/PatientCommsTimeline';
import {
  ago, copyText, rowKeyHandler, plural, TH, TH_STICKY, TD_STICKY, ROW_FOCUS, CARD_FOCUS,
  PageHeader, RefreshButton, StatTiles, FilterChips, SearchBox, LaneHeader, LoadingRows,
  EmptyState, ErrorCard, ListFooter, Pill, Field, SectionLabel, DetailDrawer, QuickActions, Notice,
  type TileDef, type ChipDef,
} from './adminListKit';

const db = supabase as any;

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────
export interface PatientRecord {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  insurance_provider: string | null;
  insurance_member_id: string | null;
  created_at: string;
  is_active: boolean;
  membership_status: string | null;
  membership_tier: string | null;
  organization_id: string | null;
  organization_name?: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  referred_by: string | null;
  utm_source: string | null;
  pays_cash: boolean | null;
  user_id: string | null;
  appointment_count: number;
  last_appointment_at: string | null;
}

const PATIENT_COLUMNS = [
  'id', 'first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'insurance_provider', 'insurance_member_id',
  'created_at', 'is_active', 'membership_status', 'membership_tier', 'organization_id', 'city', 'state', 'zipcode',
  'referred_by', 'utm_source', 'pays_cash', 'user_id', 'deleted_at',
].join(', ');

const ACTIVE_MEMBERSHIP = new Set(['active', 'member', 'vip']);

export const fullName = (p: PatientRecord) => `${p.first_name} ${p.last_name}`.trim() || 'Unnamed patient';
export const isMember = (p: PatientRecord) => ACTIVE_MEMBERSHIP.has((p.membership_status || '').toLowerCase());

// ──────────────────────────────────────────────────────────────────
// Buckets — ONE per row.
// ──────────────────────────────────────────────────────────────────
export type Bucket = 'no_contact' | 'member' | 'partner' | 'booked' | 'never_booked';

export function deriveBucket(p: PatientRecord): Bucket {
  if (!p.phone && !p.email) return 'no_contact';
  if (isMember(p)) return 'member';
  if (p.organization_id) return 'partner';
  if (p.appointment_count > 0) return 'booked';
  return 'never_booked';
}

const NEEDS_ACTION: ReadonlySet<Bucket> = new Set<Bucket>(['no_contact']);

interface BucketMeta { label: string; desc: string; pill: string; tile: string; dot: string }

const BUCKET_META: Record<Bucket, BucketMeta> = {
  no_contact: {
    label: 'No contact', desc: 'No phone and no email on file — we cannot reach them',
    pill: 'bg-red-100 text-red-800 border-red-200', tile: 'border-red-300 bg-red-50 text-red-800', dot: 'bg-red-500',
  },
  member: {
    label: 'Member', desc: 'Active ConveLabs membership',
    pill: 'bg-purple-100 text-purple-800 border-purple-200', tile: 'border-purple-300 bg-purple-50 text-purple-800', dot: 'bg-purple-500',
  },
  partner: {
    label: 'Partner-referred', desc: "Linked to a partner organization's roster",
    pill: 'bg-blue-100 text-blue-800 border-blue-200', tile: 'border-blue-300 bg-blue-50 text-blue-800', dot: 'bg-blue-500',
  },
  booked: {
    label: 'Booked', desc: 'Has at least one appointment on file',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', tile: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500',
  },
  never_booked: {
    label: 'Never booked', desc: 'On file but has not booked yet',
    pill: 'bg-gray-100 text-gray-700 border-gray-200', tile: 'border-gray-300 bg-gray-100 text-gray-800', dot: 'bg-gray-400',
  },
};

type FilterKey = 'all' | 'needs_action' | Bucket;

const FILTERS: Array<ChipDef<FilterKey> & { match: (b: Bucket) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Every patient on file', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'Patients we cannot reach', match: b => NEEDS_ACTION.has(b) },
  ...(Object.keys(BUCKET_META) as Bucket[]).map(b => ({
    key: b, label: BUCKET_META[b].label, desc: BUCKET_META[b].desc, dot: BUCKET_META[b].dot, match: (x: Bucket) => x === b,
  })),
];

/** Five tiles that partition every row. */
const TILES: TileDef<FilterKey>[] = [
  { key: 'needs_action', label: 'Needs action', desc: FILTERS[1].desc, style: 'border-red-300 bg-red-50 text-red-800', alert: true },
  { key: 'member', label: 'Members', desc: BUCKET_META.member.desc, style: BUCKET_META.member.tile },
  { key: 'partner', label: 'Partner-referred', desc: BUCKET_META.partner.desc, style: BUCKET_META.partner.tile },
  { key: 'booked', label: 'Booked', desc: BUCKET_META.booked.desc, style: BUCKET_META.booked.tile },
  { key: 'never_booked', label: 'Never booked', desc: BUCKET_META.never_booked.desc, style: BUCKET_META.never_booked.tile },
];

const PAGE = 100;

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────
const UserManagementTab: React.FC = () => {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<PatientRecord | null>(null);
  const [sendLinkOpen, setSendLinkOpen] = useState(false);
  const [sendLinkFor, setSendLinkFor] = useState<PatientRecord | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const { data, error } = await db
        .from('tenant_patients')
        .select(PATIENT_COLUMNS)
        .is('deleted_at', null)
        .order('first_name', { ascending: true });
      if (error) throw error;
      const list = (data as any[]) || [];

      // Appointment counts per patient. PostgREST caps a single select at
      // 1,000 rows, so page through — otherwise counts silently truncate once
      // the appointments table grows past that.
      const countMap = new Map<string, number>();
      const lastMap = new Map<string, string>();
      for (let from = 0; ; from += 1000) {
        const { data: page, error: e2 } = await db
          .from('appointments')
          .select('patient_id, appointment_date')
          .neq('status', 'cancelled')
          .not('patient_id', 'is', null)
          .range(from, from + 999);
        if (e2) throw e2;
        const rows = (page as any[]) || [];
        for (const a of rows) {
          countMap.set(a.patient_id, (countMap.get(a.patient_id) || 0) + 1);
          if (a.appointment_date && (!lastMap.has(a.patient_id) || a.appointment_date > lastMap.get(a.patient_id)!)) lastMap.set(a.patient_id, a.appointment_date);
        }
        if (rows.length < 1000) break;
      }

      const orgIds = Array.from(new Set(list.map(p => p.organization_id).filter(Boolean) as string[]));
      const orgNames = new Map<string, string>();
      if (orgIds.length > 0) {
        const { data: orgs } = await db.from('organizations').select('id, name').in('id', orgIds);
        ((orgs as any[]) || []).forEach(o => orgNames.set(o.id, o.name));
      }

      setPatients(list.map((p: any) => ({
        id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        email: p.email || null,
        phone: p.phone || null,
        date_of_birth: p.date_of_birth,
        insurance_provider: p.insurance_provider,
        insurance_member_id: p.insurance_member_id,
        created_at: p.created_at,
        is_active: p.is_active !== false,
        membership_status: p.membership_status,
        membership_tier: p.membership_tier,
        organization_id: p.organization_id,
        organization_name: p.organization_id ? orgNames.get(p.organization_id) || null : null,
        city: p.city, state: p.state, zipcode: p.zipcode,
        referred_by: p.referred_by, utm_source: p.utm_source,
        pays_cash: p.pays_cash, user_id: p.user_id,
        appointment_count: countMap.get(p.id) || 0,
        last_appointment_at: lastMap.get(p.id) || null,
      })));
    } catch (err: any) {
      console.error('[UserManagementTab] load failed:', err);
      setLastError(err?.message || String(err));
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setLimit(PAGE); }, [filter, search]);

  // Keep the open drawer in sync after a refresh.
  useEffect(() => {
    if (!selected) return;
    const fresh = patients.find(p => p.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [patients]); // eslint-disable-line react-hooks/exhaustive-deps

  const bucketOf = useMemo(() => {
    const m = new Map<string, Bucket>();
    for (const p of patients) m.set(p.id, deriveBucket(p));
    return m;
  }, [patients]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map(f => [f.key, 0])) as Record<FilterKey, number>;
    for (const p of patients) {
      const b = bucketOf.get(p.id)!;
      for (const f of FILTERS) if (f.match(b)) c[f.key]++;
    }
    return c;
  }, [patients, bucketOf]);

  const filtered = useMemo(() => {
    const def = FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return patients.filter(p => def.match(bucketOf.get(p.id)!) && (q === '' ||
      fullName(p).toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (digits.length >= 3 && (p.phone || '').replace(/\D/g, '').includes(digits)) ||
      (p.organization_name || '').toLowerCase().includes(q) ||
      (p.insurance_provider || '').toLowerCase().includes(q) ||
      (p.date_of_birth || '').includes(q)
    ));
  }, [patients, filter, search, bucketOf]);

  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(p => NEEDS_ACTION.has(bucketOf.get(p.id)!));
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(p => !NEEDS_ACTION.has(bucketOf.get(p.id)!)) };
  }, [filtered, filter, bucketOf]);

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const visibleLanes = useMemo(() => {
    if (!lanes) return null;
    const restBudget = Math.max(0, limit - lanes.action.length);
    return { action: lanes.action, rest: lanes.rest.slice(0, restBudget) };
  }, [lanes, limit]);

  const sendPasswordReset = useCallback(async (p: PatientRecord) => {
    if (!p.email) { toast.error('No email on file'); return; }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(p.email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
      toast.success(`Password reset sent to ${p.email}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send reset');
    }
  }, []);

  const openSendLink = useCallback((p: PatientRecord) => { setSendLinkFor(p); setSendLinkOpen(true); }, []);

  const exportCSV = () => {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'DOB', 'Insurance', 'Membership', 'Organization', 'Appointments', 'Active'];
    const rows = filtered.map(p => [
      p.first_name, p.last_name, p.email || '', p.phone || '', p.date_of_birth || '', p.insurance_provider || '',
      p.membership_status || '', p.organization_name || '', p.appointment_count, p.is_active ? 'Yes' : 'No',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `convelabs-patients-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${plural(filtered.length, 'patient')} exported`);
  };

  const handlers: RowHandlers = { onOpen: setSelected, onSendLink: openSendLink, onResetPassword: sendPasswordReset };
  const activeFilter = FILTERS.find(f => f.key === filter)!;
  const hiddenByLimit = filtered.length - Math.min(filtered.length, limit);

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      <PageHeader
        icon={Users}
        title="Patients"
        subtitle={<>Every patient on file — members, partner rosters and walk-ins.{counts.no_contact > 0 && <span className="ml-1 font-medium text-red-700">{counts.no_contact} unreachable.</span>}</>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 text-xs h-10 sm:h-9" disabled={loading || filtered.length === 0} aria-label="Export CSV">
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Export {filter === 'all' && !search ? 'all' : `${filtered.length}`}</span>
            </Button>
            <RefreshButton onClick={refresh} loading={loading} />
          </>
        }
      />

      <StatTiles tiles={TILES} counts={counts} active={filter} onSelect={k => setFilter(k)} loading={loading} ariaLabel="Patient counts" />

      {lastError && <ErrorCard what="patients" message={lastError} onRetry={refresh} />}

      <div className="space-y-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search name, email, phone, organization, insurance, DOB…" ariaLabel="Search patients" />
        <FilterChips filters={FILTERS} counts={counts} active={filter} onSelect={k => setFilter(k)} ariaLabel="Patient filter" />
      </div>

      {loading && patients.length === 0 ? (
        <LoadingRows label="Loading patients" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          emptyTitle="No patients yet."
          emptyHint="Patients appear here the moment they book or a provider sends them a link."
          filterLabel={activeFilter.label}
          filterDesc={activeFilter.desc}
          hasSearch={search.trim() !== ''}
          searchHint="Try a name, email, phone, organization or insurance."
          total={patients.length}
          noun="patients"
          onReset={() => { setFilter('all'); setSearch(''); }}
        />
      ) : visibleLanes ? (
        <div className="space-y-5">
          <section aria-labelledby="lane-action">
            <LaneHeader id="lane-action" title="Needs action" count={lanes!.action.length} tone="red" />
            <PatientRows rows={visibleLanes.action} bucketOf={bucketOf} handlers={handlers} />
          </section>
          {visibleLanes.rest.length > 0 && (
            <section aria-labelledby="lane-rest">
              <LaneHeader id="lane-rest" title="Everything else" count={lanes!.rest.length} tone="gray" />
              <PatientRows rows={visibleLanes.rest} bucketOf={bucketOf} handlers={handlers} />
            </section>
          )}
        </div>
      ) : (
        <PatientRows rows={visible} bucketOf={bucketOf} handlers={handlers} />
      )}

      {hiddenByLimit > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setLimit(l => l + PAGE)}>
            Show {Math.min(PAGE, hiddenByLimit)} more · {hiddenByLimit} hidden
          </Button>
        </div>
      )}

      <ListFooter shown={Math.min(filtered.length, limit)} total={patients.length} noun="patient" extra={filtered.length !== patients.length ? `${filtered.length} match` : undefined} />

      {selected && (
        <PatientDetailDrawer
          patient={selected}
          bucket={bucketOf.get(selected.id) || deriveBucket(selected)}
          onClose={() => setSelected(null)}
          onSendLink={() => openSendLink(selected)}
          onResetPassword={() => sendPasswordReset(selected)}
        />
      )}

      <SendBookingLinkModal
        open={sendLinkOpen}
        onClose={() => { setSendLinkOpen(false); setSendLinkFor(null); }}
        patient={sendLinkFor ? {
          id: sendLinkFor.id,
          firstName: sendLinkFor.first_name || '',
          lastName: sendLinkFor.last_name || '',
          email: sendLinkFor.email,
          phone: sendLinkFor.phone,
        } : null}
      />
    </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Rows
// ──────────────────────────────────────────────────────────────────
interface RowHandlers {
  onOpen: (p: PatientRecord) => void;
  onSendLink: (p: PatientRecord) => void;
  onResetPassword: (p: PatientRecord) => void;
}

const StatusPill: React.FC<{ p: PatientRecord; bucket: Bucket; className?: string }> = ({ p, bucket, className }) => {
  const meta = BUCKET_META[bucket];
  let text: React.ReactNode = meta.label;
  if (bucket === 'member' && p.membership_tier) text = `Member · ${p.membership_tier}`;
  return <Pill className={cn(meta.pill, className)} dot={meta.dot} title={meta.desc}>{text}</Pill>;
};

const SourceCell: React.FC<{ p: PatientRecord }> = ({ p }) => {
  if (p.organization_name) {
    return (
      <span className="inline-flex items-center gap-1 min-w-0 text-xs text-gray-700">
        <Building2 className="h-3 w-3 text-purple-600 flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{p.organization_name}</span>
      </span>
    );
  }
  if (isMember(p)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-purple-700">
        <Crown className="h-3 w-3 flex-shrink-0" aria-hidden="true" /> {p.membership_tier || 'Member'}
      </span>
    );
  }
  if (p.referred_by) return <span className="text-xs text-gray-600 truncate block">Ref: {p.referred_by}</span>;
  if (p.utm_source) return <span className="text-xs text-gray-500 truncate block">via {p.utm_source}</span>;
  return <span className="text-gray-400 text-xs">—</span>;
};

const PrimaryAction: React.FC<{ p: PatientRecord; h: RowHandlers; className?: string }> = ({ p, h, className }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (!p.phone && !p.email) {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5 border-red-300 text-red-800 hover:bg-red-50', className)} onClick={(e) => { stop(e); h.onOpen(p); }}>
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> No contact
      </Button>
    );
  }
  return (
    <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onSendLink(p); }}>
      <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Send booking link
    </Button>
  );
};

const RowMenu: React.FC<{ p: PatientRecord; h: RowHandlers; className?: string }> = ({ p, h, className }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${fullName(p)}`} onClick={(e) => e.stopPropagation()}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => h.onOpen(p)}>
        <Users className="h-4 w-4 mr-2" aria-hidden="true" /> Open patient
      </DropdownMenuItem>
      {(p.phone || p.email) && (
        <DropdownMenuItem onSelect={() => h.onSendLink(p)}>
          <Zap className="h-4 w-4 mr-2" aria-hidden="true" /> Send booking link
        </DropdownMenuItem>
      )}
      {p.email && (
        <DropdownMenuItem onSelect={() => h.onResetPassword(p)}>
          <KeyRound className="h-4 w-4 mr-2" aria-hidden="true" /> Send password reset
        </DropdownMenuItem>
      )}
      {(p.phone || p.email) && <DropdownMenuSeparator />}
      {p.phone && (
        <DropdownMenuItem asChild>
          <a href={`sms:${p.phone}`}><MessageSquare className="h-4 w-4 mr-2" aria-hidden="true" /> Text {p.phone}</a>
        </DropdownMenuItem>
      )}
      {p.phone && (
        <DropdownMenuItem asChild>
          <a href={`tel:${p.phone}`}><Phone className="h-4 w-4 mr-2" aria-hidden="true" /> Call {p.phone}</a>
        </DropdownMenuItem>
      )}
      {p.email && (
        <DropdownMenuItem asChild>
          <a href={`mailto:${p.email}`}><Mail className="h-4 w-4 mr-2" aria-hidden="true" /> Email patient</a>
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      {p.email && <DropdownMenuItem onSelect={() => copyText(p.email!, 'Email')}><Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy email</DropdownMenuItem>}
      {p.phone && <DropdownMenuItem onSelect={() => copyText(p.phone!, 'Phone')}><Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy phone</DropdownMenuItem>}
      <DropdownMenuItem onSelect={() => copyText(p.id, 'Patient ID')}><Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy patient ID</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const PatientRows: React.FC<{ rows: PatientRecord[]; bucketOf: Map<string, Bucket>; handlers: RowHandlers }> = ({ rows, bucketOf, handlers }) => {
  const bucket = (p: PatientRecord) => bucketOf.get(p.id) || deriveBucket(p);
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className={cn(TH, 'pl-4')}>Patient</TableHead>
              <TableHead className={TH}>Contact</TableHead>
              <TableHead className={TH}>Source</TableHead>
              <TableHead className={TH}>Insurance</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={cn(TH, 'text-right whitespace-nowrap')}>Appts</TableHead>
              <TableHead className={cn('hidden xl:table-cell', TH, 'whitespace-nowrap')}>Last visit</TableHead>
              <TableHead className={TH_STICKY}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(p => {
              const b = bucket(p);
              const open = () => handlers.onOpen(p);
              return (
                <TableRow
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={rowKeyHandler(open)}
                  aria-label={`${fullName(p)}, ${BUCKET_META[b].label}. Open patient`}
                  className={cn(ROW_FOCUS, 'bg-white', b === 'no_contact' && 'border-l-4 border-l-red-500')}
                >
                  <TableCell className="py-2.5 pl-4 align-top">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-[#B91C1C]" aria-hidden="true">
                        {(p.first_name[0] || '?').toUpperCase()}{(p.last_name[0] || '').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-gray-800 truncate block">{fullName(p)}</span>
                        <p className="text-[11px] text-gray-500 truncate">
                          {p.date_of_birth ? `DOB ${p.date_of_birth}` : 'No DOB'}{p.city ? ` · ${p.city}` : ''}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 max-w-[220px]">
                    <span className="block truncate">{p.email || <span className="text-gray-400">No email</span>}</span>
                    <span className="block text-[11px] text-gray-500">{p.phone || <span className="text-gray-400">No phone</span>}</span>
                  </TableCell>
                  <TableCell className="py-2.5 align-top max-w-[180px]"><SourceCell p={p} /></TableCell>
                  <TableCell className="py-2.5 align-top text-xs">
                    {p.insurance_provider
                      ? <span className="inline-flex px-2 h-6 items-center rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold max-w-[160px] truncate">{p.insurance_provider}</span>
                      : <span className="text-gray-400">{p.pays_cash ? 'Cash' : 'Self-pay'}</span>}
                  </TableCell>
                  <TableCell className="py-2.5 align-top"><StatusPill p={p} bucket={b} /></TableCell>
                  <TableCell className="py-2.5 align-top text-sm font-medium text-right tabular-nums">{p.appointment_count}</TableCell>
                  <TableCell className="hidden xl:table-cell py-2.5 align-top text-xs text-gray-600 whitespace-nowrap">
                    {p.last_appointment_at ? (
                      <>
                        <span className="block">{format(new Date(p.last_appointment_at), 'MMM d, yyyy')}</span>
                        <span className="block text-[11px] text-gray-400">{ago(p.last_appointment_at)}</span>
                      </>
                    ) : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className={TD_STICKY}>
                    <div className="flex items-center justify-end gap-1">
                      <PrimaryAction p={p} h={handlers} className="h-9" />
                      {p.phone && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label={`Text ${fullName(p)}`} asChild onClick={(e) => e.stopPropagation()}>
                              <a href={`sms:${p.phone}`}><MessageSquare className="h-4 w-4" aria-hidden="true" /></a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Text patient</TooltipContent>
                        </Tooltip>
                      )}
                      <RowMenu p={p} h={handlers} />
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
        {rows.map(p => {
          const b = bucket(p);
          const open = () => handlers.onOpen(p);
          return (
            <Card
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={rowKeyHandler(open)}
              aria-label={`${fullName(p)}, ${BUCKET_META[b].label}. Open patient`}
              className={cn(CARD_FOCUS, b === 'no_contact' && 'border-l-4 border-l-red-500')}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-gray-800 block truncate">{fullName(p)}</span>
                    <p className="text-[11px] text-gray-500 truncate">{p.phone || p.email || 'No contact on file'}</p>
                  </div>
                  <StatusPill p={p} bucket={b} />
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>{plural(p.appointment_count, 'appt')}</span>
                  {p.last_appointment_at && <><span className="text-gray-300">·</span><span className="text-gray-500">last {ago(p.last_appointment_at)}</span></>}
                  {p.organization_name && <><span className="text-gray-300">·</span><span className="text-purple-700 truncate">{p.organization_name}</span></>}
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <PrimaryAction p={p} h={handlers} className="h-11 flex-1 justify-center" />
                  <RowMenu p={p} h={handlers} className="h-11 w-11 flex-shrink-0 border border-gray-200" />
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

// ──────────────────────────────────────────────────────────────────
// Detail drawer
// ──────────────────────────────────────────────────────────────────
const PatientDetailDrawer: React.FC<{
  patient: PatientRecord;
  bucket: Bucket;
  onClose: () => void;
  onSendLink: () => void;
  onResetPassword: () => void;
}> = ({ patient: p, bucket, onClose, onSendLink, onResetPassword }) => (
  <DetailDrawer
    titleId={`patient-title-${p.id}`}
    eyebrow="Patient"
    title={fullName(p)}
    meta={
      <>
        <StatusPill p={p} bucket={bucket} className="bg-white/95" />
        {p.organization_name && (
          <span className="text-sm opacity-95 flex items-center gap-1.5 min-w-0">
            <Building2 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /> <span className="truncate">{p.organization_name}</span>
          </span>
        )}
      </>
    }
    onClose={onClose}
  >
    {bucket === 'no_contact' && (
      <Notice tone="red" icon={AlertTriangle}>
        <p>No phone or email on file — booking links and reminders can't reach this patient. Add contact details from their full profile.</p>
      </Notice>
    )}

    <QuickActions>
      {(p.phone || p.email) && (
        <Button onClick={onSendLink} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-10 text-xs flex-shrink-0">
          <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Send booking link
        </Button>
      )}
      {p.phone && (
        <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
          <a href={`sms:${p.phone}`}><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Text</a>
        </Button>
      )}
      {p.phone && (
        <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
          <a href={`tel:${p.phone}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call</a>
        </Button>
      )}
      {p.email && (
        <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
          <a href={`mailto:${p.email}`}><Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email</a>
        </Button>
      )}
      {p.email && (
        <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={onResetPassword}>
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Password reset
        </Button>
      )}
    </QuickActions>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="space-y-1.5 text-sm">
        <SectionLabel>Contact</SectionLabel>
        <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
          <Field label="Email">{p.email || '—'}</Field>
          <Field label="Phone">{p.phone || '—'}</Field>
          <Field label="DOB">{p.date_of_birth || '—'}</Field>
          <Field label="Address">{[p.city, p.state, p.zipcode].filter(Boolean).join(', ') || '—'}</Field>
          <Field label="Login">{p.user_id ? 'Has portal account' : 'No portal account'}</Field>
        </div>
      </div>
      <div className="space-y-1.5 text-sm">
        <SectionLabel>Coverage</SectionLabel>
        <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
          <Field label="Insurance">{p.insurance_provider || (p.pays_cash ? 'Cash' : 'Self-pay')}</Field>
          <Field label="Member ID">{p.insurance_member_id || '—'}</Field>
          <Field label="Membership">{isMember(p) ? <span className="font-medium text-purple-700">{p.membership_tier || p.membership_status}</span> : (p.membership_status && p.membership_status !== 'none' ? p.membership_status : '—')}</Field>
          <Field label="Organization">{p.organization_name || '—'}</Field>
          <Field label="Referred by">{p.referred_by || p.utm_source || '—'}</Field>
        </div>
      </div>
      <div className="space-y-1.5 text-sm">
        <SectionLabel>Activity</SectionLabel>
        <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
          <Field label="Appointments"><span className="font-medium">{p.appointment_count}</span></Field>
          <Field label="Last visit">{p.last_appointment_at ? `${format(new Date(p.last_appointment_at), 'MMM d, yyyy')} · ${ago(p.last_appointment_at)}` : '—'}</Field>
          <Field label="Added">{format(new Date(p.created_at), 'MMM d, yyyy')} · {ago(p.created_at)}</Field>
          <Field label="Patient ID"><span className="font-mono text-[10px]">{p.id}</span></Field>
        </div>
      </div>
    </div>

    <div>
      <SectionLabel className="mb-2"><span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" aria-hidden="true" /> Communications</span></SectionLabel>
      {/* Unified comms timeline — every SMS/email/tokenized link for this
          patient with status, so admin can answer "did Susan get the link?"
          without leaving the list. */}
      <PatientCommsTimeline patientId={p.id} patientEmail={p.email || null} patientPhone={p.phone || null} />
    </div>
  </DetailDrawer>
);

export default UserManagementTab;
