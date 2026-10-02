/**
 * UPGRADES & ROI — Owner › Upgrades (owner-gated in Dashboard.tsx).
 *
 * One pane of glass for every revenue-adjacent upgrade event in
 * `upgrade_events`:
 *   - companion_click      (Text-to-Add family-member upsell taps)
 *   - membership_applied   (bookings where a member discount fired)
 *   - promo_applied        (bookings where a referral/promo code fired)
 *   - bundle_purchased     (multi-visit bundles — reserved for when wired)
 *
 * Every event maps to exactly ONE bucket (Converted / Open / Lost) so the
 * stat tiles, the filter chips and the list always agree. Money tiles
 * (realized, pipeline, discounts, conversion) are derived from the same rows.
 * Read-only: the only actions are sms:/tel: links and the calendar deep link.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Crown, Users, Tag, Package, TrendingUp, DollarSign, MessageSquare, Phone, RefreshCw, Search, X,
  ChevronRight, Calendar, Mail, Sparkles,
} from 'lucide-react';
import {
  SectionHeader, SectionTitle, StatTiles, KpiTile, FilterChips, Pill, LaneHeader, LoadingRows, LoadingTiles,
  EmptyState, ErrorBanner, Th, ThActions, TdActions, rowKeyHandler, Field, DetailDrawer, fmtInt, fmtPct,
  type TileDef, type ChipDef,
} from './owner/sectionUi';

type EventType = 'companion_click' | 'membership_applied' | 'promo_applied' | 'bundle_purchased';

interface UpgradeEvent {
  id: string;
  event_type: EventType | string;
  status: 'intent' | 'converted' | 'lost' | string;
  patient_email: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  appointment_id: string | null;
  revenue_cents: number;
  potential_cents: number;
  discount_cents: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  converted_at: string | null;
}

interface TypeStats { intent: number; converted: number; lost: number; revenue: number; discount: number; potential: number }

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; pill: string }> = {
  companion_click:    { label: 'Family member add-ons', icon: Users,   color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', pill: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  membership_applied: { label: 'Membership discounts',  icon: Crown,   color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',   pill: 'bg-purple-100 text-purple-800 border-purple-200' },
  promo_applied:      { label: 'Promo / referral codes', icon: Tag,    color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       pill: 'bg-blue-100 text-blue-800 border-blue-200' },
  bundle_purchased:   { label: 'Visit bundles',          icon: Package, color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',     pill: 'bg-amber-100 text-amber-800 border-amber-200' },
};
const typeMeta = (t: string) => TYPE_META[t] || { label: t, icon: TrendingUp, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', pill: 'bg-gray-100 text-gray-700 border-gray-200' };

const RANGES = [
  { key: '7d',  label: '7 days',  days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: 0 },
] as const;
type RangeKey = typeof RANGES[number]['key'];

// ── Buckets: ONE per event ──────────────────────────────────────────
type Bucket = 'converted' | 'open' | 'lost';
const bucketOf = (e: UpgradeEvent): Bucket => (e.status === 'converted' ? 'converted' : e.status === 'lost' ? 'lost' : 'open');

const BUCKET_META: Record<Bucket, { label: string; desc: string; pill: string; tile: string; dot: string }> = {
  open:      { label: 'Open',      desc: 'Intent recorded — nothing booked yet. Follow up.', pill: 'bg-amber-100 text-amber-800 border-amber-200', tile: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  converted: { label: 'Converted', desc: 'The upsell / discount landed on a paid booking',   pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', tile: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  lost:      { label: 'Lost',      desc: 'Marked lost — kept out of the live pipeline',       pill: 'bg-gray-100 text-gray-700 border-gray-200', tile: 'border-gray-300 bg-gray-100 text-gray-800', dot: 'bg-gray-400' },
};

type FilterKey = 'all' | Bucket;
const TILES: Array<TileDef<Bucket>> = [
  { key: 'open', label: 'Open', desc: BUCKET_META.open.desc, activeClass: BUCKET_META.open.tile, alert: true },
  { key: 'converted', label: 'Converted', desc: BUCKET_META.converted.desc, activeClass: BUCKET_META.converted.tile },
  { key: 'lost', label: 'Lost', desc: BUCKET_META.lost.desc, activeClass: BUCKET_META.lost.tile },
];
const CHIPS: Array<ChipDef<FilterKey>> = [
  { key: 'all', label: 'All', desc: 'Every event in the range' },
  { key: 'open', label: 'Open', desc: BUCKET_META.open.desc, dot: BUCKET_META.open.dot },
  { key: 'converted', label: 'Converted', desc: BUCKET_META.converted.desc, dot: BUCKET_META.converted.dot },
  { key: 'lost', label: 'Lost', desc: BUCKET_META.lost.desc, dot: BUCKET_META.lost.dot },
];

type TypeFilter = 'all' | string;

const dollars = (cents: number) => `$${(Math.max(0, cents || 0) / 100).toFixed(2)}`;
const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
const who = (e: UpgradeEvent) => e.patient_name || e.patient_email || 'Anonymous';

const metaStr = (e: UpgradeEvent, k: string): string | null => {
  const v = e.metadata?.[k];
  return v === undefined || v === null || v === '' ? null : String(v);
};

const UpgradesTab: React.FC = () => {
  const [events, setEvents] = useState<UpgradeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('30d');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UpgradeEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = supabase
        .from('upgrade_events' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      const def = RANGES.find(r => r.key === range)!;
      const { data, error: qErr } = def.days === 0
        ? await base
        : await base.gte('created_at', new Date(Date.now() - def.days * 24 * 3600 * 1000).toISOString());
      if (qErr) throw qErr;
      setEvents((data as unknown as UpgradeEvent[]) || []);
    } catch (e: any) {
      console.error('[UpgradesTab] load failed:', e);
      setError(e?.message || String(e));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // ── Derived ──────────────────────────────────────────────────────
  const bucketMap = useMemo(() => {
    const m = new Map<string, Bucket>();
    for (const e of events) m.set(e.id, bucketOf(e));
    return m;
  }, [events]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: events.length, open: 0, converted: 0, lost: 0 };
    for (const e of events) c[bucketMap.get(e.id)!]++;
    return c;
  }, [events, bucketMap]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const e of events) c[e.event_type] = (c[e.event_type] || 0) + 1;
    return c;
  }, [events]);

  const kpis = useMemo(() => {
    const byType: Record<string, TypeStats> = {};
    let totalRevenue = 0, totalPotential = 0, totalDiscount = 0;
    for (const e of events) {
      const t = e.event_type;
      if (!byType[t]) byType[t] = { intent: 0, converted: 0, lost: 0, revenue: 0, discount: 0, potential: 0 };
      const b = bucketMap.get(e.id)!;
      if (b === 'converted') { byType[t].converted++; byType[t].revenue += e.revenue_cents || 0; totalRevenue += e.revenue_cents || 0; }
      else if (b === 'lost') { byType[t].lost++; }
      else { byType[t].intent++; byType[t].potential += e.potential_cents || 0; totalPotential += e.potential_cents || 0; }
      byType[t].discount += e.discount_cents || 0;
      totalDiscount += e.discount_cents || 0;
    }
    const conversionRate = events.length > 0 ? (counts.converted / events.length) * 100 : 0;
    return { byType, totalRevenue, totalPotential, totalDiscount, conversionRate };
  }, [events, bucketMap, counts.converted]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter(e =>
      (filter === 'all' || bucketMap.get(e.id) === filter) &&
      (typeFilter === 'all' || e.event_type === typeFilter) &&
      (q === '' ||
        (e.patient_name || '').toLowerCase().includes(q) ||
        (e.patient_email || '').toLowerCase().includes(q) ||
        (e.patient_phone || '').includes(q) ||
        (metaStr(e, 'referral_code') || '').toLowerCase().includes(q) ||
        (metaStr(e, 'tier') || '').toLowerCase().includes(q) ||
        typeMeta(e.event_type).label.toLowerCase().includes(q)),
    );
  }, [events, filter, typeFilter, search, bucketMap]);

  // "Needs follow-up" lane: open events, only on the unfiltered list.
  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(e => bucketMap.get(e.id) === 'open');
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(e => bucketMap.get(e.id) !== 'open') };
  }, [filtered, filter, bucketMap]);

  const typeChips: Array<ChipDef<string>> = useMemo(() => [
    { key: 'all', label: 'All types' },
    ...Object.entries(TYPE_META).map(([k, m]) => ({ key: k, label: m.label })),
    ...Object.keys(typeCounts).filter(k => k !== 'all' && !TYPE_META[k]).map(k => ({ key: k, label: k })),
  ], [typeCounts]);
  const typeCountsFull = useMemo(() => {
    const c: Record<string, number> = { ...typeCounts };
    for (const ch of typeChips) if (c[ch.key] === undefined) c[ch.key] = 0;
    return c;
  }, [typeCounts, typeChips]);

  const activeChip = CHIPS.find(c => c.key === filter)!;
  const rangeLabel = RANGES.find(r => r.key === range)!.label.toLowerCase();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        <SectionHeader
          icon={Crown}
          title="Upgrades & ROI"
          subtitle={<>Every upsell, discount and membership perk that touched a booking.{!loading && counts.open > 0 && <span className="ml-1 font-medium text-amber-700">{counts.open} open.</span>}</>}
          actions={
            <>
              <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="Date range">
                {RANGES.map((r, i) => (
                  <button key={r.key} type="button" onClick={() => setRange(r.key)} aria-pressed={range === r.key}
                    className={cn('px-3 h-10 sm:h-9 text-xs font-medium transition', i > 0 && 'border-l border-gray-200',
                      range === r.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}>
                    {r.label}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={load} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </>
          }
        />

        {/* Bucket tiles — partition every event */}
        {loading && events.length === 0 ? <LoadingTiles n={3} /> : (
          <StatTiles tiles={TILES} counts={counts} active={filter === 'all' ? null : filter} onToggle={(k) => setFilter(prev => (prev === k ? 'all' : k))} loading={loading} cols={4} />
        )}

        {/* Money strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KpiTile label="Realized revenue" value={dollars(kpis.totalRevenue)} hint={`${fmtInt(counts.converted)} converted booking${counts.converted === 1 ? '' : 's'}`} icon={DollarSign} tone="green" loading={loading} />
          <KpiTile label="Pipeline potential" value={dollars(kpis.totalPotential)} hint={`${fmtInt(counts.open)} open intent${counts.open === 1 ? '' : 's'}`} icon={TrendingUp} tone={counts.open > 0 ? 'amber' : 'default'} loading={loading} />
          <KpiTile label="Discounts given" value={dollars(kpis.totalDiscount)} hint="member perks + promo codes" icon={Tag} loading={loading} />
          <KpiTile label="Conversion" value={fmtPct(kpis.conversionRate)} hint={`converted ÷ all ${fmtInt(events.length)} events`} icon={Sparkles} tone="brand" loading={loading} />
        </div>

        {error && <ErrorBanner title="Couldn't load upgrade events" message={error} onRetry={load} />}

        {/* Per-type breakdown */}
        <section aria-labelledby="upg-types">
          <SectionTitle id="upg-types" hint={`last ${rangeLabel}`}>By upgrade type</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {Object.entries(TYPE_META).map(([key, meta]) => {
              const k = kpis.byType[key] || { intent: 0, converted: 0, lost: 0, revenue: 0, discount: 0, potential: 0 };
              const total = k.intent + k.converted + k.lost;
              const Icon = meta.icon;
              const conv = total > 0 ? (k.converted / total) * 100 : 0;
              const active = typeFilter === key;
              return (
                <button key={key} type="button" onClick={() => setTypeFilter(active ? 'all' : key)} aria-pressed={active}
                  className={cn('text-left rounded-lg border p-3 shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40', meta.bg, active && 'ring-2 ring-[#B91C1C]/30')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', meta.color)}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{meta.label}</span>
                    <span className="text-[11px] tabular-nums text-gray-500">{loading ? '–' : `${fmtInt(total)} event${total === 1 ? '' : 's'}`}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div><p className="text-lg font-bold text-gray-900 tabular-nums">{loading ? '–' : fmtInt(k.converted)}</p><p className="text-[10px] uppercase tracking-wide text-gray-500">Converted</p></div>
                    <div><p className="text-lg font-bold text-gray-900 tabular-nums">{loading ? '–' : dollars(k.revenue)}</p><p className="text-[10px] uppercase tracking-wide text-gray-500">Revenue</p></div>
                    <div><p className="text-lg font-bold text-gray-900 tabular-nums">{loading ? '–' : `${conv.toFixed(0)}%`}</p><p className="text-[10px] uppercase tracking-wide text-gray-500">Conv.</p></div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    {fmtInt(k.intent)} open{k.lost > 0 ? ` · ${fmtInt(k.lost)} lost` : ''}{k.discount > 0 ? ` · ${dollars(k.discount)} discounted` : ''}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Search + chips */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient, email, phone, code, tier…" aria-label="Search upgrade events" className="h-10 sm:h-9 pl-8 text-sm" />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <FilterChips chips={CHIPS} counts={counts} active={filter} onSelect={setFilter} label="Status filter" />
          <FilterChips chips={typeChips} counts={typeCountsFull} active={typeFilter} onSelect={setTypeFilter} label="Type filter" />
        </div>

        {/* Body */}
        {loading && events.length === 0 ? <LoadingRows label="Loading upgrade events" /> : filtered.length === 0 ? (
          <EmptyState
            icon={Crown}
            title={events.length === 0 ? `No upgrade events in the last ${rangeLabel}.` : search ? 'No events match your search.' : `Nothing in "${activeChip.label}".`}
            hint={events.length === 0 ? 'Events appear as patients tap add-ons, apply member discounts or use promo codes.' : search ? 'Try a patient name, email, phone, referral code or tier.' : activeChip.desc}
            action={events.length > 0 ? { label: `Show all ${events.length} events`, onClick: () => { setFilter('all'); setTypeFilter('all'); setSearch(''); } } : undefined}
          />
        ) : lanes ? (
          <div className="space-y-5">
            <section aria-labelledby="upg-lane-action">
              <LaneHeader id="upg-lane-action" title="Needs follow-up" count={lanes.action.length} tone="amber" />
              <EventRows rows={lanes.action} bucketMap={bucketMap} onOpen={setSelected} />
            </section>
            {lanes.rest.length > 0 && (
              <section aria-labelledby="upg-lane-rest">
                <LaneHeader id="upg-lane-rest" title="Everything else" count={lanes.rest.length} tone="gray" />
                <EventRows rows={lanes.rest} bucketMap={bucketMap} onOpen={setSelected} />
              </section>
            )}
          </div>
        ) : (
          <EventRows rows={filtered} bucketMap={bucketMap} onOpen={setSelected} />
        )}

        <p className="text-[11px] text-gray-400">
          Showing {filtered.length} of {events.length} event{events.length === 1 ? '' : 's'}{events.length >= 500 ? ' · showing the newest 500' : ''}
        </p>

        {selected && <EventDrawer e={selected} bucket={bucketMap.get(selected.id) || bucketOf(selected)} onClose={() => setSelected(null)} />}
      </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Row pieces
// ──────────────────────────────────────────────────────────────────
const Amounts: React.FC<{ e: UpgradeEvent; bucket: Bucket }> = ({ e, bucket }) => (
  <span className="text-xs text-gray-700 whitespace-nowrap">
    {bucket === 'converted' && e.revenue_cents > 0 && <span className="font-semibold text-emerald-700">{dollars(e.revenue_cents)}</span>}
    {bucket !== 'converted' && e.potential_cents > 0 && <span className="font-semibold text-amber-700">{dollars(e.potential_cents)} <span className="font-normal text-gray-500">potential</span></span>}
    {e.discount_cents > 0 && <span className="block text-[11px] text-gray-500">{dollars(e.discount_cents)} off</span>}
    {!(e.revenue_cents > 0 || e.potential_cents > 0 || e.discount_cents > 0) && <span className="text-gray-400">—</span>}
  </span>
);

const Details: React.FC<{ e: UpgradeEvent }> = ({ e }) => {
  const tier = metaStr(e, 'tier'), code = metaStr(e, 'referral_code'), channel = metaStr(e, 'channel');
  if (!tier && !code && !channel) return <span className="text-gray-400">—</span>;
  return (
    <span className="text-xs text-gray-600 inline-flex items-center gap-1.5 flex-wrap">
      {tier && <span className="uppercase font-semibold text-purple-700">{tier}</span>}
      {code && <span className="font-mono bg-gray-100 px-1 rounded">{code}</span>}
      {channel && <span>via {channel}</span>}
    </span>
  );
};

const ContactActions: React.FC<{ e: UpgradeEvent; bucket: Bucket; tall?: boolean }> = ({ e, bucket, tall }) => {
  const stop = (ev: React.SyntheticEvent) => ev.stopPropagation();
  const h = tall ? 'h-11' : 'h-9';
  const showFollowUp = e.event_type === 'companion_click' && bucket === 'open' && !!e.patient_phone;
  return (
    <>
      {showFollowUp && (
        <>
          <Button size="sm" variant="outline" className={cn(h, 'text-xs gap-1', tall && 'flex-1 justify-center')} asChild onClick={stop}>
            <a href={`sms:${e.patient_phone}`}><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Text</a>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" className={cn(h, tall ? 'w-11' : 'w-9', 'p-0')} asChild onClick={stop} aria-label={`Call ${e.patient_phone}`}>
                <a href={`tel:${e.patient_phone}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" /></a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Call {e.patient_phone}</TooltipContent>
          </Tooltip>
        </>
      )}
      {e.appointment_id && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className={cn(h, tall ? 'w-11 border border-gray-200' : 'w-9', 'p-0')} asChild onClick={stop} aria-label="View appointment">
              <a href={`/dashboard/super_admin/calendar?appointment=${e.appointment_id}`} target="_blank" rel="noopener noreferrer"><Calendar className="h-4 w-4" aria-hidden="true" /></a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>View appointment</TooltipContent>
        </Tooltip>
      )}
    </>
  );
};

const EventRows: React.FC<{ rows: UpgradeEvent[]; bucketMap: Map<string, Bucket>; onOpen: (e: UpgradeEvent) => void }> = ({ rows, bucketMap, onOpen }) => (
  <>
    <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/80">
            <Th className="pl-4">Patient</Th>
            <Th>Upgrade</Th>
            <Th>Status</Th>
            <Th>Amount</Th>
            <Th className="hidden lg:table-cell">Details</Th>
            <Th>When</Th>
            <ThActions />
          </tr>
        </thead>
        <tbody>
          {rows.map(e => {
            const b = bucketMap.get(e.id) || bucketOf(e);
            const tm = typeMeta(e.event_type);
            const Icon = tm.icon;
            const open = () => onOpen(e);
            return (
              <tr key={e.id} role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)} aria-label={`${who(e)}, ${tm.label}, ${BUCKET_META[b].label}. Open event`}
                className={cn('border-t border-gray-100 cursor-pointer hover:bg-gray-50/70 focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40',
                  b === 'open' && 'border-l-4 border-l-amber-400')}>
                <td className="py-2.5 pl-4 pr-3 align-top">
                  <span className="text-sm font-semibold text-gray-800">{who(e)}</span>
                  <span className="block text-[11px] text-gray-500 truncate max-w-[220px]">{e.patient_phone || e.patient_email || 'No contact on file'}</span>
                </td>
                <td className="py-2.5 px-3 align-top"><span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', tm.color)}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{tm.label}</span></td>
                <td className="py-2.5 px-3 align-top"><Pill className={BUCKET_META[b].pill} dot={BUCKET_META[b].dot}>{BUCKET_META[b].label}</Pill></td>
                <td className="py-2.5 px-3 align-top"><Amounts e={e} bucket={b} /></td>
                <td className="hidden lg:table-cell py-2.5 px-3 align-top"><Details e={e} /></td>
                <td className="py-2.5 px-3 align-top text-xs text-gray-600 whitespace-nowrap">
                  {format(new Date(e.created_at), 'MMM d, h:mm a')}
                  <span className="block text-[11px] text-gray-400">{ago(e.created_at)}</span>
                </td>
                <TdActions><ContactActions e={e} bucket={b} /></TdActions>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="md:hidden space-y-2">
      {rows.map(e => {
        const b = bucketMap.get(e.id) || bucketOf(e);
        const tm = typeMeta(e.event_type);
        const Icon = tm.icon;
        const open = () => onOpen(e);
        return (
          <Card key={e.id} role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)} aria-label={`${who(e)}, ${tm.label}, ${BUCKET_META[b].label}. Open event`}
            className={cn('shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40', b === 'open' && 'border-l-4 border-l-amber-400')}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 truncate">{who(e)}</p>
                  <p className={cn('text-[11px] inline-flex items-center gap-1 mt-0.5', tm.color)}><Icon className="h-3 w-3" aria-hidden="true" />{tm.label}</p>
                </div>
                <Pill className={BUCKET_META[b].pill} dot={BUCKET_META[b].dot}>{BUCKET_META[b].label}</Pill>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
                <Amounts e={e} bucket={b} />
                <span className="text-gray-500">{ago(e.created_at)}</span>
              </div>
              <Details e={e} />
              <div className="flex items-center gap-1.5 pt-0.5">
                <ContactActions e={e} bucket={b} tall />
                <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0 ml-auto" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </>
);

const EventDrawer: React.FC<{ e: UpgradeEvent; bucket: Bucket; onClose: () => void }> = ({ e, bucket, onClose }) => {
  const tm = typeMeta(e.event_type);
  const metaEntries = Object.entries(e.metadata || {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <DetailDrawer eyebrow={tm.label} title={who(e)} onClose={onClose}
      titleExtra={<Pill className={cn(BUCKET_META[bucket].pill, 'bg-white/95')} dot={BUCKET_META[bucket].dot}>{BUCKET_META[bucket].label}</Pill>}
      footer={<>Recorded {format(new Date(e.created_at), 'MMM d, yyyy h:mm a')} · Event ID <span className="font-mono">{e.id}</span></>}>
      {bucket === 'open' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Intent recorded but nothing booked yet{e.potential_cents > 0 ? ` — ${dollars(e.potential_cents)} on the table` : ''}. {e.patient_phone ? 'Text or call to close it.' : 'No phone on file.'}
        </div>
      )}
      <div className="flex sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible -mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0">
        {e.patient_phone && (
          <>
            <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild><a href={`sms:${e.patient_phone}`}><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Text</a></Button>
            <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild><a href={`tel:${e.patient_phone}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call</a></Button>
          </>
        )}
        {e.patient_email && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild><a href={`mailto:${e.patient_email}`}><Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email</a></Button>
        )}
        {e.appointment_id && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
            <a href={`/dashboard/super_admin/calendar?appointment=${e.appointment_id}`} target="_blank" rel="noopener noreferrer"><Calendar className="h-3.5 w-3.5" aria-hidden="true" /> View appointment</a>
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Patient</p>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <Field label="Email">{e.patient_email || '—'}</Field>
            <Field label="Phone">{e.patient_phone || '—'}</Field>
            <Field label="Appointment"><span className="font-mono text-[10px]">{e.appointment_id || '—'}</span></Field>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Money</p>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <Field label="Revenue">{e.revenue_cents > 0 ? <span className="font-semibold text-emerald-700">{dollars(e.revenue_cents)}</span> : '—'}</Field>
            <Field label="Potential">{e.potential_cents > 0 ? dollars(e.potential_cents) : '—'}</Field>
            <Field label="Discount">{e.discount_cents > 0 ? dollars(e.discount_cents) : '—'}</Field>
            <Field label="Converted">{e.converted_at ? format(new Date(e.converted_at), 'MMM d, yyyy h:mm a') : '—'}</Field>
          </div>
        </div>
      </div>
      {metaEntries.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Details</p>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            {metaEntries.map(([k, v]) => (
              <Field key={k} label={k.replace(/_/g, ' ')}>{typeof v === 'object' ? <span className="font-mono text-[10px]">{JSON.stringify(v)}</span> : String(v)}</Field>
            ))}
          </div>
        </div>
      )}
    </DetailDrawer>
  );
};

export default UpgradesTab;
