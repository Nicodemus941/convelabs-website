/**
 * AbandonedBookings — Growth › Abandoned bookings (super_admin / admin).
 *
 * One list in the GrowthOverview language: tiles that partition every draft
 * by outcome, chips, search, a table with a sticky Actions column, mobile
 * cards, and a detail drawer. Reads abandoned_bookings directly (RLS: admin
 * SELECT). Actions:
 *   Call / Text        tel: / sms: links
 *   Copy resume link   abandoned-booking-admin → resume_link (HMAC minted server-side)
 *   Stop sequence      abandoned-booking-admin → stop
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Search, X, Phone, MessageSquare, Link2, Ban, ChevronRight, CalendarClock, CheckCircle2, Clock3, Inbox, ShieldCheck,
} from 'lucide-react';
import {
  StatTiles, FilterChips, Pill, LoadingRows, LoadingTiles, EmptyState, ErrorBanner, Th, ThActions, TdActions,
  rowKeyHandler, Field, DetailDrawer, KpiTile, fmtInt, type TileDef, type ChipDef,
} from '../owner/sectionUi';

type Outcome = 'open' | 'recovered' | 'stopped' | 'expired';
type FilterKey = 'all' | Outcome;

interface DraftRow {
  id: string;
  created_at: string;
  updated_at: string | null;
  last_activity_at: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  visit_type: string | null;
  service_type: string | null;
  selected_date: string | null;
  selected_time: string | null;
  fasting: boolean | null;
  visit_reason: string | null;
  lab_order_status: string | null;
  step_key: string | null;
  source: string | null;
  landing_page: string | null;
  utm: Record<string, string> | null;
  sms_consent: boolean;
  sms_consent_at: string | null;
  touches_sent: number;
  touch_log: Array<{ touch: number; at: string; sms: string | null; email: string | null; worry?: string }> | null;
  next_touch_at: string | null;
  last_touch_at: string | null;
  recovered: boolean | null;
  recovered_at: string | null;
  recovered_appointment_id: string | null;
  stopped_at: string | null;
  stop_reason: string | null;
  expires_at: string;
  resume_opened_at: string | null;
  resume_open_count: number;
}

const outcomeOf = (r: DraftRow): Outcome => {
  if (r.recovered || r.recovered_at) return 'recovered';
  if (r.stop_reason === 'expired' || (!r.stopped_at && new Date(r.expires_at).getTime() < Date.now())) return 'expired';
  if (r.stopped_at) return 'stopped';
  return 'open';
};

const OUTCOME_META: Record<Outcome, { label: string; short: string; pill: string; dot: string; tile: string; desc: string }> = {
  open:      { label: 'Open',      short: 'Open',      pill: 'bg-amber-50 text-amber-800 border-amber-200',     dot: 'bg-amber-500',   tile: 'bg-amber-50 border-amber-300 text-amber-900',     desc: 'Sequence still running — not booked yet' },
  recovered: { label: 'Recovered', short: 'Booked',    pill: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', tile: 'bg-emerald-50 border-emerald-300 text-emerald-900', desc: 'Booked after the draft was captured' },
  stopped:   { label: 'Stopped',   short: 'Stopped',   pill: 'bg-gray-100 text-gray-700 border-gray-200',       dot: 'bg-gray-400',    tile: 'bg-gray-100 border-gray-300 text-gray-900',       desc: 'Opted out, already had a visit, finished the sequence, or stopped by staff' },
  expired:   { label: 'Expired',   short: 'Expired',   pill: 'bg-gray-50 text-gray-500 border-gray-200',        dot: 'bg-gray-300',    tile: 'bg-gray-50 border-gray-300 text-gray-700',        desc: 'Older than 7 days without a booking' },
};
const OUTCOMES: Outcome[] = ['open', 'recovered', 'stopped', 'expired'];

const STEP_LABEL: Record<string, string> = {
  visit_type: 'Visit type', service: 'Service', date_time: 'Date & time', patient_info: 'Patient info',
  address: 'Address', lab_order: 'Lab order', checkout: 'Checkout',
};
const STOP_LABEL: Record<string, string> = {
  booked: 'Booked', sms_opt_out: 'Replied STOP', expired: 'Expired', existing_appointment: 'Already had a visit',
  manual: 'Stopped by staff', sequence_complete: 'All 3 touches sent', undeliverable: 'Undeliverable',
};

const TILES: Array<TileDef<Outcome>> = OUTCOMES.map(o => ({ key: o, label: OUTCOME_META[o].label, desc: OUTCOME_META[o].desc, activeClass: OUTCOME_META[o].tile, alert: o === 'open' }));
const CHIPS: Array<ChipDef<FilterKey>> = [
  { key: 'all', label: 'All drafts', desc: 'Every draft in the window' },
  ...OUTCOMES.map(o => ({ key: o as FilterKey, label: OUTCOME_META[o].label, desc: OUTCOME_META[o].desc, dot: OUTCOME_META[o].dot })),
];

const ago = (d: string | null | undefined) => (d ? formatDistanceToNowStrict(new Date(d), { addSuffix: true }) : '—');
const fullName = (r: DraftRow) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || r.phone || 'Unknown';
const whenLabel = (r: DraftRow) => {
  if (!r.selected_date || !/^\d{4}-\d{2}-\d{2}$/.test(r.selected_date)) return '—';
  const day = format(new Date(`${r.selected_date}T12:00:00`), 'EEE, MMM d');
  return r.selected_time && /\d/.test(r.selected_time) ? `${day} · ${r.selected_time}` : day;
};
const telHref = (p: string | null) => (p ? `tel:${p.replace(/[^\d+]/g, '')}` : undefined);
const smsHref = (p: string | null) => (p ? `sms:${p.replace(/[^\d+]/g, '')}` : undefined);

async function adminAction(action: 'resume_link' | 'stop', id: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke('abandoned-booking-admin', { body: { action, id } });
  if (error) throw new Error(error.message || 'request failed');
  if (data?.error) throw new Error(data.error);
  return data;
}

const AbandonedBookings: React.FC<{ reloadToken: number; onLoadingChange?: (v: boolean) => void }> = ({ reloadToken, onLoadingChange }) => {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DraftRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [killSwitch, setKillSwitch] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true); onLoadingChange?.(true); setError(null);
    try {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString();
      const [{ data, error: qErr }, { data: setting }] = await Promise.all([
        supabase.from('abandoned_bookings' as any).select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(500),
        (supabase.from('system_settings' as any) as any).select('value').eq('key', 'abandoned_recovery_enabled').maybeSingle(),
      ]);
      if (qErr) throw qErr;
      setRows(((data || []) as unknown) as DraftRow[]);
      const v = (setting as any)?.value;
      setKillSwitch(v === true || v === 'true');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false); onLoadingChange?.(false);
    }
  }, [onLoadingChange]);

  useEffect(() => { load(); }, [load, reloadToken]);

  const outcomes = useMemo(() => new Map(rows.map(r => [r.id, outcomeOf(r)])), [rows]);
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: rows.length, open: 0, recovered: 0, stopped: 0, expired: 0 };
    for (const r of rows) c[outcomes.get(r.id)!]++;
    return c;
  }, [rows, outcomes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      (filter === 'all' || outcomes.get(r.id) === filter) &&
      (q === '' || fullName(r).toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q) || (r.phone || '').includes(q) || (r.step_key || '').includes(q)),
    );
  }, [rows, filter, search, outcomes]);

  const withTouch = rows.filter(r => (r.touches_sent || 0) > 0).length;
  const recoveredAfterTouch = rows.filter(r => outcomeOf(r) === 'recovered' && (r.touches_sent || 0) > 0).length;

  const copyLink = async (r: DraftRow) => {
    setBusyId(r.id);
    try {
      const res = await adminAction('resume_link', r.id);
      await navigator.clipboard.writeText(res.url);
      toast.success('Resume link copied');
    } catch (e: any) {
      toast.error(`Couldn't get link: ${e?.message || e}`);
    } finally { setBusyId(null); }
  };

  const stop = async (r: DraftRow) => {
    if (!window.confirm(`Stop the recovery sequence for ${fullName(r)}?`)) return;
    setBusyId(r.id);
    try {
      await adminAction('stop', r.id);
      toast.success('Sequence stopped');
      await load();
      setSelected(null);
    } catch (e: any) {
      toast.error(`Couldn't stop: ${e?.message || e}`);
    } finally { setBusyId(null); }
  };

  if (error) return <ErrorBanner title="Couldn't load abandoned bookings" message={error} onRetry={load} />;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-5">
        {killSwitch === false && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs px-3 py-2 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>Drafts are being captured, but the recovery texts and emails are <strong>off</strong> (<code className="bg-white px-1 rounded">system_settings.abandoned_recovery_enabled</code> is false). Nothing is sent until the owner flips it.</span>
          </div>
        )}

        <section aria-labelledby="ab-tiles">
          {loading && rows.length === 0 ? <LoadingTiles n={4} /> : (
            <StatTiles tiles={TILES} counts={counts} active={filter === 'all' ? null : filter} onToggle={(k) => setFilter(prev => (prev === k ? 'all' : k))} loading={loading} cols={4} />
          )}
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KpiTile label="Drafts (90d)" value={fmtInt(rows.length)} icon={Inbox} loading={loading} />
          <KpiTile label="SMS consent" value={fmtInt(rows.filter(r => r.sms_consent).length)} hint="ticked the text-me box" icon={MessageSquare} loading={loading} />
          <KpiTile label="Touched" value={fmtInt(withTouch)} hint="at least one nudge sent" icon={CalendarClock} loading={loading} />
          <KpiTile label="Booked after nudge" value={fmtInt(recoveredAfterTouch)} hint={withTouch > 0 ? `${Math.round((recoveredAfterTouch / withTouch) * 100)}% of touched` : 'no touches yet'} icon={CheckCircle2} tone={recoveredAfterTouch > 0 ? 'green' : 'default'} loading={loading} />
        </section>

        <section className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone or step…" aria-label="Search drafts" className="h-10 sm:h-9 pl-8 text-sm" />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
            )}
          </div>
          <FilterChips chips={CHIPS} counts={counts} active={filter} onSelect={setFilter} label="Outcome filter" />

          {loading && rows.length === 0 ? <LoadingRows rows={5} label="Loading drafts" /> : filtered.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={rows.length === 0 ? 'No abandoned bookings captured yet.' : search ? 'No drafts match your search.' : `Nothing in "${CHIPS.find(c => c.key === filter)?.label}".`}
              hint={rows.length === 0 ? 'A draft appears the moment a patient types a valid email or phone on the Patient Info step and does not finish.' : undefined}
              action={rows.length > 0 ? { label: 'Show all drafts', onClick: () => { setFilter('all'); setSearch(''); } } : undefined}
            />
          ) : (
            <Rows rows={filtered} outcomes={outcomes} busyId={busyId} onOpen={setSelected} onCopy={copyLink} onStop={stop} />
          )}
          <p className="text-[11px] text-gray-400">Showing {fmtInt(filtered.length)} of {fmtInt(rows.length)} drafts · last 90 days.</p>
        </section>

        {selected && (
          <Drawer row={selected} outcome={outcomes.get(selected.id)!} busy={busyId === selected.id} onClose={() => setSelected(null)} onCopy={copyLink} onStop={stop} />
        )}
      </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
const Touches: React.FC<{ r: DraftRow }> = ({ r }) => (
  <span className="inline-flex items-center gap-1" title={r.last_touch_at ? `last ${ago(r.last_touch_at)}` : 'none sent'}>
    {[1, 2, 3].map(n => (
      <span key={n} className={cn('w-2 h-2 rounded-full', n <= (r.touches_sent || 0) ? 'bg-[#B91C1C]' : 'bg-gray-200')} aria-hidden="true" />
    ))}
    <span className="text-xs text-gray-600 ml-1 tabular-nums">{r.touches_sent || 0}/3</span>
  </span>
);

const StatusPill: React.FC<{ r: DraftRow; outcome: Outcome }> = ({ r, outcome }) => {
  const meta = OUTCOME_META[outcome];
  const detail = outcome === 'stopped' ? STOP_LABEL[r.stop_reason || ''] || r.stop_reason : outcome === 'open' && r.next_touch_at ? `next ${ago(r.next_touch_at)}` : null;
  return <Pill className={meta.pill} dot={meta.dot}>{meta.short}{detail ? <span className="font-normal opacity-80"> · {detail}</span> : null}</Pill>;
};

const Actions: React.FC<{ r: DraftRow; busy: boolean; onCopy: (r: DraftRow) => void; onStop: (r: DraftRow) => void; mobile?: boolean }> = ({ r, busy, onCopy, onStop, mobile }) => {
  const open = outcomeOf(r) === 'open';
  const btn = mobile ? 'h-11 flex-1 justify-center text-xs gap-1.5' : 'h-9 w-9 p-0';
  const Wrap: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => mobile ? <>{children}</> : (
    <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
  );
  return (
    <>
      <Wrap label="Call">
        <Button size="sm" variant={mobile ? 'outline' : 'ghost'} className={btn} asChild disabled={!r.phone} onClick={e => e.stopPropagation()} aria-label={`Call ${fullName(r)}`}>
          <a href={telHref(r.phone)}><Phone className="h-4 w-4" aria-hidden="true" />{mobile && ' Call'}</a>
        </Button>
      </Wrap>
      <Wrap label="Text">
        <Button size="sm" variant={mobile ? 'outline' : 'ghost'} className={btn} asChild disabled={!r.phone} onClick={e => e.stopPropagation()} aria-label={`Text ${fullName(r)}`}>
          <a href={smsHref(r.phone)}><MessageSquare className="h-4 w-4" aria-hidden="true" />{mobile && ' Text'}</a>
        </Button>
      </Wrap>
      <Wrap label="Copy resume link">
        <Button size="sm" variant={mobile ? 'outline' : 'ghost'} className={btn} disabled={busy || outcomeOf(r) === 'recovered'} onClick={e => { e.stopPropagation(); onCopy(r); }} aria-label="Copy resume link">
          <Link2 className="h-4 w-4" aria-hidden="true" />{mobile && ' Link'}
        </Button>
      </Wrap>
      {open && (
        <Wrap label="Stop sequence">
          <Button size="sm" variant={mobile ? 'outline' : 'ghost'} className={cn(btn, 'text-gray-500 hover:text-red-700')} disabled={busy} onClick={e => { e.stopPropagation(); onStop(r); }} aria-label="Stop sequence">
            <Ban className="h-4 w-4" aria-hidden="true" />{mobile && ' Stop'}
          </Button>
        </Wrap>
      )}
    </>
  );
};

const Rows: React.FC<{
  rows: DraftRow[]; outcomes: Map<string, Outcome>; busyId: string | null;
  onOpen: (r: DraftRow) => void; onCopy: (r: DraftRow) => void; onStop: (r: DraftRow) => void;
}> = ({ rows, outcomes, busyId, onOpen, onCopy, onStop }) => (
  <>
    <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/80">
            <Th className="pl-4">Who</Th>
            <Th>Step</Th>
            <Th>Wanted</Th>
            <Th>Captured</Th>
            <Th>Touches</Th>
            <Th>Status</Th>
            <ThActions />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const open = () => onOpen(r);
            return (
              <tr key={r.id} role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)} aria-label={`${fullName(r)}. Open details`}
                className="border-t border-gray-100 cursor-pointer hover:bg-gray-50/70 focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40">
                <td className="py-2.5 pl-4 pr-3 align-top">
                  <span className="text-sm font-semibold text-gray-800">{fullName(r)}</span>
                  <span className="block text-[11px] text-gray-500 truncate max-w-[240px]">{[r.phone, r.email].filter(Boolean).join(' · ') || '—'}</span>
                  {r.sms_consent && <span className="block text-[10px] text-emerald-700 font-medium">SMS consent</span>}
                </td>
                <td className="py-2.5 px-3 align-top text-xs text-gray-700">{STEP_LABEL[r.step_key || ''] || r.step_key || '—'}</td>
                <td className="py-2.5 px-3 align-top text-xs text-gray-700 whitespace-nowrap">
                  {whenLabel(r)}
                  <span className="block text-[11px] text-gray-500">{r.visit_type || r.service_type || '—'}{r.fasting ? ' · fasting' : ''}</span>
                </td>
                <td className="py-2.5 px-3 align-top text-xs text-gray-600 whitespace-nowrap">{ago(r.created_at)}<span className="block text-[11px] text-gray-400">{r.source || 'direct'}</span></td>
                <td className="py-2.5 px-3 align-top"><Touches r={r} /></td>
                <td className="py-2.5 px-3 align-top"><StatusPill r={r} outcome={outcomes.get(r.id)!} /></td>
                <TdActions><Actions r={r} busy={busyId === r.id} onCopy={onCopy} onStop={onStop} /></TdActions>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="md:hidden space-y-2">
      {rows.map(r => {
        const open = () => onOpen(r);
        return (
          <Card key={r.id} role="button" tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)} aria-label={`${fullName(r)}. Open details`}
            className="shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 truncate">{fullName(r)}</p>
                  <p className="text-[11px] text-gray-500 truncate">{[r.phone, r.email].filter(Boolean).join(' · ')}</p>
                  <p className="text-[11px] text-gray-500">{STEP_LABEL[r.step_key || ''] || r.step_key || '—'} · {whenLabel(r)} · {ago(r.created_at)}</p>
                </div>
                <StatusPill r={r} outcome={outcomes.get(r.id)!} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Touches r={r} />
                <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                <Actions r={r} busy={busyId === r.id} onCopy={onCopy} onStop={onStop} mobile />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </>
);

const Drawer: React.FC<{ row: DraftRow; outcome: Outcome; busy: boolean; onClose: () => void; onCopy: (r: DraftRow) => void; onStop: (r: DraftRow) => void }> = ({ row: r, outcome, busy, onClose, onCopy, onStop }) => {
  const meta = OUTCOME_META[outcome];
  const log = Array.isArray(r.touch_log) ? r.touch_log : [];
  return (
    <DetailDrawer eyebrow="Abandoned booking" title={fullName(r)} titleExtra={<Pill className={cn(meta.pill, 'bg-white/95')} dot={meta.dot}>{meta.label}</Pill>} onClose={onClose}
      footer={<>Captured {format(new Date(r.created_at), 'MMM d, h:mm a')} · last activity {ago(r.last_activity_at || r.updated_at || r.created_at)} · link expires {ago(r.expires_at)}</>}>
      <div className="flex sm:flex-wrap gap-2 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0">
        <Actions r={r} busy={busy} onCopy={onCopy} onStop={onStop} mobile />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiTile label="Step reached" value={<span className="text-base">{STEP_LABEL[r.step_key || ''] || r.step_key || '—'}</span>} />
        <KpiTile label="Touches" value={`${r.touches_sent || 0}/3`} hint={r.next_touch_at && outcome === 'open' ? `next ${ago(r.next_touch_at)}` : r.last_touch_at ? `last ${ago(r.last_touch_at)}` : 'none yet'} />
        <KpiTile label="Link opened" value={fmtInt(r.resume_open_count || 0)} hint={r.resume_opened_at ? ago(r.resume_opened_at) : 'never'} icon={Clock3} />
        <KpiTile label="SMS consent" value={r.sms_consent ? 'Yes' : 'No'} hint={r.sms_consent_at ? format(new Date(r.sms_consent_at), 'MMM d, h:mm a') : 'email only'} tone={r.sms_consent ? 'green' : 'default'} />
      </div>

      <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
        <Field label="Phone">{r.phone || '—'}</Field>
        <Field label="Email">{r.email || '—'}</Field>
        <Field label="Visit">{r.visit_type || r.service_type || '—'}{r.fasting ? ' · fasting' : ''}</Field>
        <Field label="Wanted">{whenLabel(r)}</Field>
        <Field label="Lab order">{r.lab_order_status || 'unknown'}</Field>
        <Field label="Came for">{r.visit_reason || '—'}</Field>
        <Field label="Source">{r.source || 'direct'}{r.landing_page ? <span className="text-gray-400"> · {r.landing_page}</span> : null}</Field>
        {r.utm && Object.keys(r.utm).length > 0 && <Field label="UTM">{Object.entries(r.utm).map(([k, v]) => `${k.replace('utm_', '')}=${v}`).join(' · ')}</Field>}
        {outcome === 'recovered' && <Field label="Booked">{ago(r.recovered_at)}{r.recovered_appointment_id ? <span className="text-gray-400 font-mono"> · {r.recovered_appointment_id.slice(0, 8)}</span> : null}</Field>}
        {outcome === 'stopped' && <Field label="Stopped">{STOP_LABEL[r.stop_reason || ''] || r.stop_reason} · {ago(r.stopped_at)}</Field>}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">Touches sent</p>
        {log.length === 0 ? <p className="text-xs text-gray-500">Nothing sent yet.</p> : (
          <ul className="space-y-1">
            {log.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-xs border-b border-gray-100 last:border-0 py-1">
                <span className="text-gray-700">Touch {t.touch}{t.worry ? <span className="text-gray-400"> · {t.worry.replace(/_/g, ' ')}</span> : null}</span>
                <span className="text-gray-500 whitespace-nowrap">{t.sms ? `SMS ${t.sms}` : ''}{t.sms && t.email ? ' · ' : ''}{t.email ? `email ${t.email}` : ''} · {format(new Date(t.at), 'MMM d, h:mm a')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DetailDrawer>
  );
};

export default AbandonedBookings;
