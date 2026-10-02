/**
 * ServiceManagementDashboard — the services_enhanced catalog that drives
 * live checkout pricing.
 *
 * Rendered inside AdminServicesTab (Dashboard "billing/services") for BOTH
 * admin roles. Creating, editing, deleting and staff assignment gate on
 * `super_admin` inside this file: a price saved here is what the booking
 * flow charges the next patient, so office managers see it read-only.
 *
 * Pricing is NOT computed here — ServiceForm + useEnhancedServices own the
 * dollars→cents conversion and tier_pricing normalisation. This screen only
 * presents: base_price and tier_pricing are INTEGER CENTS in the DB (the
 * old table printed them as whole dollars, so "$15000" for a $150 draw).
 *
 * Every row maps to exactly ONE bucket so tiles, chips and list agree:
 *
 *   inactive  is_active = false (or archived)
 *   package   service_type = 'package'
 *   partner   category = 'partner'
 *   core      everything else that's live at checkout
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import {
  Package, Plus, Pencil, Trash2, Users, RefreshCw, MoreHorizontal, ChevronRight, AlertTriangle, Lock, Clock, Tag,
} from 'lucide-react';
import { useEnhancedServices } from '@/hooks/admin/useEnhancedServices';
import { ServiceEnhanced } from '@/types/adminTypes';
import ServiceForm from './ServiceForm';
import ServiceStaffAssignments from './ServiceStaffAssignments';
import {
  SectionHeader, StatTiles, FilterChips, SearchBox, LaneHeader, LoadingRows, EmptyState,
  DetailDrawer, Field, FieldGroup, Pill, fmtMoney, TH, TH_STICKY, TD_STICKY, rowKeyHandler,
  type TileDef, type ChipDef,
} from '@/components/dashboards/admin/billing/BillingPrimitives';

// services_enhanced has more columns than the ServiceEnhanced type knows
// about (service_code, tier_pricing, archived_at, …). Read them loosely.
type ServiceRow = ServiceEnhanced & {
  service_code?: string | null;
  tier_pricing?: Record<string, number> | null;
  archived_at?: string | null;
  buffer_minutes?: number | null;
  served_zips?: string[] | null;
  monthly_target?: number | null;
  bundle_discount_pct?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
};

export type Bucket = 'core' | 'partner' | 'package' | 'inactive';

export function deriveBucket(s: ServiceRow): Bucket {
  if (!s.is_active || s.archived_at) return 'inactive';
  if (s.service_type === 'package') return 'package';
  if (s.category === 'partner') return 'partner';
  return 'core';
}

/** Live at checkout but can't actually be sold — zero price or no duration. */
export function isMisconfigured(s: ServiceRow): boolean {
  return deriveBucket(s) !== 'inactive' && ((s.base_price || 0) <= 0 || (s.duration_minutes || 0) <= 0);
}

interface BucketMeta { label: string; desc: string; pill: string; tile: string; dot: string }
const BUCKET_META: Record<Bucket, BucketMeta> = {
  core: {
    label: 'Core', desc: 'Public services patients can book at checkout',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', tile: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500',
  },
  partner: {
    label: 'Partner', desc: 'Provider-specific services (category "partner")',
    pill: 'bg-purple-100 text-purple-800 border-purple-200', tile: 'border-purple-300 bg-purple-50 text-purple-800', dot: 'bg-purple-500',
  },
  package: {
    label: 'Packages', desc: 'Bundles built from other services',
    pill: 'bg-blue-100 text-blue-800 border-blue-200', tile: 'border-blue-300 bg-blue-50 text-blue-800', dot: 'bg-blue-500',
  },
  inactive: {
    label: 'Inactive', desc: 'Hidden from checkout',
    pill: 'bg-white text-gray-500 border-gray-300', tile: 'border-gray-300 bg-gray-50 text-gray-700', dot: 'bg-gray-300',
  },
};

type FilterKey = 'all' | 'needs_action' | Bucket;
const FILTERS: Array<{ key: FilterKey; label: string; desc: string; match: (b: Bucket, s: ServiceRow) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Every service on file', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'Live at checkout with a $0 price or no duration', match: (_b, s) => isMisconfigured(s) },
  { key: 'core', label: 'Core', desc: BUCKET_META.core.desc, match: b => b === 'core' },
  { key: 'partner', label: 'Partner', desc: BUCKET_META.partner.desc, match: b => b === 'partner' },
  { key: 'package', label: 'Packages', desc: BUCKET_META.package.desc, match: b => b === 'package' },
  { key: 'inactive', label: 'Inactive', desc: BUCKET_META.inactive.desc, match: b => b === 'inactive' },
];
const TILE_KEYS: Bucket[] = ['core', 'partner', 'package', 'inactive'];

const TIERS: Array<{ key: string; label: string }> = [
  { key: 'none', label: 'Standard' }, { key: 'member', label: 'Member' }, { key: 'vip', label: 'VIP' }, { key: 'concierge', label: 'Concierge' },
];

const cents = (n: number | null | undefined) => fmtMoney(Number(n) || 0, { cents: true });
const categoryLabel = (c: string) => (c || '').replace(/_/g, ' ');

interface RowHandlers {
  canEdit: boolean;
  onOpen: (s: ServiceRow) => void;
  onEdit: (s: ServiceRow) => void;
  onAssign: (s: ServiceRow) => void;
  onDelete: (s: ServiceRow) => void;
}

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────
const ServiceManagementDashboard: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin';
  const { services, isLoading, createService, updateService, deleteService, fetchServices } = useEnhancedServices() as any;
  const rows = (services || []) as ServiceRow[];

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<ServiceRow | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [assigning, setAssigning] = useState<ServiceRow | null>(null);

  const bucketOf = useMemo(() => {
    const m = new Map<string, Bucket>();
    for (const s of rows) m.set(s.id, deriveBucket(s));
    return m;
  }, [rows]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map(f => [f.key, 0])) as Record<FilterKey, number>;
    for (const s of rows) { const b = bucketOf.get(s.id)!; for (const f of FILTERS) if (f.match(b, s)) c[f.key]++; }
    return c;
  }, [rows, bucketOf]);

  const filtered = useMemo(() => {
    const def = FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    return rows.filter(s => def.match(bucketOf.get(s.id)!, s) && (q === '' ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.category || '').toLowerCase().includes(q) ||
      (s.service_type || '').toLowerCase().includes(q) ||
      (s.service_code || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    ));
  }, [rows, filter, search, bucketOf]);

  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(isMisconfigured);
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(s => !isMisconfigured(s)) };
  }, [filtered, filter]);

  // ── Actions (same hook calls as before) ───────────────────────────
  const handleCreate = async (data: Partial<ServiceEnhanced>) => { await createService(data); setIsCreateOpen(false); };
  const handleUpdate = async (data: Partial<ServiceEnhanced>) => {
    if (!editing) return;
    await updateService(editing.id, data);
    setEditing(null);
  };
  const handleDelete = useCallback(async (s: ServiceRow) => {
    if (!confirm(`Delete "${s.name}"? Patients can no longer book it and this cannot be undone.`)) return;
    await deleteService(s.id);
    setSelected(prev => prev?.id === s.id ? null : prev);
  }, [deleteService]);

  const handlers: RowHandlers = {
    canEdit,
    onOpen: setSelected,
    onEdit: s => setEditing(s),
    onAssign: s => setAssigning(s),
    onDelete: handleDelete,
  };

  const tiles: Array<TileDef<Bucket>> = TILE_KEYS.map(k => ({ key: k, label: BUCKET_META[k].label, desc: BUCKET_META[k].desc, tile: BUCKET_META[k].tile }));
  const chips: Array<ChipDef<FilterKey>> = FILTERS.map(f => ({
    key: f.key, label: f.label, desc: f.desc, dot: f.key === 'all' || f.key === 'needs_action' ? undefined : BUCKET_META[f.key as Bucket].dot,
  }));
  const activeFilter = FILTERS.find(f => f.key === filter)!;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      <SectionHeader
        icon={Package}
        title="Services & pricing"
        subtitle={<>
          What patients can book and what checkout charges — changes here are live immediately.
          {!isLoading && counts.needs_action > 0 && <span className="ml-1 font-medium text-red-700">{counts.needs_action} misconfigured.</span>}
          {!canEdit && <span className="ml-1 inline-flex items-center gap-1 text-gray-400"><Lock className="h-3 w-3" aria-hidden="true" /> Read-only for your role.</span>}
        </>}
        actions={<>
          <Button variant="outline" size="sm" onClick={() => fetchServices?.()} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={isLoading} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 text-xs h-10 sm:h-9">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Add service</span>
              <span className="sm:hidden">Add</span>
            </Button>
          )}
        </>}
      />

      <StatTiles tiles={tiles} counts={counts} active={filter} loading={isLoading && rows.length === 0} onSelect={k => setFilter(filter === k ? 'all' : k)} ariaLabel="Service counts" cols={4} />

      <div className="space-y-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search service, category, code…" ariaLabel="Search services" />
        <FilterChips chips={chips} counts={counts} active={filter} onSelect={setFilter} ariaLabel="Service filter" />
      </div>

      {isLoading && rows.length === 0 ? (
        <LoadingRows label="Loading services" rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          total={rows.length}
          hasSearch={search.trim() !== ''}
          filterLabel={activeFilter.label}
          filterDesc={activeFilter.desc}
          nothingTitle="No services yet."
          nothingHint="Add your first service so patients can book it at checkout."
          searchHint="Try a service name, category or code."
          noun="services"
          onReset={() => { setFilter('all'); setSearch(''); }}
          action={canEdit ? <Button size="sm" onClick={() => setIsCreateOpen(true)} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 text-xs h-9"><Plus className="h-4 w-4" /> Add service</Button> : undefined}
        />
      ) : lanes ? (
        <div className="space-y-5">
          <section aria-labelledby="svc-lane-action">
            <LaneHeader id="svc-lane-action" title="Needs action" count={lanes.action.length} tone="red" hint="live at checkout with a $0 price or no duration" />
            <ServiceRows rows={lanes.action} bucketOf={bucketOf} h={handlers} />
          </section>
          {lanes.rest.length > 0 && (
            <section aria-labelledby="svc-lane-rest">
              <LaneHeader id="svc-lane-rest" title="Everything else" count={lanes.rest.length} tone="gray" />
              <ServiceRows rows={lanes.rest} bucketOf={bucketOf} h={handlers} />
            </section>
          )}
        </div>
      ) : (
        <ServiceRows rows={filtered} bucketOf={bucketOf} h={handlers} />
      )}

      <p className="text-[11px] text-gray-400">Showing {filtered.length} of {rows.length} service{rows.length === 1 ? '' : 's'}</p>

      {selected && (
        <ServiceDetailDrawer s={selected} bucket={bucketOf.get(selected.id) || deriveBucket(selected)} h={handlers} onClose={() => setSelected(null)} />
      )}

      {/* Create */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-[#B91C1C]" aria-hidden="true" /> Create new service</DialogTitle>
          </DialogHeader>
          <ServiceForm onSubmit={handleCreate} />
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-[#B91C1C]" aria-hidden="true" /> Edit service</DialogTitle>
          </DialogHeader>
          <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            Saving changes the price patients see at checkout immediately.
          </div>
          {editing && <ServiceForm service={editing} onSubmit={handleUpdate} />}
        </DialogContent>
      </Dialog>

      {/* Staff assignments */}
      <Dialog open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)}>
        <DialogContent className="max-w-4xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-[#B91C1C]" aria-hidden="true" /> Staff assignments · {assigning?.name}</DialogTitle>
          </DialogHeader>
          {assigning && <ServiceStaffAssignments service={assigning} />}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Presentational pieces
// ──────────────────────────────────────────────────────────────────
const StatusPill: React.FC<{ bucket: Bucket; className?: string }> = ({ bucket, className }) => (
  <Pill className={cn(BUCKET_META[bucket].pill, className)} dot={BUCKET_META[bucket].dot} title={BUCKET_META[bucket].desc}>{BUCKET_META[bucket].label}</Pill>
);

const TierSummary: React.FC<{ s: ServiceRow }> = ({ s }) => {
  const tp = s.tier_pricing || {};
  const extras = TIERS.filter(t => t.key !== 'none' && tp[t.key] != null && Number(tp[t.key]) !== Number(s.base_price));
  if (extras.length === 0) return <span className="text-gray-400">flat</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default text-gray-600">{extras.map(t => `${t.label} ${cents(tp[t.key])}`).join(' · ')}</span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {TIERS.map(t => <div key={t.key}>{t.label}: {cents(tp[t.key] ?? s.base_price)}</div>)}
      </TooltipContent>
    </Tooltip>
  );
};

const RowMenu: React.FC<{ s: ServiceRow; h: RowHandlers; className?: string }> = ({ s, h, className }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${s.name}`} onClick={(e) => e.stopPropagation()}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => h.onOpen(s)}><Package className="h-4 w-4 mr-2" aria-hidden="true" /> Open service</DropdownMenuItem>
      {h.canEdit && (
        <>
          <DropdownMenuItem onSelect={() => h.onEdit(s)}><Pencil className="h-4 w-4 mr-2" aria-hidden="true" /> Edit & pricing</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => h.onAssign(s)}><Users className="h-4 w-4 mr-2" aria-hidden="true" /> Staff assignments</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={() => h.onDelete(s)}><Trash2 className="h-4 w-4 mr-2" aria-hidden="true" /> Delete service</DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

const PrimaryAction: React.FC<{ s: ServiceRow; h: RowHandlers; className?: string }> = ({ s, h, className }) => {
  if (!h.canEdit) return null;
  return (
    <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} onClick={(e) => { e.stopPropagation(); h.onEdit(s); }}>
      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
    </Button>
  );
};

const ServiceRows: React.FC<{ rows: ServiceRow[]; bucketOf: Map<string, Bucket>; h: RowHandlers }> = ({ rows, bucketOf, h }) => {
  const bucket = (s: ServiceRow) => bucketOf.get(s.id) || deriveBucket(s);
  return (
    <>
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className={cn(TH, 'pl-4')}>Service</TableHead>
              <TableHead className={TH}>Category</TableHead>
              <TableHead className={cn(TH, 'text-right')}>Price</TableHead>
              <TableHead className={cn(TH, 'hidden lg:table-cell')}>Tiers</TableHead>
              <TableHead className={TH}>Duration</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={TH_STICKY}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(s => {
              const b = bucket(s);
              const bad = isMisconfigured(s);
              const open = () => h.onOpen(s);
              return (
                <TableRow
                  key={s.id}
                  role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)}
                  aria-label={`${s.name}, ${BUCKET_META[b].label}. Open service`}
                  className={cn('cursor-pointer bg-white focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40',
                    b === 'inactive' && 'opacity-60', bad && 'border-l-4 border-l-red-500')}
                >
                  <TableCell className="py-2.5 pl-4 align-top">
                    <div className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 flex-wrap">
                      {s.name}
                      {s.requires_lab_order && <Pill className="bg-indigo-50 text-indigo-700 border-indigo-200">Lab order</Pill>}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate max-w-xs">
                      {s.service_code || s.service_type}{s.description ? ` · ${s.description}` : ''}
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 capitalize">{categoryLabel(s.category)}</TableCell>
                  <TableCell className={cn('py-2.5 align-top text-sm font-semibold text-right tabular-nums whitespace-nowrap', bad && 'text-red-700')}>{cents(s.base_price)}</TableCell>
                  <TableCell className="hidden lg:table-cell py-2.5 align-top text-xs whitespace-nowrap"><TierSummary s={s} /></TableCell>
                  <TableCell className={cn('py-2.5 align-top text-xs text-gray-700 whitespace-nowrap', (s.duration_minutes || 0) <= 0 && 'text-red-700')}>
                    {s.duration_minutes || 0} min{s.buffer_minutes ? <span className="text-gray-400"> +{s.buffer_minutes}</span> : null}
                  </TableCell>
                  <TableCell className="py-2.5 align-top"><StatusPill bucket={b} /></TableCell>
                  <TableCell className={TD_STICKY}>
                    <div className="flex items-center justify-end gap-1">
                      <PrimaryAction s={s} h={h} className="h-9" />
                      <RowMenu s={s} h={h} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {rows.map(s => {
          const b = bucket(s);
          const bad = isMisconfigured(s);
          const open = () => h.onOpen(s);
          return (
            <Card key={s.id} role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)} aria-label={`${s.name}, ${BUCKET_META[b].label}. Open service`}
              className={cn('shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40', b === 'inactive' && 'opacity-60', bad && 'border-l-4 border-l-red-500')}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-800">{s.name}</div>
                    <div className="text-[11px] text-gray-500 capitalize truncate">{categoryLabel(s.category)} · {s.service_code || s.service_type}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn('text-sm font-bold tabular-nums whitespace-nowrap', bad && 'text-red-700')}>{cents(s.base_price)}</div>
                    <div className="text-[11px] text-gray-500">{s.duration_minutes || 0} min</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <StatusPill bucket={b} />
                  {s.requires_lab_order && <Pill className="bg-indigo-50 text-indigo-700 border-indigo-200">Lab order</Pill>}
                  <span className="text-gray-500"><TierSummary s={s} /></span>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <PrimaryAction s={s} h={h} className="h-11 flex-1 justify-center" />
                  <RowMenu s={s} h={h} className="h-11 w-11 flex-shrink-0 border border-gray-200" />
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

const fmtTs = (s: string | null | undefined) => {
  if (!s) return '—';
  const d = new Date(s);
  return isValid(d) ? format(d, 'MMM d, yyyy') : '—';
};

const ServiceDetailDrawer: React.FC<{ s: ServiceRow; bucket: Bucket; h: RowHandlers; onClose: () => void }> = ({ s, bucket, h, onClose }) => {
  const tp = s.tier_pricing || {};
  const bad = isMisconfigured(s);
  return (
    <DetailDrawer
      eyebrow="Service"
      title={s.name}
      titleId={`service-title-${s.id}`}
      onClose={onClose}
      maxWidth="sm:max-w-3xl"
      headerExtra={<>
        <StatusPill bucket={bucket} className="bg-white/95" />
        <span className="text-lg font-bold tabular-nums">{cents(s.base_price)}</span>
        <span className="text-sm opacity-95 flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> {s.duration_minutes || 0} min</span>
        {s.service_code && <span className="text-sm opacity-95 flex items-center gap-1 font-mono"><Tag className="h-3.5 w-3.5" aria-hidden="true" /> {s.service_code}</span>}
      </>}
    >
      {bad && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p>This service is live at checkout but has {(s.base_price || 0) <= 0 ? 'a $0 price' : 'no duration'}. Patients can book it without being charged correctly.</p>
        </div>
      )}
      {h.canEdit ? (
        <div className="flex sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible -mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0">
          <Button onClick={() => h.onEdit(s)} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-10 text-xs flex-shrink-0">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit & pricing
          </Button>
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={() => h.onAssign(s)}>
            <Users className="h-3.5 w-3.5" aria-hidden="true" /> Staff assignments
          </Button>
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0 text-red-600 border-red-200 hover:bg-red-50" onClick={() => h.onDelete(s)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
          </Button>
        </div>
      ) : (
        <p className="text-xs text-gray-500 flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden="true" /> Only a super admin can change services and prices.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <FieldGroup title="Pricing (what checkout charges)">
          {TIERS.map(t => (
            <Field key={t.key} label={t.label}><span className="tabular-nums font-medium">{cents(tp[t.key] ?? s.base_price)}</span>{tp[t.key] == null && <span className="text-gray-400"> (base)</span>}</Field>
          ))}
          {s.bundle_discount_pct != null && <Field label="Bundle discount">{s.bundle_discount_pct}%</Field>}
        </FieldGroup>
        <FieldGroup title="Booking">
          <Field label="Category"><span className="capitalize">{categoryLabel(s.category)}</span></Field>
          <Field label="Type"><span className="capitalize">{s.service_type}</span></Field>
          <Field label="Duration">{s.duration_minutes || 0} min{s.buffer_minutes ? ` + ${s.buffer_minutes} min buffer` : ''}</Field>
          <Field label="Lab order">{s.requires_lab_order ? 'Required' : 'Not required'}</Field>
          {s.served_zips && s.served_zips.length > 0 && <Field label="Served ZIPs">{s.served_zips.length} ZIP{s.served_zips.length === 1 ? '' : 's'}</Field>}
          {s.monthly_target != null && <Field label="Monthly target">{s.monthly_target}</Field>}
          {s.parent_service?.name && <Field label="Parent">{s.parent_service.name}</Field>}
        </FieldGroup>
        <FieldGroup title="Record">
          <Field label="Active">{s.is_active ? 'Yes' : 'No'}</Field>
          {s.archived_at && <Field label="Archived">{fmtTs(s.archived_at)}</Field>}
          {s.effective_from && <Field label="Effective from">{fmtTs(s.effective_from)}</Field>}
          {s.effective_to && <Field label="Effective to">{fmtTs(s.effective_to)}</Field>}
          <Field label="Created">{fmtTs(s.created_at)}</Field>
          <Field label="Updated">{fmtTs(s.updated_at)}</Field>
        </FieldGroup>
      </div>

      {s.description && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Description</p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded px-3 py-2">{s.description}</p>
        </div>
      )}
      {Array.isArray(s.sub_services) && s.sub_services.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Included services</p>
          <div className="flex flex-wrap gap-1.5">
            {s.sub_services.map(c => <Pill key={c.id} className="bg-blue-50 text-blue-700 border-blue-200">{c.name}</Pill>)}
          </div>
        </div>
      )}
      <p className="text-[10px] text-gray-400">Service ID <span className="font-mono">{s.id}</span></p>
    </DetailDrawer>
  );
};

export default ServiceManagementDashboard;
