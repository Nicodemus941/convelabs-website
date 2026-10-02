/**
 * ProviderAcquisitionTab — every referred-in provider (patient_referring_providers)
 * and where they sit in the Hormozi drip, in the shared admin list language
 * (see adminListKit + LabOrdersTab for the reference).
 *
 * Rendered via Dashboard.tsx SECTION_SCREENS["partners/acquisition"]
 * (nav: super_admin only). The sequence scheduler cron drives automatic
 * sends; this screen covers the human-in-the-loop moments: email research,
 * first-contact call, manual fast-forward, pause, decline, and the
 * "log a touch" ledger the owner reads to see the work being done.
 *
 * Every row maps to exactly ONE bucket (deriveBucket), so the stat tiles,
 * the filter chips and the list always agree:
 *
 *   needs_email   → no practice email yet — research / call the front desk
 *   callback_due  → a logged follow-up is due today or overdue
 *   stale         → open, never touched by a human or no touch in 48h
 *   in_sequence   → drip running, touched recently
 *   paused        → drip paused by admin
 *   engaged       → viewed / activated the portal
 *   converted     → signed partner
 *   closed        → declined or unsubscribed
 *
 * "Needs action" = needs_email + callback_due + stale (the old "today's queue").
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, isValid } from 'date-fns';
import {
  Loader2, Search, Users, Phone, ExternalLink, Send, PauseCircle, PlayCircle, XCircle, CheckCircle2, Sparkles, Copy,
  Building2, Eye, Activity, ClipboardList, Clock, MoreHorizontal, ChevronRight, Mail, AlertTriangle, Handshake,
} from 'lucide-react';
import {
  ago, copyText, rowKeyHandler, plural, TH, TH_STICKY, TD_STICKY, ROW_FOCUS, CARD_FOCUS,
  PageHeader, RefreshButton, StatTiles, FilterChips, SearchBox, LaneHeader, LoadingRows,
  EmptyState, ErrorCard, ListFooter, Pill, Field, SectionLabel, DetailDrawer, QuickActions, Notice,
  type TileDef, type ChipDef,
} from './adminListKit';

// Untyped table access — provider_outreach_log + several columns aren't in
// the generated Database type.
const db = supabase as any;

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────
type Status =
  | 'pending_research' | 'researching' | 'email_found' | 'contacted'
  | 'portal_viewed' | 'portal_activated' | 'converted' | 'unsubscribed' | 'declined';

export interface ReferringProvider {
  id: string;
  provider_name: string | null;
  practice_name: string | null;
  practice_phone: string | null;
  practice_email: string | null;
  practice_city: string | null;
  patient_name: string | null;
  patient_email: string | null;
  appointment_id: string | null;
  patient_consent: boolean | null;
  status: Status;
  sequence_step: number | null;
  next_send_at: string | null;
  paused_at: string | null;
  discovered_at: string;
  first_contact_at: string | null;
  portal_activated_at: string | null;
  converted_at: string | null;
  claim_token: string | null;
  matched_org_id: string | null;
  // Outreach assignment + audit (2026-05-13 Hormozi outreach ledger)
  assigned_to: string | null;
  last_outreach_at: string | null;
  last_outreach_by: string | null;
  last_outreach_action: string | null;
  next_followup_at: string | null;
}

interface OutreachLogEntry {
  id: string;
  referring_provider_id: string;
  acted_by: string | null;
  acted_by_name: string | null;
  action_type: 'call' | 'voicemail' | 'email_manual' | 'fax' | 'text' | 'visit_in_person' | 'note' | 'research';
  outcome: string | null;
  notes: string | null;
  follow_up_at: string | null;
  created_at: string;
}

interface WeekStat {
  acted_by: string;
  acted_by_name: string | null;
  total_touches: number;
  calls: number;
  voicemails: number;
  emails_manual: number;
  texts: number;
  research_notes: number;
  providers_reached: number;
}

const ACTION_LABEL: Record<OutreachLogEntry['action_type'], string> = {
  call: 'Call', voicemail: 'Voicemail', email_manual: 'Manual email', fax: 'Fax',
  text: 'Text', visit_in_person: 'In person', note: 'Note', research: 'Research',
};

const OUTCOME_LABEL: Record<string, string> = {
  reached: 'Reached', voicemail_left: 'Left voicemail', no_answer: 'No answer', busy: 'Busy',
  wrong_number: 'Wrong number', gave_email: 'Gave email', gave_callback: 'Callback scheduled',
  declined: 'Declined', unsubscribed: 'Unsubscribed', no_decision: 'No decision yet', other: 'Other',
};

const STATUS_LABEL: Record<Status, string> = {
  pending_research: 'Needs research', researching: 'Researching', email_found: 'Email found',
  contacted: 'In sequence', portal_viewed: 'Portal viewed', portal_activated: 'Portal activated',
  converted: 'Converted', unsubscribed: 'Unsubscribed', declined: 'Declined',
};

const CLOSED_STATUSES = new Set<Status>(['declined', 'unsubscribed']);
const ENGAGED_STATUSES = new Set<Status>(['portal_viewed', 'portal_activated']);
const DAY = 24 * 3600 * 1000;
const STALE_AFTER = 2 * DAY;

export const practiceLabel = (r: ReferringProvider) => r.practice_name || r.provider_name || 'Unnamed practice';
const fmt = (ts: string | null | undefined, f = 'MMM d, h:mm a') => { if (!ts) return '—'; const d = new Date(ts); return isValid(d) ? format(d, f) : '—'; };

// ──────────────────────────────────────────────────────────────────
// Buckets — ONE per row.
// ──────────────────────────────────────────────────────────────────
export type Bucket = 'needs_email' | 'callback_due' | 'stale' | 'in_sequence' | 'paused' | 'engaged' | 'converted' | 'closed';

export function deriveBucket(r: ReferringProvider, now = Date.now()): Bucket {
  if (r.status === 'converted') return 'converted';
  if (CLOSED_STATUSES.has(r.status)) return 'closed';
  if (ENGAGED_STATUSES.has(r.status)) return 'engaged';
  if (r.paused_at) return 'paused';
  if (!r.practice_email) return 'needs_email';
  if (r.next_followup_at && new Date(r.next_followup_at).getTime() <= now + DAY) return 'callback_due';
  const lastTouch = r.last_outreach_at ? new Date(r.last_outreach_at).getTime() : 0;
  if (now - lastTouch > STALE_AFTER) return 'stale';
  return 'in_sequence';
}

const NEEDS_ACTION: ReadonlySet<Bucket> = new Set<Bucket>(['needs_email', 'callback_due', 'stale']);

interface BucketMeta { label: string; short: string; desc: string; pill: string; tile: string; dot: string }

const BUCKET_META: Record<Bucket, BucketMeta> = {
  needs_email: {
    label: 'Needs email', short: 'Needs email', desc: 'No practice email yet — research or call the front desk',
    pill: 'bg-amber-100 text-amber-800 border-amber-200', tile: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500',
  },
  callback_due: {
    label: 'Callback due', short: 'Callback', desc: 'A logged follow-up is due today or overdue',
    pill: 'bg-red-100 text-red-800 border-red-200', tile: 'border-red-300 bg-red-50 text-red-800', dot: 'bg-red-500',
  },
  stale: {
    label: 'No touch 48h', short: 'Stale', desc: 'Open lead with no human touch in the last 48 hours',
    pill: 'bg-orange-100 text-orange-800 border-orange-200', tile: 'border-orange-300 bg-orange-50 text-orange-800', dot: 'bg-orange-500',
  },
  in_sequence: {
    label: 'In sequence', short: 'In sequence', desc: 'Drip running and touched within 48h',
    pill: 'bg-indigo-100 text-indigo-800 border-indigo-200', tile: 'border-indigo-300 bg-indigo-50 text-indigo-800', dot: 'bg-indigo-500',
  },
  paused: {
    label: 'Paused', short: 'Paused', desc: 'Drip paused by admin — no automatic sends',
    pill: 'bg-gray-100 text-gray-700 border-gray-200', tile: 'border-gray-300 bg-gray-100 text-gray-800', dot: 'bg-gray-400',
  },
  engaged: {
    label: 'Engaged', short: 'Engaged', desc: 'Viewed or activated the provider portal',
    pill: 'bg-purple-100 text-purple-800 border-purple-200', tile: 'border-purple-300 bg-purple-50 text-purple-800', dot: 'bg-purple-500',
  },
  converted: {
    label: 'Converted', short: 'Converted', desc: 'Signed partner',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', tile: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500',
  },
  closed: {
    label: 'Closed', short: 'Closed', desc: 'Declined or unsubscribed — no further outreach',
    pill: 'bg-white text-gray-500 border-gray-300', tile: 'border-gray-300 bg-gray-50 text-gray-700', dot: 'bg-gray-300',
  },
};

type FilterKey = 'all' | 'needs_action' | Bucket;

const FILTERS: Array<ChipDef<FilterKey> & { match: (b: Bucket) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Every referred-in provider', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'No email, callback due, or no touch in 48h', match: b => NEEDS_ACTION.has(b) },
  ...(Object.keys(BUCKET_META) as Bucket[]).map(b => ({
    key: b, label: BUCKET_META[b].short, desc: BUCKET_META[b].desc, dot: BUCKET_META[b].dot, match: (x: Bucket) => x === b,
  })),
];

/** Six tiles that partition every row (needs_action = needs_email + callback_due + stale). */
const TILES: TileDef<FilterKey>[] = [
  { key: 'needs_action', label: 'Needs action', desc: FILTERS[1].desc, style: 'border-red-300 bg-red-50 text-red-800', alert: true },
  { key: 'in_sequence', label: 'In sequence', desc: BUCKET_META.in_sequence.desc, style: BUCKET_META.in_sequence.tile },
  { key: 'paused', label: 'Paused', desc: BUCKET_META.paused.desc, style: BUCKET_META.paused.tile },
  { key: 'engaged', label: 'Engaged', desc: BUCKET_META.engaged.desc, style: BUCKET_META.engaged.tile },
  { key: 'converted', label: 'Converted', desc: BUCKET_META.converted.desc, style: BUCKET_META.converted.tile },
  { key: 'closed', label: 'Closed', desc: BUCKET_META.closed.desc, style: BUCKET_META.closed.tile },
];

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────
const ProviderAcquisitionTab: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReferringProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logTouchFor, setLogTouchFor] = useState<ReferringProvider | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStat[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const { data, error } = await db
        .from('patient_referring_providers')
        .select('*')
        .order('discovered_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data as ReferringProvider[]) || []);
    } catch (err: any) {
      console.error('[ProviderAcquisitionTab] load failed:', err);
      setLastError(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Weekly outreach stats (who did what this week) — the owner's view of
  // whether the queue is actually being worked.
  useEffect(() => {
    (async () => {
      const { data } = await db.rpc('get_outreach_week_stats', {});
      setWeekStats((data as WeekStat[]) || []);
    })();
  }, [rows]);

  const bucketOf = useMemo(() => {
    const now = Date.now();
    const m = new Map<string, Bucket>();
    for (const r of rows) m.set(r.id, deriveBucket(r, now));
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

  // Funnel (cumulative, for the subtitle — distinct from the partitioned tiles).
  const funnel = useMemo(() => ({
    captured: rows.length,
    contacted: rows.filter(r => (r.sequence_step || 0) >= 1).length,
    converted: rows.filter(r => r.status === 'converted').length,
  }), [rows]);

  const filtered = useMemo(() => {
    const def = FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    return rows.filter(r => def.match(bucketOf.get(r.id)!) && (q === '' ||
      [r.provider_name, r.practice_name, r.practice_email, r.practice_city, r.practice_phone, r.patient_name, r.patient_email]
        .filter(Boolean).some(v => (v as string).toLowerCase().includes(q))
    ));
  }, [rows, filter, search, bucketOf]);

  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(r => NEEDS_ACTION.has(bucketOf.get(r.id)!));
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(r => !NEEDS_ACTION.has(bucketOf.get(r.id)!)) };
  }, [filtered, filter, bucketOf]);

  const selected = rows.find(r => r.id === selectedId) || null;

  // ── Actions (unchanged semantics) ───────────────────────────────
  const setEmail = useCallback(async (id: string, email: string) => {
    const { error } = await db.from('patient_referring_providers')
      .update({
        practice_email: email.trim().toLowerCase(),
        status: 'email_found',
        email_found_at: new Date().toISOString(),
        next_send_at: new Date().toISOString(),  // fire E1 (or E3 if no consent) on next cron
      }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Email saved — drip will start on next hourly tick');
    load();
  }, [load]);

  const fireNow = useCallback(async (r: ReferringProvider) => {
    if (!window.confirm(`Send drip step ${(r.sequence_step || 0) + 1} to ${practiceLabel(r)} now?`)) return;
    setBusyId(r.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-provider-outreach', { body: { referring_provider_id: r.id } });
      if (error) throw error;
      toast.success(`Step ${data?.step || '?'} sent${data?.skipped ? ` (skipped: ${data.skipped})` : ''}`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Send failed');
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const pause = useCallback(async (r: ReferringProvider, paused: boolean) => {
    const { error } = await db.from('patient_referring_providers')
      .update({ paused_at: paused ? new Date().toISOString() : null }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(paused ? `${practiceLabel(r)} paused` : `${practiceLabel(r)} resumed`);
    load();
  }, [load]);

  const mark = useCallback(async (r: ReferringProvider, status: Status) => {
    if (status === 'declined' && !window.confirm(`Mark ${practiceLabel(r)} as declined? This pauses all outreach.`)) return;
    const patch: Record<string, any> = { status };
    if (status === 'declined' || status === 'unsubscribed') patch.paused_at = new Date().toISOString();
    const { error } = await db.from('patient_referring_providers').update(patch).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${STATUS_LABEL[status]}`);
    load();
  }, [load]);

  const copyClaimUrl = useCallback((token: string | null) => {
    if (!token) { toast.error('No claim token yet — send email 1+ first'); return; }
    copyText(`${window.location.origin}/join/${token}`, 'Claim URL');
  }, []);

  const handlers: RowHandlers = {
    busyId,
    onOpen: (r) => setSelectedId(r.id),
    onLogTouch: setLogTouchFor,
    onFireNow: fireNow,
    onPause: pause,
    onMark: mark,
    onCopyClaim: copyClaimUrl,
  };
  const activeFilter = FILTERS.find(f => f.key === filter)!;
  const actedByName = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email || 'Admin';

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      <PageHeader
        icon={Handshake}
        title="Acquisition pipeline"
        subtitle={
          <>
            Every patient booking that named a doctor's office we don't partner with yet. The drip sends automatically — this is where the human touches happen.
            {funnel.captured > 0 && (
              <span className="ml-1 text-gray-600">
                {funnel.converted} of {funnel.captured} converted ({((funnel.converted / funnel.captured) * 100).toFixed(0)}%){funnel.contacted > 0 && ` · ${((funnel.converted / funnel.contacted) * 100).toFixed(0)}% of contacted`}.
              </span>
            )}
            {counts.needs_action > 0 && <span className="ml-1 font-medium text-red-700">{counts.needs_action} need a human touch.</span>}
          </>
        }
        actions={<RefreshButton onClick={load} loading={loading} />}
      />

      <StatTiles tiles={TILES} counts={counts} active={filter} onSelect={k => setFilter(k)} loading={loading} ariaLabel="Pipeline counts" cols="sm:grid-cols-3 lg:grid-cols-6" />

      {lastError && <ErrorCard what="the pipeline" message={lastError} onRetry={load} />}

      {weekStats.length > 0 && <WeekStatsCard stats={weekStats} />}

      <div className="space-y-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search practice, provider, email, phone, city, patient…" ariaLabel="Search pipeline" />
        <FilterChips filters={FILTERS} counts={counts} active={filter} onSelect={k => setFilter(k)} ariaLabel="Pipeline filter" />
      </div>

      {loading && rows.length === 0 ? (
        <LoadingRows label="Loading pipeline" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Handshake}
          emptyTitle="No referred-in providers yet."
          emptyHint="When a patient books and names a doctor's office that isn't already with us, they land here."
          filterLabel={activeFilter.label}
          filterDesc={activeFilter.desc}
          hasSearch={search.trim() !== ''}
          searchHint="Try a practice, provider, email, phone, city or patient name."
          total={rows.length}
          noun="providers"
          onReset={() => { setFilter('all'); setSearch(''); }}
        />
      ) : lanes ? (
        <div className="space-y-5">
          <section aria-labelledby="lane-action">
            <LaneHeader id="lane-action" title="Needs action" count={lanes.action.length} tone="red" />
            <ProviderRows rows={lanes.action} bucketOf={bucketOf} handlers={handlers} />
          </section>
          {lanes.rest.length > 0 && (
            <section aria-labelledby="lane-rest">
              <LaneHeader id="lane-rest" title="Everything else" count={lanes.rest.length} tone="gray" />
              <ProviderRows rows={lanes.rest} bucketOf={bucketOf} handlers={handlers} />
            </section>
          )}
        </div>
      ) : (
        <ProviderRows rows={filtered} bucketOf={bucketOf} handlers={handlers} />
      )}

      <ListFooter shown={filtered.length} total={rows.length} noun="provider" extra={rows.length >= 200 ? 'showing the newest 200' : undefined} />

      {selected && (
        <ProviderDetailDrawer
          row={selected}
          bucket={bucketOf.get(selected.id) || deriveBucket(selected)}
          busy={busyId === selected.id}
          onClose={() => setSelectedId(null)}
          onSetEmail={setEmail}
          onFireNow={() => fireNow(selected)}
          onPause={(p) => pause(selected, p)}
          onMark={(s) => mark(selected, s)}
          onCopyClaim={copyClaimUrl}
          onLogTouch={() => setLogTouchFor(selected)}
        />
      )}

      {/* LOG-A-TOUCH MODAL — every call, voicemail, manual email, fax, text
          or in-person visit gets a row. Surfaces in the per-provider timeline
          + the owner's weekly view. */}
      <LogTouchModal
        provider={logTouchFor}
        onClose={() => setLogTouchFor(null)}
        onLogged={() => { setLogTouchFor(null); load(); }}
        actedByName={actedByName}
      />
    </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Week stats — compact card
// ──────────────────────────────────────────────────────────────────
const WeekStatsCard: React.FC<{ stats: WeekStat[] }> = ({ stats }) => (
  <Card className="shadow-sm">
    <CardContent className="p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1.5 mb-2">
        <Activity className="h-3.5 w-3.5 text-[#B91C1C]" aria-hidden="true" /> This week's outreach by admin
      </p>
      <div className="space-y-1.5">
        {stats.map(s => (
          <div key={s.acted_by} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{s.acted_by_name || 'Unknown'}</p>
              <p className="text-[11px] text-gray-500">{plural(s.providers_reached, 'provider')} contacted · {plural(s.total_touches, 'touch', 'touches')}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
              {s.calls > 0 && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{s.calls} calls</Badge>}
              {s.voicemails > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{s.voicemails} voicemails</Badge>}
              {s.emails_manual > 0 && <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">{s.emails_manual} emails</Badge>}
              {s.texts > 0 && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{s.texts} texts</Badge>}
              {s.research_notes > 0 && <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">{s.research_notes} research</Badge>}
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

// ──────────────────────────────────────────────────────────────────
// Rows
// ──────────────────────────────────────────────────────────────────
interface RowHandlers {
  busyId: string | null;
  onOpen: (r: ReferringProvider) => void;
  onLogTouch: (r: ReferringProvider) => void;
  onFireNow: (r: ReferringProvider) => void;
  onPause: (r: ReferringProvider, paused: boolean) => void;
  onMark: (r: ReferringProvider, status: Status) => void;
  onCopyClaim: (token: string | null) => void;
}

const canFire = (r: ReferringProvider) => !!r.practice_email && r.sequence_step !== null && (r.sequence_step || 0) < 5 && !r.paused_at && !CLOSED_STATUSES.has(r.status) && r.status !== 'converted';

const StatusPill: React.FC<{ row: ReferringProvider; bucket: Bucket; className?: string }> = ({ row, bucket, className }) => {
  const meta = BUCKET_META[bucket];
  let text = meta.label;
  if (bucket === 'callback_due' && row.next_followup_at) {
    const due = new Date(row.next_followup_at).getTime();
    text = due <= Date.now() ? 'Callback overdue' : 'Callback today';
  }
  if (bucket === 'stale') text = row.last_outreach_at ? `No touch ${Math.floor((Date.now() - new Date(row.last_outreach_at).getTime()) / DAY)}d` : 'No touch yet';
  if (bucket === 'engaged') text = STATUS_LABEL[row.status];
  return <Pill className={cn(meta.pill, className)} dot={meta.dot} title={meta.desc}>{text}</Pill>;
};

const StepBadge: React.FC<{ row: ReferringProvider }> = ({ row }) => {
  const step = row.sequence_step || 0;
  if (step <= 0) return <span className="text-gray-400">Not started</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map(i => <span key={i} className={cn('w-1.5 h-1.5 rounded-full', i <= step ? 'bg-indigo-500' : 'bg-gray-200')} />)}
      </span>
      <span className="text-xs text-gray-700">Step {step}/5</span>
    </span>
  );
};

const PrimaryAction: React.FC<{ row: ReferringProvider; bucket: Bucket; h: RowHandlers; className?: string }> = ({ row, bucket, h, className }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (bucket === 'needs_email') {
    return (
      <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onOpen(row); }}>
        <Search className="h-3.5 w-3.5" aria-hidden="true" /> Find email
      </Button>
    );
  }
  if (bucket === 'callback_due' || bucket === 'stale') {
    return (
      <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onLogTouch(row); }}>
        <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" /> Log a touch
      </Button>
    );
  }
  if (bucket === 'paused') {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onPause(row, false); }}>
        <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" /> Resume
      </Button>
    );
  }
  if (bucket === 'engaged') {
    return (
      <Button size="sm" className={cn('bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onMark(row, 'converted'); }}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Mark converted
      </Button>
    );
  }
  if (bucket === 'in_sequence') {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onLogTouch(row); }}>
        <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" /> Log a touch
      </Button>
    );
  }
  return null;
};

const RowMenu: React.FC<{ row: ReferringProvider; h: RowHandlers; className?: string }> = ({ row, h, className }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${practiceLabel(row)}`} onClick={(e) => e.stopPropagation()}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-60" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => h.onOpen(row)}><Building2 className="h-4 w-4 mr-2" aria-hidden="true" /> Open provider</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => h.onLogTouch(row)}><ClipboardList className="h-4 w-4 mr-2" aria-hidden="true" /> Log a touch</DropdownMenuItem>
      {canFire(row) && (
        <DropdownMenuItem onSelect={() => h.onFireNow(row)} disabled={h.busyId === row.id}>
          <Send className="h-4 w-4 mr-2" aria-hidden="true" /> Fire step {(row.sequence_step || 0) + 1} now
        </DropdownMenuItem>
      )}
      {row.claim_token && (
        <DropdownMenuItem onSelect={() => h.onCopyClaim(row.claim_token)}><Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy claim URL</DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      {!CLOSED_STATUSES.has(row.status) && row.status !== 'converted' && (
        <DropdownMenuItem onSelect={() => h.onPause(row, !row.paused_at)}>
          {row.paused_at ? <PlayCircle className="h-4 w-4 mr-2" aria-hidden="true" /> : <PauseCircle className="h-4 w-4 mr-2" aria-hidden="true" />}
          {row.paused_at ? 'Resume drip' : 'Pause drip'}
        </DropdownMenuItem>
      )}
      {row.status !== 'converted' && (
        <DropdownMenuItem onSelect={() => h.onMark(row, 'converted')}><Sparkles className="h-4 w-4 mr-2" aria-hidden="true" /> Mark converted</DropdownMenuItem>
      )}
      {row.status !== 'converted' && !CLOSED_STATUSES.has(row.status) && (
        <DropdownMenuItem className="text-red-700 focus:text-red-700" onSelect={() => h.onMark(row, 'declined')}><XCircle className="h-4 w-4 mr-2" aria-hidden="true" /> Mark declined</DropdownMenuItem>
      )}
      {(row.practice_phone || row.practice_email) && <DropdownMenuSeparator />}
      {row.practice_phone && (
        <DropdownMenuItem asChild><a href={`tel:${row.practice_phone}`}><Phone className="h-4 w-4 mr-2" aria-hidden="true" /> Call {row.practice_phone}</a></DropdownMenuItem>
      )}
      {row.practice_email && (
        <DropdownMenuItem asChild><a href={`mailto:${row.practice_email}`}><Mail className="h-4 w-4 mr-2" aria-hidden="true" /> Email practice</a></DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

const ProviderRows: React.FC<{ rows: ReferringProvider[]; bucketOf: Map<string, Bucket>; handlers: RowHandlers }> = ({ rows, bucketOf, handlers }) => {
  const bucket = (r: ReferringProvider) => bucketOf.get(r.id) || deriveBucket(r);
  const accent = (b: Bucket) =>
    b === 'callback_due' ? 'border-l-4 border-l-red-500' :
    b === 'needs_email' ? 'border-l-4 border-l-amber-500' :
    b === 'stale' ? 'border-l-4 border-l-orange-400' : '';
  return (
    <>
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className={cn(TH, 'pl-4')}>Practice</TableHead>
              <TableHead className={TH}>Referred by</TableHead>
              <TableHead className={TH}>Contact</TableHead>
              <TableHead className={cn(TH, 'whitespace-nowrap')}>Drip</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={cn('hidden xl:table-cell', TH, 'whitespace-nowrap')}>Last touch</TableHead>
              <TableHead className={TH_STICKY}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => {
              const b = bucket(r);
              const open = () => handlers.onOpen(r);
              return (
                <TableRow
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={rowKeyHandler(open)}
                  aria-label={`${practiceLabel(r)}, ${BUCKET_META[b].label}. Open provider`}
                  className={cn(ROW_FOCUS, 'bg-white', accent(b))}
                >
                  <TableCell className="py-2.5 pl-4 align-top">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-gray-800 truncate block">{practiceLabel(r)}</span>
                      <p className="text-[11px] text-gray-500 truncate">
                        {r.provider_name && r.practice_name ? `${r.provider_name}` : ''}{r.provider_name && r.practice_name && r.practice_city ? ' · ' : ''}{r.practice_city || ''}
                        {!r.provider_name && !r.practice_city && <span className="text-gray-400">No details</span>}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 max-w-[180px]">
                    <span className="block truncate">{r.patient_name || 'Patient'}</span>
                    <span className="block text-[11px] text-gray-400">{ago(r.discovered_at)}{r.patient_consent ? '' : ' · no consent'}</span>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 max-w-[220px]">
                    <span className="block truncate">{r.practice_email || <span className="text-amber-700 font-medium">Needs email</span>}</span>
                    <span className="block text-[11px] text-gray-500">{r.practice_phone || <span className="text-gray-400">No phone</span>}</span>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs whitespace-nowrap"><StepBadge row={r} /></TableCell>
                  <TableCell className="py-2.5 align-top"><StatusPill row={r} bucket={b} /></TableCell>
                  <TableCell className="hidden xl:table-cell py-2.5 align-top text-xs text-gray-600 whitespace-nowrap">
                    {r.last_outreach_at ? (
                      <>
                        <span className="block">{r.last_outreach_action ? (ACTION_LABEL[r.last_outreach_action as OutreachLogEntry['action_type']] || r.last_outreach_action) : 'Touched'}</span>
                        <span className="block text-[11px] text-gray-400">{ago(r.last_outreach_at)}</span>
                      </>
                    ) : <span className="text-gray-400">Never</span>}
                  </TableCell>
                  <TableCell className={TD_STICKY}>
                    <div className="flex items-center justify-end gap-1">
                      <PrimaryAction row={r} bucket={b} h={handlers} className="h-9" />
                      {r.practice_phone && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label={`Call ${practiceLabel(r)}`} asChild onClick={(e) => e.stopPropagation()}>
                              <a href={`tel:${r.practice_phone}`}><Phone className="h-4 w-4" aria-hidden="true" /></a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Call {r.practice_phone}</TooltipContent>
                        </Tooltip>
                      )}
                      <RowMenu row={r} h={handlers} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {rows.map(r => {
          const b = bucket(r);
          const open = () => handlers.onOpen(r);
          return (
            <Card
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={rowKeyHandler(open)}
              aria-label={`${practiceLabel(r)}, ${BUCKET_META[b].label}. Open provider`}
              className={cn(CARD_FOCUS, accent(b))}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-gray-800 block truncate">{practiceLabel(r)}</span>
                    <p className="text-[11px] text-gray-500 truncate">{r.practice_email || r.practice_phone || 'No contact yet'}{r.practice_city ? ` · ${r.practice_city}` : ''}</p>
                  </div>
                  <StatusPill row={r} bucket={b} />
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                  <StepBadge row={r} />
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-500">Ref'd by {r.patient_name || 'patient'} {ago(r.discovered_at)}</span>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <PrimaryAction row={r} bucket={b} h={handlers} className="h-11 flex-1 justify-center" />
                  <RowMenu row={r} h={handlers} className="h-11 w-11 flex-shrink-0 border border-gray-200" />
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
// Detail drawer — email research, manual touches, drip timeline, actions.
// ──────────────────────────────────────────────────────────────────
const ProviderDetailDrawer: React.FC<{
  row: ReferringProvider;
  bucket: Bucket;
  busy: boolean;
  onClose: () => void;
  onSetEmail: (id: string, email: string) => void;
  onFireNow: () => void;
  onPause: (paused: boolean) => void;
  onMark: (status: Status) => void;
  onCopyClaim: (token: string | null) => void;
  onLogTouch: () => void;
}> = ({ row, bucket, busy, onClose, onSetEmail, onFireNow, onPause, onMark, onCopyClaim, onLogTouch }) => {
  const [emailDraft, setEmailDraft] = useState(row.practice_email || '');
  const [sends, setSends] = useState<any[]>([]);
  const [outreachLog, setOutreachLog] = useState<OutreachLogEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    setEmailDraft(row.practice_email || '');
    let cancelled = false;
    (async () => {
      setLoadingHistory(true);
      const [sendsRes, logRes] = await Promise.all([
        db.from('provider_outreach_sends').select('*').eq('referring_provider_id', row.id).order('sent_at', { ascending: false }),
        db.from('provider_outreach_log').select('*').eq('referring_provider_id', row.id).order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      setSends((sendsRes.data as any[]) || []);
      setOutreachLog((logRes.data as OutreachLogEntry[]) || []);
      setLoadingHistory(false);
    })();
    return () => { cancelled = true; };
  }, [row.id, row.practice_email, row.last_outreach_at]);

  const practiceSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${row.practice_name || row.provider_name || ''} ${row.practice_city || ''} email`)}`;
  const open = !CLOSED_STATUSES.has(row.status) && row.status !== 'converted';

  // Merged timeline (newest first): human touches + automated sends + milestones.
  const timeline = useMemo(() => {
    const items: Array<{ at: string; kind: 'touch' | 'send' | 'milestone'; label: React.ReactNode; sub?: React.ReactNode }> = [];
    for (const t of outreachLog) {
      items.push({
        at: t.created_at, kind: 'touch',
        label: <>{ACTION_LABEL[t.action_type] || t.action_type}{t.outcome ? ` · ${OUTCOME_LABEL[t.outcome] || t.outcome}` : ''}{t.acted_by_name ? <span className="text-gray-500"> · {t.acted_by_name}</span> : null}</>,
        sub: <>{t.notes && <span className="italic">“{t.notes}”</span>}{t.follow_up_at && <span className="text-blue-700 inline-flex items-center gap-0.5 ml-1"><Clock className="h-3 w-3" aria-hidden="true" /> follow up {fmt(t.follow_up_at, 'MMM d')}</span>}</>,
      });
    }
    for (const s of sends) {
      items.push({
        at: s.sent_at, kind: 'send',
        label: <>Drip step {s.sequence_step} sent{s.opened_at && <span className="text-emerald-700"> · opened</span>}{s.clicked_at && <span className="text-emerald-700"> · clicked</span>}{s.replied_at && <span className="text-purple-700"> · replied</span>}{s.bounced_at && <span className="text-red-600"> · bounced</span>}</>,
        sub: s.subject,
      });
    }
    const m: Array<[string | null, string]> = [
      [row.discovered_at, 'Discovered from a patient booking'], [row.first_contact_at, 'First contact'],
      [row.portal_activated_at, 'Portal activated'], [row.converted_at, 'Converted'], [row.paused_at, 'Paused'],
    ];
    for (const [at, label] of m) if (at) items.push({ at, kind: 'milestone', label });
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [outreachLog, sends, row]);

  return (
    <DetailDrawer
      titleId={`provider-title-${row.id}`}
      eyebrow="Referred-in provider"
      title={practiceLabel(row)}
      meta={
        <>
          <StatusPill row={row} bucket={bucket} className="bg-white/95" />
          {row.provider_name && row.practice_name && <span className="text-sm opacity-95 truncate">{row.provider_name}</span>}
          {row.practice_city && <span className="text-sm opacity-80">· {row.practice_city}</span>}
        </>
      }
      onClose={onClose}
    >
      {bucket === 'needs_email' && (
        <Notice tone="amber" icon={Search}>
          <p>No practice email on file — the drip can't start. Call the front desk, ask for the practice manager's email, paste it below and the first email goes out on the next hourly tick.</p>
        </Notice>
      )}
      {bucket === 'callback_due' && (
        <Notice tone="red" icon={Clock}>
          <p>Callback due {fmt(row.next_followup_at, 'MMM d, h:mm a')}. Log the call once it's done so it drops off the queue.</p>
        </Notice>
      )}
      {bucket === 'paused' && (
        <Notice tone="blue" icon={PauseCircle}>
          <p>Drip paused {ago(row.paused_at)} — no automatic sends until resumed.</p>
        </Notice>
      )}

      <QuickActions>
        <Button onClick={onLogTouch} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-10 text-xs flex-shrink-0">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" /> Log a touch
        </Button>
        {canFire(row) && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={onFireNow} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />} Fire step {(row.sequence_step || 0) + 1} now
          </Button>
        )}
        {row.practice_phone && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
            <a href={`tel:${row.practice_phone}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call</a>
          </Button>
        )}
        {row.practice_email && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
            <a href={`mailto:${row.practice_email}`}><Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email</a>
          </Button>
        )}
        {row.claim_token && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={() => onCopyClaim(row.claim_token)}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy claim URL
          </Button>
        )}
        {open && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={() => onPause(!row.paused_at)}>
            {row.paused_at ? <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" /> : <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />} {row.paused_at ? 'Resume' : 'Pause'}
          </Button>
        )}
        {row.status !== 'converted' && (
          <Button size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onMark('converted')}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Mark converted
          </Button>
        )}
        {open && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0 border-red-300 text-red-700 hover:bg-red-50" onClick={() => onMark('declined')}>
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Decline
          </Button>
        )}
      </QuickActions>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-2 text-sm lg:col-span-1">
          <SectionLabel>Practice email</SectionLabel>
          <div className="flex gap-2">
            <Input value={emailDraft} onChange={e => setEmailDraft(e.target.value)} placeholder="office@practice.com" className="flex-1 h-9 text-sm" inputMode="email" />
            <Button size="sm" className="h-9 text-xs bg-[#B91C1C] hover:bg-[#991B1B] text-white flex-shrink-0" onClick={() => onSetEmail(row.id, emailDraft)} disabled={!emailDraft.trim() || emailDraft.trim().toLowerCase() === (row.practice_email || '')}>
              {row.practice_email ? 'Update' : 'Save & start drip'}
            </Button>
          </div>
          <a href={practiceSearchUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1">
            <Search className="h-3 w-3" aria-hidden="true" /> Search Google for this practice <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs pt-2">
            <Field label="Phone">{row.practice_phone ? <a href={`tel:${row.practice_phone}`} className="text-gray-900 hover:underline">{row.practice_phone}</a> : '—'}</Field>
            <Field label="City">{row.practice_city || '—'}</Field>
            <Field label="Provider">{row.provider_name || '—'}</Field>
            {row.matched_org_id && <Field label="Linked org"><span className="font-mono text-[10px]">{row.matched_org_id}</span></Field>}
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          <SectionLabel>Referred by</SectionLabel>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <Field label="Patient">{row.patient_name || '—'}</Field>
            <Field label="Email">{row.patient_email || '—'}</Field>
            <Field label="Consent">{row.patient_consent ? <span className="text-emerald-700">Yes — can name the patient</span> : <span className="text-amber-700">No — emails 1 & 2 skipped</span>}</Field>
            <Field label="Discovered">{fmt(row.discovered_at, 'MMM d, yyyy')} · {ago(row.discovered_at)}</Field>
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          <SectionLabel>Drip</SectionLabel>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <Field label="Stage"><span className="font-medium">{STATUS_LABEL[row.status] || row.status}</span> <span className="text-gray-400 font-mono text-[10px]">({row.status})</span></Field>
            <Field label="Step"><StepBadge row={row} /></Field>
            <Field label="Next send">{row.paused_at ? 'Paused' : row.next_send_at ? `${fmt(row.next_send_at)} · ${ago(row.next_send_at)}` : '—'}</Field>
            <Field label="Last touch">{row.last_outreach_at ? `${fmt(row.last_outreach_at)} · ${ago(row.last_outreach_at)}` : 'Never'}</Field>
            <Field label="Follow-up">{row.next_followup_at ? fmt(row.next_followup_at, 'MMM d, yyyy') : '—'}</Field>
            {row.claim_token && <Field label="Claim">{row.claim_token ? 'Token issued' : '—'}</Field>}
          </div>
        </div>
      </div>

      <div>
        <SectionLabel className="mb-2">Timeline · human touches, automated sends, milestones</SectionLabel>
        {loadingHistory ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : timeline.length === 0 ? (
          <p className="text-xs text-gray-500">No activity yet.</p>
        ) : (
          <ol className="space-y-1.5 text-xs">
            {timeline.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0', t.kind === 'touch' ? 'bg-[#B91C1C]' : t.kind === 'send' ? 'bg-indigo-400' : 'bg-gray-300')} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="text-gray-800">{t.label}</span>
                  {t.sub && <span className="block text-gray-600 truncate">{t.sub}</span>}
                  <span className="block text-[10px] text-gray-400">{fmt(t.at)} · {ago(t.at)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {!loadingHistory && outreachLog.length === 0 && open && (
          <Notice tone="amber" icon={AlertTriangle}>
            <p>No human touches logged yet. Click <strong>Log a touch</strong> after each call, voicemail or manual email so the owner sees the work being done.</p>
          </Notice>
        )}
      </div>

      <p className="text-[10px] text-gray-400">Provider ID <span className="font-mono">{row.id}</span></p>
    </DetailDrawer>
  );
};

// ──────────────────────────────────────────────────────────────────
// LOG-A-TOUCH MODAL
// Every entry stamps last_outreach_at + last_outreach_by on the parent row
// via the trg_outreach_log_stamp_parent trigger, so SLA pills + the
// "Needs action" lane update without any client work.
// ──────────────────────────────────────────────────────────────────
const LogTouchModal: React.FC<{
  provider: ReferringProvider | null;
  onClose: () => void;
  onLogged: () => void;
  actedByName: string;
}> = ({ provider, onClose, onLogged, actedByName }) => {
  const { user } = useAuth();
  const [actionType, setActionType] = useState<OutreachLogEntry['action_type']>('call');
  const [outcome, setOutcome] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (provider) { setActionType('call'); setOutcome(''); setNotes(''); setFollowUpAt(''); }
  }, [provider?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!provider) return null;

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await db.from('provider_outreach_log').insert({
        referring_provider_id: provider.id,
        acted_by: user?.id || null,
        acted_by_name: actedByName,
        action_type: actionType,
        outcome: outcome || null,
        notes: notes.trim() || null,
        follow_up_at: followUpAt ? new Date(followUpAt).toISOString() : null,
      });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Touch logged');
      onLogged();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
      setSaving(false);
    }
  };

  const needsOutcome = ['call', 'voicemail', 'email_manual', 'text', 'visit_in_person'].includes(actionType);

  return (
    <Dialog open={!!provider} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#B91C1C]" aria-hidden="true" /> Log a touch</DialogTitle>
          <DialogDescription>
            Record what you just did for <strong>{practiceLabel(provider)}</strong>. The owner sees this on the dashboard so calls and voicemails don't go invisible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Action</Label>
            <div className="grid grid-cols-4 gap-1.5 mt-1" role="group" aria-label="Action type">
              {(['call', 'voicemail', 'email_manual', 'text', 'fax', 'visit_in_person', 'research', 'note'] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setActionType(a)}
                  aria-pressed={actionType === a}
                  className={cn('text-[11px] px-2 py-2 rounded-md border text-left min-h-[40px]', actionType === a ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C] font-semibold' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')}
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          </div>

          {needsOutcome && (
            <div>
              <Label className="text-xs" htmlFor="touch-outcome">Outcome</Label>
              <select id="touch-outcome" value={outcome} onChange={e => setOutcome(e.target.value)} className="w-full border border-gray-200 rounded-md px-3 h-10 text-sm mt-1 bg-white">
                <option value="">— select —</option>
                {Object.entries(OUTCOME_LABEL).filter(([k]) => k !== 'no_decision').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}

          <div>
            <Label className="text-xs" htmlFor="touch-notes">Notes</Label>
            <Textarea
              id="touch-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder='e.g. "Spoke with receptionist Linda. Office manager Sarah is out til Mon, will email me Tuesday."'
              rows={3}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1" htmlFor="touch-followup"><Clock className="h-3 w-3" aria-hidden="true" /> Follow up by (optional)</Label>
            <Input id="touch-followup" type="date" value={followUpAt} onChange={e => setFollowUpAt(e.target.value)} className="mt-1 h-10" />
            <p className="text-[10px] text-gray-500 mt-1">If set, this provider shows as "Callback due" on that date even if otherwise quiet.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />}
            Log it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProviderAcquisitionTab;
