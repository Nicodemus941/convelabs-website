/**
 * GrowthOverview — "where do visitors come from and what do they do?"
 *
 * One screen in the LabOrdersTab language:
 *   - four stat tiles that PARTITION every session in the window by channel
 *     (Social / Search / Direct / Other), so tiles + chips + table agree;
 *   - an outcomes strip (bookings created, online bookings, converted
 *     sessions, booking rate) from `appointments` for the same window;
 *   - a "Needs action" lane for attribution gaps the data itself reveals
 *     (UTMs never saved, conversions never flagged, no ad spend logged …);
 *   - a daily chart (sessions stacked by channel + online bookings line);
 *   - a traffic-sources table with a sticky Actions column + mobile cards;
 *   - the broadcast campaigns table (campaign_sends) with an engagement drawer.
 *
 * Read-only. Nothing here writes to the database.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Search, X, Globe, ExternalLink, Filter, Mail, MousePointerClick, Eye, AlertTriangle,
  Smartphone, Monitor, Tablet, CalendarPlus, Loader2, MapPin, Tag, DollarSign, ChevronRight, Info,
} from 'lucide-react';
import { format, formatDistanceToNowStrict, subDays, startOfDay } from 'date-fns';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip as ChartTooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  SectionTitle, StatTiles, KpiTile, FilterChips, Pill, LaneHeader, LoadingRows, LoadingTiles, EmptyState, ErrorBanner,
  Th, ThActions, TdActions, rowKeyHandler, Field, DetailDrawer, fmtInt, fmtPct, fmtMoney, type TileDef, type ChipDef,
} from '../owner/sectionUi';
import {
  type Channel, type SessionRow, type BookingRow, type CampaignRow, type CampaignEngagement, type AdSpendRow,
  CHANNEL_META, CHANNEL_ORDER, classify, hostOf, sourceLabel, fetchSessions, fetchBookings, fetchCampaigns,
  fetchCampaignEngagement, fetchAdSpend, fetchCampaignEmailLogCount, campaignLabel, isOnlineBooking, localDayKey,
} from './growthData';

export type RangeKey = '7d' | '30d' | '90d';
export const RANGES: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
];

type FilterKey = 'all' | Channel;

const TILES: Array<TileDef<Channel>> = CHANNEL_ORDER.map(c => ({
  key: c, label: CHANNEL_META[c].label, desc: CHANNEL_META[c].desc, activeClass: CHANNEL_META[c].tile,
}));

const CHIPS: Array<ChipDef<FilterKey>> = [
  { key: 'all', label: 'All sessions', desc: 'Every session in the window' },
  ...CHANNEL_ORDER.map(c => ({ key: c as FilterKey, label: CHANNEL_META[c].label, desc: CHANNEL_META[c].desc, dot: CHANNEL_META[c].dot })),
];

interface SourceAgg {
  key: string;        // sourceLabel
  host: string;       // representative host
  channel: Channel;
  sessions: number;
  mobile: number;
  desktop: number;
  tablet: number;
  converted: number;
  withUtm: number;
  firstSeen: Date;
  lastSeen: Date;
  samplePaths: Map<string, number>;
}

interface ActionItem {
  id: string;
  tone: 'red' | 'amber';
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  cta?: { label: string; to?: string; onClick?: () => void; external?: string };
}

const ago = (d: Date | string) => formatDistanceToNowStrict(typeof d === 'string' ? new Date(d) : d, { addSuffix: true });

const GrowthOverview: React.FC<{
  range: RangeKey;
  basePath: string;
  isPlatformOwner: boolean;
  reloadToken: number;
  onLoadingChange?: (loading: boolean) => void;
}> = ({ range, basePath, isPlatformOwner, reloadToken, onLoadingChange }) => {
  const days = RANGES.find(r => r.key === range)!.days;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [adSpend, setAdSpend] = useState<AdSpendRow[] | null>(null); // null = unknown (RLS / error)
  const [emailLogCount, setEmailLogCount] = useState<number | null>(null);

  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selectedSource, setSelectedSource] = useState<SourceAgg | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignRow | null>(null);
  const [gapsOpen, setGapsOpen] = useState(false);

  const sinceIso = useMemo(() => startOfDay(subDays(new Date(), days - 1)).toISOString(), [days]);

  const load = useCallback(async () => {
    setLoading(true);
    onLoadingChange?.(true);
    setError(null);
    try {
      const monthIso = format(new Date(), 'yyyy-MM-01');
      let campaignErr: string | null = null;
      const [s, b, c, spend, logs] = await Promise.all([
        fetchSessions(sinceIso),
        fetchBookings(sinceIso),
        fetchCampaigns().catch((e: any) => { campaignErr = e?.message || String(e); return [] as CampaignRow[]; }),
        fetchAdSpend(monthIso).catch(() => null),
        fetchCampaignEmailLogCount(sinceIso).catch(() => null),
      ]);
      setSessions(s.rows);
      setTruncated(s.truncated);
      setBookings(b);
      setCampaigns(c);
      setCampaignsError(campaignErr);
      setAdSpend(spend);
      setEmailLogCount(logs);
    } catch (e: any) {
      console.error('[Growth] load failed:', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [sinceIso, onLoadingChange]);

  useEffect(() => { load(); }, [load, reloadToken]);

  // ── Derived ──────────────────────────────────────────────────────
  const channelOf = useMemo(() => {
    const m = new Map<string, Channel>();
    for (const s of sessions) m.set(s.id, classify(s.referrer, s.utm_source, s.utm_medium));
    return m;
  }, [sessions]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: sessions.length, social: 0, search: 0, direct: 0, referral: 0 };
    for (const s of sessions) c[channelOf.get(s.id)!]++;
    return c;
  }, [sessions, channelOf]);

  const sources = useMemo(() => {
    const m = new Map<string, SourceAgg>();
    for (const s of sessions) {
      const host = hostOf(s.referrer);
      const key = s.utm_source ? `utm:${s.utm_source.toLowerCase()}` : sourceLabel(host);
      const ch = channelOf.get(s.id)!;
      const at = new Date(s.created_at);
      let agg = m.get(key);
      if (!agg) {
        agg = { key: s.utm_source ? `utm_source=${s.utm_source}` : key, host, channel: ch, sessions: 0, mobile: 0, desktop: 0, tablet: 0, converted: 0, withUtm: 0, firstSeen: at, lastSeen: at, samplePaths: new Map() };
        m.set(key, agg);
      }
      agg.sessions++;
      if (s.device_type === 'mobile') agg.mobile++; else if (s.device_type === 'tablet') agg.tablet++; else if (s.device_type === 'desktop') agg.desktop++;
      if (s.converted) agg.converted++;
      if (s.utm_source) agg.withUtm++;
      if (at < agg.firstSeen) agg.firstSeen = at;
      if (at > agg.lastSeen) agg.lastSeen = at;
      if (s.referrer) {
        const p = s.referrer.length > 80 ? s.referrer.slice(0, 80) + '…' : s.referrer;
        agg.samplePaths.set(p, (agg.samplePaths.get(p) || 0) + 1);
      }
    }
    return Array.from(m.values()).sort((a, b) => b.sessions - a.sessions);
  }, [sessions, channelOf]);

  const filteredSources = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources.filter(s =>
      (filter === 'all' || s.channel === filter) &&
      (q === '' || s.key.toLowerCase().includes(q) || s.host.includes(q) || CHANNEL_META[s.channel].label.toLowerCase().includes(q)),
    );
  }, [sources, filter, search]);

  const outcomes = useMemo(() => {
    const online = bookings.filter(isOnlineBooking);
    const nonCancelled = bookings.filter(b => b.status !== 'cancelled');
    const converted = sessions.filter(s => !!s.converted).length;
    const onlineValue = online.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    return {
      total: bookings.length,
      online: online.length,
      onlineValue,
      staff: bookings.length - online.length,
      cancelled: bookings.length - nonCancelled.length,
      converted,
      bookingRate: sessions.length > 0 ? (online.length / sessions.length) * 100 : 0,
      withUtm: bookings.filter(b => !!b.utm_source).length,
    };
  }, [bookings, sessions]);

  const daily = useMemo(() => {
    const byDay = new Map<string, { day: string; label: string; social: number; search: number; direct: number; referral: number; bookings: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = localDayKey(d.toISOString());
      byDay.set(key, { day: key, label: format(d, days > 30 ? 'MMM d' : 'EEE d'), social: 0, search: 0, direct: 0, referral: 0, bookings: 0 });
    }
    for (const s of sessions) {
      const row = byDay.get(localDayKey(s.created_at));
      if (row) row[channelOf.get(s.id)!]++;
    }
    for (const b of bookings) {
      if (!isOnlineBooking(b)) continue;
      const row = byDay.get(localDayKey(b.created_at));
      if (row) row.bookings++;
    }
    return Array.from(byDay.values());
  }, [sessions, bookings, channelOf, days]);

  const actionItems = useMemo<ActionItem[]>(() => {
    if (loading || sessions.length === 0) return [];
    const items: ActionItem[] = [];
    const withUtm = sessions.filter(s => !!s.utm_source).length;
    if (withUtm === 0 && counts.social > 0) {
      items.push({
        id: 'utm', tone: 'red', icon: Tag,
        title: 'UTM tags are not being saved',
        detail: `0 of ${fmtInt(sessions.length)} sessions carry utm_source, although ${fmtInt(counts.social)} came from Instagram / Facebook. The three Meta ad sets can't be told apart yet — channel below is inferred from the referrer.`,
        cta: { label: 'Why', onClick: () => setGapsOpen(true) },
      });
    }
    if (outcomes.converted === 0 && outcomes.online > 0) {
      items.push({
        id: 'conv', tone: 'amber', icon: CalendarPlus,
        title: 'Conversions are not flagged on sessions',
        detail: `${fmtInt(outcomes.online)} online bookings were created in this window, but 0 sessions are marked converted — booking rate per channel is unknowable until the booking flow stamps the session.`,
        cta: { label: 'Why', onClick: () => setGapsOpen(true) },
      });
    }
    if (sessions.every(s => !s.city && !s.state)) {
      items.push({
        id: 'geo', tone: 'amber', icon: MapPin,
        title: 'City / state is never captured',
        detail: 'No session has a city or state, so Winter Park vs Southwest vs 32746 traffic cannot be compared from the site side. Use Meta\'s per-ad-set reporting for geography until the tracker records location.',
        cta: { label: 'Why', onClick: () => setGapsOpen(true) },
      });
    }
    if (adSpend !== null && adSpend.length === 0 && counts.social > 0) {
      items.push({
        id: 'spend', tone: 'amber', icon: DollarSign,
        title: `No ad spend logged for ${format(new Date(), 'MMMM')}`,
        detail: 'CAC on the Growth model page stays at $0 until this month\'s Meta spend is logged against the instagram / meta channel.',
        cta: isPlatformOwner ? { label: 'Log spend', to: `${basePath}/owner/hormozi` } : undefined,
      });
    }
    return items;
  }, [loading, sessions, counts.social, outcomes.converted, outcomes.online, adSpend, isPlatformOwner, basePath]);

  const toggleTile = (k: Channel) => setFilter(prev => (prev === k ? 'all' : k));
  const activeChip = CHIPS.find(c => c.key === filter)!;

  if (error) return <ErrorBanner title="Couldn't load traffic" message={error} onRetry={load} />;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-5">
        {/* Channel tiles — partition every session */}
        <section aria-labelledby="growth-traffic">
          <SectionTitle id="growth-traffic" hint={loading ? undefined : `${fmtInt(sessions.length)} sessions · last ${days} days${truncated ? ' · capped at 20,000' : ''}`}>
            Where visitors come from
          </SectionTitle>
          {loading && sessions.length === 0 ? <LoadingTiles n={4} /> : (
            <StatTiles tiles={TILES} counts={counts} active={filter === 'all' ? null : filter} onToggle={toggleTile} loading={loading} cols={4} />
          )}
        </section>

        {/* Outcomes strip */}
        <section aria-labelledby="growth-outcomes">
          <SectionTitle id="growth-outcomes" hint="appointments created in the same window">What they did</SectionTitle>
          {loading && sessions.length === 0 ? <LoadingTiles n={4} /> : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KpiTile label="Bookings created" value={fmtInt(outcomes.total)} hint={`${fmtInt(outcomes.staff)} by staff · ${fmtInt(outcomes.cancelled)} cancelled`} icon={CalendarPlus} />
              <KpiTile label="Online bookings" value={fmtInt(outcomes.online)} hint={`${fmtMoney(outcomes.onlineValue)} booked value`} icon={Globe} tone="brand" />
              <KpiTile label="Booking rate" value={fmtPct(outcomes.bookingRate, 2)} hint="online bookings ÷ sessions" icon={MousePointerClick} />
              <KpiTile
                label="Sessions converted"
                value={fmtInt(outcomes.converted)}
                hint={outcomes.converted === 0 && outcomes.online > 0 ? 'not flagged by the tracker' : 'flagged by the tracker'}
                tone={outcomes.converted === 0 && outcomes.online > 0 ? 'amber' : 'default'}
                icon={AlertTriangle}
              />
            </div>
          )}
        </section>

        {/* Needs action — attribution gaps */}
        {actionItems.length > 0 && (
          <section aria-labelledby="growth-action">
            <LaneHeader id="growth-action" title="Needs action" count={actionItems.length} tone="red" />
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y">
              {actionItems.map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className={cn('flex items-start gap-3 p-3', item.tone === 'red' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-amber-400')}>
                    <div className={cn('h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0', item.tone === 'red' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{item.detail}</p>
                    </div>
                    {item.cta && (
                      item.cta.to ? (
                        <Button size="sm" variant="outline" className="h-9 text-xs flex-shrink-0" asChild>
                          <Link to={item.cta.to}>{item.cta.label} <ChevronRight className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" /></Link>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-9 text-xs flex-shrink-0" onClick={item.cta.onClick}>
                          <Info className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> {item.cta.label}
                        </Button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Daily chart */}
        <section aria-labelledby="growth-chart">
          <SectionTitle id="growth-chart" hint="sessions stacked by channel · online bookings as a line">Daily traffic</SectionTitle>
          <Card className="shadow-sm">
            <CardContent className="p-3 sm:p-4">
              {loading && sessions.length === 0 ? (
                <div className="h-[260px] bg-gray-50 animate-pulse rounded" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={daily} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} width={30} />
                    <ChartTooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                      formatter={(value: number, name: string) => [fmtInt(value), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                    {CHANNEL_ORDER.map(c => (
                      <Bar key={c} yAxisId="left" dataKey={c} stackId="s" name={CHANNEL_META[c].label} fill={CHANNEL_META[c].color} radius={c === 'referral' ? [3, 3, 0, 0] : undefined} />
                    ))}
                    <Line yAxisId="right" type="monotone" dataKey="bookings" name="Online bookings" stroke="#111827" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Sources table */}
        <section aria-labelledby="growth-sources" className="space-y-2">
          <SectionTitle id="growth-sources">Traffic sources</SectionTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search source or channel…" aria-label="Search traffic sources" className="h-10 sm:h-9 pl-8 text-sm" />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <FilterChips chips={CHIPS} counts={counts} active={filter} onSelect={setFilter} label="Channel filter" />

          {loading && sessions.length === 0 ? <LoadingRows rows={4} label="Loading traffic sources" /> : filteredSources.length === 0 ? (
            <EmptyState
              icon={Globe}
              title={sessions.length === 0 ? 'No sessions in this window.' : search ? 'No sources match your search.' : `Nothing in "${activeChip.label}".`}
              hint={sessions.length === 0 ? 'Sessions appear here as visitors land on convelabs.com.' : activeChip.desc}
              action={sessions.length > 0 ? { label: 'Show all sources', onClick: () => { setFilter('all'); setSearch(''); } } : undefined}
            />
          ) : (
            <SourceRows rows={filteredSources} total={sessions.length} onOpen={setSelectedSource} onFilter={(c) => setFilter(c)} />
          )}
          <p className="text-[11px] text-gray-400">
            Showing {fmtInt(filteredSources.reduce((n, s) => n + s.sessions, 0))} of {fmtInt(sessions.length)} sessions across {filteredSources.length} source{filteredSources.length === 1 ? '' : 's'}.
          </p>
        </section>

        {/* Campaigns */}
        <section aria-labelledby="growth-campaigns" className="space-y-2">
          <SectionTitle id="growth-campaigns" hint={emailLogCount !== null ? `${fmtInt(emailLogCount)} campaign email${emailLogCount === 1 ? '' : 's'} logged in window` : undefined}>
            Email broadcasts
          </SectionTitle>
          {campaignsError ? (
            <ErrorBanner title="Couldn't load campaigns" message={campaignsError} onRetry={load} />
          ) : loading && campaigns.length === 0 ? <LoadingRows rows={3} label="Loading campaigns" /> : campaigns.length === 0 ? (
            <EmptyState icon={Mail} title="No broadcasts sent yet." hint="Campaigns you send from the Compose view show up here with opens and clicks." />
          ) : (
            <CampaignRows rows={campaigns} onOpen={setSelectedCampaign} />
          )}
        </section>

        {selectedSource && (
          <SourceDrawer src={selectedSource} total={sessions.length} onClose={() => setSelectedSource(null)} />
        )}
        {selectedCampaign && (
          <CampaignDrawer row={selectedCampaign} onClose={() => setSelectedCampaign(null)} />
        )}
        {gapsOpen && (
          <DetailDrawer eyebrow="Attribution" title="Why these numbers are incomplete" onClose={() => setGapsOpen(false)}>
            <div className="text-sm text-gray-700 space-y-3 leading-relaxed">
              <p>
                <strong>UTM tags.</strong> The site's tracker (<code className="text-xs bg-gray-100 px-1 rounded">src/utils/analytics.ts</code> → <code className="text-xs bg-gray-100 px-1 rounded">track-analytics</code>) sends the referrer but never the page URL, so <code className="text-xs bg-gray-100 px-1 rounded">utm_source / utm_medium / utm_campaign</code> on <code className="text-xs bg-gray-100 px-1 rounded">visitor_sessions</code> stay empty. The booking flow does capture UTMs into <code className="text-xs bg-gray-100 px-1 rounded">appointments</code>, but only when the visitor arrives with them in the same tab.
              </p>
              <p>
                <strong>Conversions.</strong> Nothing stamps <code className="text-xs bg-gray-100 px-1 rounded">visitor_sessions.converted</code> when a booking completes, so every channel shows 0 conversions even on days with online bookings.
              </p>
              <p>
                <strong>Location.</strong> The IP geo lookup in the tracker is not returning a city/state, so per-ad-set geography has to come from Meta Ads Manager.
              </p>
              <p className="text-xs text-gray-500">
                These are tracker / edge-function changes outside this screen. A draft server-side rollup for this page lives in <code className="bg-gray-100 px-1 rounded">supabase/migrations/DRAFT_20261002_growth_traffic_rollup.sql</code> (not applied).
              </p>
            </div>
          </DetailDrawer>
        )}
      </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Sources — table on ≥md, cards below.
// ──────────────────────────────────────────────────────────────────
const DeviceSplit: React.FC<{ s: SourceAgg }> = ({ s }) => {
  const pct = (n: number) => (s.sessions > 0 ? Math.round((n / s.sessions) * 100) : 0);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap">
      <span className="inline-flex items-center gap-0.5"><Smartphone className="h-3 w-3 text-gray-400" aria-hidden="true" />{pct(s.mobile)}%</span>
      <span className="inline-flex items-center gap-0.5"><Monitor className="h-3 w-3 text-gray-400" aria-hidden="true" />{pct(s.desktop)}%</span>
      {s.tablet > 0 && <span className="inline-flex items-center gap-0.5"><Tablet className="h-3 w-3 text-gray-400" aria-hidden="true" />{pct(s.tablet)}%</span>}
    </span>
  );
};

const SourceRows: React.FC<{
  rows: SourceAgg[];
  total: number;
  onOpen: (s: SourceAgg) => void;
  onFilter: (c: Channel) => void;
}> = ({ rows, total, onOpen, onFilter }) => (
  <>
    <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/80">
            <Th className="pl-4">Source</Th>
            <Th>Channel</Th>
            <Th right>Sessions</Th>
            <Th right>Share</Th>
            <Th>Devices</Th>
            <Th right>Converted</Th>
            <Th className="hidden xl:table-cell">Last seen</Th>
            <ThActions />
          </tr>
        </thead>
        <tbody>
          {rows.map(s => {
            const meta = CHANNEL_META[s.channel];
            const open = () => onOpen(s);
            return (
              <tr
                key={s.key}
                role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)}
                aria-label={`${s.key}, ${fmtInt(s.sessions)} sessions. Open details`}
                className="border-t border-gray-100 cursor-pointer hover:bg-gray-50/70 focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40"
              >
                <td className="py-2.5 pl-4 pr-3 align-top">
                  <span className="text-sm font-semibold text-gray-800">{s.key}</span>
                  {s.host && s.host !== s.key.toLowerCase() && <span className="block text-[11px] text-gray-500 truncate max-w-[220px]">{s.host}</span>}
                </td>
                <td className="py-2.5 px-3 align-top"><Pill className={meta.pill} dot={meta.dot}>{meta.short}</Pill></td>
                <td className="py-2.5 px-3 align-top text-right tabular-nums font-semibold text-gray-900">{fmtInt(s.sessions)}</td>
                <td className="py-2.5 px-3 align-top text-right tabular-nums text-gray-600">{total > 0 ? fmtPct((s.sessions / total) * 100) : '—'}</td>
                <td className="py-2.5 px-3 align-top"><DeviceSplit s={s} /></td>
                <td className={cn('py-2.5 px-3 align-top text-right tabular-nums', s.converted > 0 ? 'text-emerald-700 font-semibold' : 'text-gray-400')}>{fmtInt(s.converted)}</td>
                <td className="hidden xl:table-cell py-2.5 px-3 align-top text-xs text-gray-600 whitespace-nowrap">{ago(s.lastSeen)}</td>
                <TdActions>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label={`Show only ${meta.label}`} onClick={(e) => { e.stopPropagation(); onFilter(s.channel); }}>
                        <Filter className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Only {meta.label}</TooltipContent>
                  </Tooltip>
                  {s.host && !s.host.startsWith('android-app') && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label={`Open ${s.host}`} asChild onClick={(e) => e.stopPropagation()}>
                          <a href={`https://${s.host}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Open {s.host}</TooltipContent>
                    </Tooltip>
                  )}
                </TdActions>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="md:hidden space-y-2">
      {rows.map(s => {
        const meta = CHANNEL_META[s.channel];
        const open = () => onOpen(s);
        return (
          <Card key={s.key} role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)} aria-label={`${s.key}, ${fmtInt(s.sessions)} sessions. Open details`}
            className="shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 truncate">{s.key}</p>
                  <p className="text-[11px] text-gray-500">{fmtInt(s.sessions)} sessions · {total > 0 ? fmtPct((s.sessions / total) * 100) : '—'} · last {ago(s.lastSeen)}</p>
                </div>
                <Pill className={meta.pill} dot={meta.dot}>{meta.short}</Pill>
              </div>
              <div className="flex items-center justify-between gap-2">
                <DeviceSplit s={s} />
                <span className={cn('text-xs tabular-nums', s.converted > 0 ? 'text-emerald-700 font-semibold' : 'text-gray-400')}>{fmtInt(s.converted)} converted</span>
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                <Button size="sm" variant="outline" className="h-11 flex-1 justify-center text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); onFilter(s.channel); }}>
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" /> Only {meta.short}
                </Button>
                <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </>
);

const SourceDrawer: React.FC<{ src: SourceAgg; total: number; onClose: () => void }> = ({ src, total, onClose }) => {
  const meta = CHANNEL_META[src.channel];
  const paths = Array.from(src.samplePaths.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <DetailDrawer eyebrow="Traffic source" title={src.key} titleExtra={<Pill className={cn(meta.pill, 'bg-white/95')} dot={meta.dot}>{meta.label}</Pill>} onClose={onClose}
      footer={<>First seen {format(src.firstSeen, 'MMM d, h:mm a')} · last seen {format(src.lastSeen, 'MMM d, h:mm a')}</>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiTile label="Sessions" value={fmtInt(src.sessions)} hint={total > 0 ? `${fmtPct((src.sessions / total) * 100)} of window` : undefined} tone="brand" />
        <KpiTile label="Mobile" value={src.sessions > 0 ? fmtPct((src.mobile / src.sessions) * 100, 0) : '—'} hint={`${fmtInt(src.mobile)} sessions`} />
        <KpiTile label="Desktop" value={src.sessions > 0 ? fmtPct((src.desktop / src.sessions) * 100, 0) : '—'} hint={`${fmtInt(src.desktop)} sessions`} />
        <KpiTile label="Converted" value={fmtInt(src.converted)} hint={src.withUtm > 0 ? `${fmtInt(src.withUtm)} with UTM` : 'no UTM on any session'} tone={src.converted > 0 ? 'green' : 'default'} />
      </div>
      <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
        <Field label="Channel">{meta.label} <span className="text-gray-400">— {meta.desc}</span></Field>
        <Field label="Host">{src.host || '—'}</Field>
      </div>
      {paths.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">Most common referrer URLs</p>
          <ul className="space-y-1">
            {paths.map(([p, n]) => (
              <li key={p} className="flex items-center justify-between gap-3 text-xs border-b border-gray-100 last:border-0 py-1">
                <span className="font-mono text-[11px] text-gray-700 truncate">{p}</span>
                <span className="tabular-nums text-gray-500 flex-shrink-0">{fmtInt(n)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DetailDrawer>
  );
};

// ──────────────────────────────────────────────────────────────────
// Campaigns — campaign_sends via list_campaigns().
// ──────────────────────────────────────────────────────────────────
const CampaignRows: React.FC<{ rows: CampaignRow[]; onOpen: (c: CampaignRow) => void }> = ({ rows, onOpen }) => (
  <>
    <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/80">
            <Th className="pl-4">Campaign</Th>
            <Th right>Sent</Th>
            <Th>Status</Th>
            <Th>Last sent</Th>
            <ThActions />
          </tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const open = () => onOpen(c);
            return (
              <tr key={c.campaign_key} role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)} aria-label={`${campaignLabel(c.campaign_key)}. Open engagement`}
                className="border-t border-gray-100 cursor-pointer hover:bg-gray-50/70 focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40">
                <td className="py-2.5 pl-4 pr-3 align-top">
                  <span className="text-sm font-semibold text-gray-800">{campaignLabel(c.campaign_key)}</span>
                  <span className="block text-[11px] text-gray-500 font-mono">{c.campaign_key}</span>
                </td>
                <td className="py-2.5 px-3 align-top text-right tabular-nums font-semibold text-gray-900">{fmtInt(c.sent)}</td>
                <td className="py-2.5 px-3 align-top"><Pill className="bg-gray-100 text-gray-700 border-gray-200" dot="bg-gray-400">Sent</Pill></td>
                <td className="py-2.5 px-3 align-top text-xs text-gray-600 whitespace-nowrap">
                  {c.last_sent_at ? <>{format(new Date(c.last_sent_at), 'MMM d, yyyy')}<span className="block text-[11px] text-gray-400">{ago(c.last_sent_at)}</span></> : '—'}
                </td>
                <TdActions>
                  <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); open(); }}>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Engagement
                  </Button>
                </TdActions>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className="md:hidden space-y-2">
      {rows.map(c => {
        const open = () => onOpen(c);
        return (
          <Card key={c.campaign_key} role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)} className="shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 truncate">{campaignLabel(c.campaign_key)}</p>
                  <p className="text-[11px] text-gray-500">{fmtInt(c.sent)} sent · {c.last_sent_at ? ago(c.last_sent_at) : '—'}</p>
                </div>
                <Pill className="bg-gray-100 text-gray-700 border-gray-200" dot="bg-gray-400">Sent</Pill>
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                <Button size="sm" variant="outline" className="h-11 flex-1 justify-center text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); open(); }}>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Engagement
                </Button>
                <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </>
);

const CampaignDrawer: React.FC<{ row: CampaignRow; onClose: () => void }> = ({ row, onClose }) => {
  const [stats, setStats] = useState<CampaignEngagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCampaignEngagement(row.campaign_key)
      .then(s => { if (alive) setStats(s); })
      .catch(e => { if (alive) setErr(e?.message || String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [row.campaign_key]);

  return (
    <DetailDrawer eyebrow="Email broadcast" title={campaignLabel(row.campaign_key)} onClose={onClose}
      titleExtra={<span className="text-xs font-mono opacity-90">{row.campaign_key}</span>}
      footer={stats?.first_sent_at ? <>First send {format(new Date(stats.first_sent_at), 'MMM d, yyyy h:mm a')} · last send {stats.last_sent_at ? format(new Date(stats.last_sent_at), 'MMM d, yyyy h:mm a') : '—'}</> : undefined}>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading engagement…</div>
      ) : err ? (
        <ErrorBanner title="Couldn't load engagement" message={err} />
      ) : !stats ? (
        <p className="text-sm text-gray-500">No engagement data for this campaign.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiTile label="Sent" value={fmtInt(stats.sent)} icon={Mail} tone="brand" />
            <KpiTile label="Opened" value={fmtInt(stats.opened)} hint={fmtPct(stats.open_rate_pct)} icon={Eye} tone={stats.opened > 0 ? 'green' : 'default'} />
            <KpiTile label="Clicked" value={fmtInt(stats.clicked)} hint={fmtPct(stats.click_rate_pct)} icon={MousePointerClick} tone={stats.clicked > 0 ? 'green' : 'default'} />
            <KpiTile label="Bounced" value={fmtInt(stats.bounced)} hint={fmtPct(stats.bounce_rate_pct)} icon={AlertTriangle} tone={stats.bounced > 0 ? 'amber' : 'default'} />
          </div>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <Field label="Failed">{fmtInt(stats.failed)}</Field>
            <Field label="Complaints">{fmtInt(stats.complained)}</Field>
          </div>
          {stats.sent > 0 && stats.opened === 0 && stats.clicked === 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              No open or click events have been recorded for this campaign, so engagement reads 0 even though {fmtInt(stats.sent)} emails were delivered. Check that the Mailgun open/click webhook is writing to <code className="bg-white px-1 rounded">campaign_sends</code>.
            </p>
          )}
        </>
      )}
    </DetailDrawer>
  );
};

export default GrowthOverview;
