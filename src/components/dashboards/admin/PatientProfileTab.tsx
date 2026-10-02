/**
 * PatientProfileTab — the admin patient directory + chart.
 *
 * Rendered for BOTH admin roles (super_admin + office_manager) via
 * Dashboard.tsx SECTION_SCREENS["patients"]; one component, not one per
 * role. The only role-gated control is "Delete patient" (super_admin).
 *
 * Source table: tenant_patients (deleted_at IS NULL — is_active is legacy).
 * Every patient maps to exactly ONE bucket (patientDirectory.ts) so the stat
 * tiles, the filter chips and the list always agree:
 *
 *   balance_due       → a past visit is still unpaid
 *   unresolved_visit  → a live-status visit whose date already passed
 *   upcoming          → has a visit booked today or later
 *   active            → has visited before, nothing booked
 *   never_booked      → no appointments at all
 *
 * Flags (member, protected, missing address, no contact, no DOB, lab
 * deadline passed) are orthogonal — they decorate rows and power the
 * secondary chips, never the bucket.
 *
 * Holds PHI: nothing is logged beyond ids/error codes, and no message is
 * ever sent to a patient from this screen without an explicit confirm.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TooltipProvider } from '@/components/ui/tooltip';
import AddressAutocomplete from '@/components/ui/address-autocomplete';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Users, UserPlus, RefreshCw, Search, X, AlertTriangle, Crown, Shield, MoreHorizontal, Zap, CalendarPlus,
  MessageSquare, Phone, Mail, Copy, ChevronRight, FileText, MapPin, Loader2,
} from 'lucide-react';
import ScheduleAppointmentModal from '@/components/calendar/ScheduleAppointmentModal';
import SendBookingLinkModal from '@/components/admin/SendBookingLinkModal';
import PatientChart from './PatientChart';
import {
  BUCKET_META, FLAG_KEYS, FLAG_META, NEEDS_ACTION, PATIENT_FILTERS, PATIENT_TILE_KEYS, PATIENT_TILE_STYLE,
  type ApptLite, type MemberTier, type PatientBucket, type PatientFilterKey, type PatientFlag, type PatientRow, type PatientStats,
  apptDay, computeStats, daysFromToday, derivePatientBucket, digits, fmtDay, fullName, matchesSearch,
  openMessageThread, stashAdminPrefill, tierBadgeClass, toPrefilledPatient,
} from './patientDirectory';

// Untyped table access — tenant_patients / user_memberships columns used
// here aren't all in the generated Database type.
const db = supabase as any;

/**
 * Load EVERY non-deleted patient, paging past PostgREST's per-response row
 * cap. (2026-07-14: a single `.limit(1000)` was silently truncated to 500,
 * so late-alphabet patients vanished from a client-side search.) Advances by
 * the ACTUAL returned count and stops on an empty page — correct for any cap.
 */
async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  const REQUEST = 1000;
  for (let guard = 0; guard < 50; guard++) {
    const { data, error } = await page(from, from + REQUEST - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length === 0) break;
    from += rows.length;
  }
  return all;
}

const fetchAllTenantPatients = () => fetchAllPages<PatientRow>((from, to) =>
  db.from('tenant_patients')
    .select('*')
    .is('deleted_at', null)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to));

/** Every appointment with a patient — slim projection, paged the same way
 *  (the 500-row cap bit the patient list once already). */
const fetchAllPatientAppointments = () => fetchAllPages<ApptLite>((from, to) =>
  db.from('appointments')
    .select('id, patient_id, status, appointment_date, appointment_time, payment_status, total_amount, is_vip, service_type, service_name')
    .not('patient_id', 'is', null)
    .order('appointment_date', { ascending: false })
    .order('id', { ascending: true })
    .range(from, to));

async function copyText(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); }
  catch { toast.error(`Couldn't copy ${what.toLowerCase()}`); }
}

type SortKey = 'name' | 'recent' | 'last_visit';

interface RowHandlers {
  onOpen: (p: PatientRow) => void;
  onSchedule: (p: PatientRow) => void;
  onSendLink: (p: PatientRow) => void;
}

interface RowCtx {
  statsOf: Map<string, PatientStats>;
  bucketOf: Map<string, PatientBucket>;
  tierOf: Map<string, MemberTier>;
}

const EMPTY_NEW = { firstName: '', lastName: '', email: '', phone: '', dob: '', address: '', city: '', state: 'FL', zipcode: '', insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '' };

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────
const PatientProfileTab: React.FC = () => {
  const { user } = useAuth();
  // Deleting a patient record is an admin-only control.
  const canDelete = user?.role === 'super_admin';

  const [allPatients, setAllPatients] = useState<PatientRow[]>([]);
  const [appts, setAppts] = useState<ApptLite[]>([]);
  // user_id → tier. TRUE VIP = a real paid subscription; a VIP-named plan
  // with no Stripe subscription is an operational "don't auto-cancel" hack
  // (belongs on appointments.is_vip) and is never crowned.
  const [tierOf, setTierOf] = useState<Map<string, MemberTier>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const [filter, setFilter] = useState<PatientFilterKey>('all');
  const [flags, setFlags] = useState<Set<PatientFlag>>(new Set());
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>(() => {
    try { return (localStorage.getItem('convelabs_patients_sort') as SortKey) || 'name'; } catch { return 'name'; }
  });
  useEffect(() => { try { localStorage.setItem('convelabs_patients_sort', sort); } catch {} }, [sort]);

  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);

  // Row-level quick actions (no need to open the chart first).
  const [actionPatient, setActionPatient] = useState<PatientRow | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sendLinkOpen, setSendLinkOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newPatient, setNewPatient] = useState(EMPTY_NEW);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    const [pts, ap, mems] = await Promise.allSettled([
      fetchAllTenantPatients(),
      fetchAllPatientAppointments(),
      db.from('user_memberships')
        .select('user_id, status, stripe_subscription_id, membership_plans(name)')
        .eq('status', 'active'),
    ]);
    if (pts.status === 'fulfilled') setAllPatients(pts.value);
    else {
      console.error('[patients] load failed:', pts.reason?.code || pts.reason?.message || pts.reason);
      setLastError(pts.reason?.message || String(pts.reason));
    }
    if (ap.status === 'fulfilled') setAppts(ap.value);
    else console.warn('[patients] appointments load failed:', ap.reason?.code || ap.reason?.message);
    if (mems.status === 'fulfilled' && !mems.value.error) {
      const t = new Map<string, MemberTier>();
      for (const m of (mems.value.data as any[]) || []) {
        const planName = String(m?.membership_plans?.name || '').toLowerCase();
        let tier: MemberTier | null = 'member';
        if (planName.includes('concierge')) tier = 'concierge';
        else if (planName.includes('vip')) tier = m.stripe_subscription_id ? 'vip' : null;
        if (tier && m.user_id) t.set(m.user_id, tier);
      }
      setTierOf(t);
    } else console.warn('[patients] memberships load failed:', mems.status === 'fulfilled' ? mems.value.error?.code : mems.reason?.code);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Derived ───────────────────────────────────────────────────
  const statsOf = useMemo(() => computeStats(appts), [appts]);

  const bucketOf = useMemo(() => {
    const m = new Map<string, PatientBucket>();
    for (const p of allPatients) m.set(p.id, derivePatientBucket(statsOf.get(p.id)));
    return m;
  }, [allPatients, statsOf]);

  const tierFor = useCallback((p: PatientRow) => (p.user_id ? tierOf.get(p.user_id) : undefined), [tierOf]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(PATIENT_FILTERS.map(f => [f.key, 0])) as Record<PatientFilterKey, number>;
    for (const p of allPatients) {
      const b = bucketOf.get(p.id)!;
      for (const f of PATIENT_FILTERS) if (f.match(b)) c[f.key]++;
    }
    return c;
  }, [allPatients, bucketOf]);

  const flagCounts = useMemo(() => {
    const c = Object.fromEntries(FLAG_KEYS.map(k => [k, 0])) as Record<PatientFlag, number>;
    for (const p of allPatients) {
      const ctx = { stats: statsOf.get(p.id), tier: tierFor(p) };
      for (const k of FLAG_KEYS) if (FLAG_META[k].test(p, ctx)) c[k]++;
    }
    return c;
  }, [allPatients, statsOf, tierFor]);

  const filtered = useMemo(() => {
    const def = PATIENT_FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    const qd = digits(q);
    const list = allPatients.filter(p => {
      if (!def.match(bucketOf.get(p.id)!)) return false;
      if (flags.size > 0) {
        const ctx = { stats: statsOf.get(p.id), tier: tierFor(p) };
        for (const k of flags) if (!FLAG_META[k].test(p, ctx)) return false;
      }
      return matchesSearch(p, q, qd);
    });
    const lastDay = (p: PatientRow) => apptDay(statsOf.get(p.id)?.last || { appointment_date: null }) || '';
    if (sort === 'recent') list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    else if (sort === 'last_visit') list.sort((a, b) => lastDay(b).localeCompare(lastDay(a)) || fullName(a).localeCompare(fullName(b)));
    // 'name' keeps the server order (last name, first name).
    return list;
  }, [allPatients, filter, flags, search, sort, bucketOf, statsOf, tierFor]);

  // "Needs action" lane on top when viewing everything.
  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(p => NEEDS_ACTION.has(bucketOf.get(p.id)!));
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(p => !NEEDS_ACTION.has(bucketOf.get(p.id)!)) };
  }, [filtered, filter, bucketOf]);

  // ── Actions ───────────────────────────────────────────────────
  const openChart = useCallback((p: PatientRow) => {
    // Household clicks hand back a partial row — resolve to the full one.
    const full = allPatients.find(x => x.id === p.id) || p;
    setSelectedPatient(full);
    try { window.scrollTo({ top: 0 }); } catch {}
  }, [allPatients]);

  const schedule = useCallback((p: PatientRow) => {
    stashAdminPrefill(p);
    setActionPatient(p);
    setScheduleOpen(true);
  }, []);

  const sendLink = useCallback((p: PatientRow) => {
    if (!p.email && !p.phone) { toast.error('No phone or email on file — add one first'); return; }
    setActionPatient(p);
    setSendLinkOpen(true);
  }, []);

  const handlers: RowHandlers = { onOpen: openChart, onSchedule: schedule, onSendLink: sendLink };
  const ctx: RowCtx = { statsOf, bucketOf, tierOf };

  const createPatient = async () => {
    setCreateError('');
    setIsCreating(true);
    try {
      if (newPatient.email) {
        const { data: existing } = await db.from('tenant_patients').select('id').ilike('email', newPatient.email.trim()).is('deleted_at', null).limit(1);
        if (existing && existing.length > 0) { setCreateError('A patient with this email already exists'); return; }
      }
      const { data, error } = await db.from('tenant_patients').insert({
        first_name: newPatient.firstName.trim(),
        last_name: newPatient.lastName.trim(),
        email: newPatient.email?.trim() || null,
        phone: newPatient.phone?.trim() || null,
        date_of_birth: newPatient.dob || null,
        address: newPatient.address?.trim() || null,
        city: newPatient.city?.trim() || null,
        state: newPatient.state?.trim() || null,
        zipcode: newPatient.zipcode?.trim() || null,
        insurance_provider: newPatient.insuranceProvider?.trim() || null,
        insurance_member_id: newPatient.insuranceMemberId?.trim() || null,
        insurance_group_number: newPatient.insuranceGroup?.trim() || null,
        tenant_id: '00000000-0000-0000-0000-000000000001',
      }).select().single();
      if (error) throw error;
      if (!data) throw new Error('Patient was not created');
      toast.success(`${newPatient.firstName} ${newPatient.lastName} added`);
      setNewPatient(EMPTY_NEW);
      setCreateOpen(false);
      setAllPatients(prev => [...prev, data as PatientRow]);
      openChart(data as PatientRow);
    } catch (err: any) {
      console.error('[patients] create failed:', err?.code || err?.message);
      const msg = err?.message || 'Failed to create patient';
      setCreateError(msg);
      toast.error(msg, { duration: 6000 });
    } finally {
      setIsCreating(false);
    }
  };

  const activeFilter = PATIENT_FILTERS.find(f => f.key === filter)!;

  // ── Chart view ────────────────────────────────────────────────
  if (selectedPatient) {
    const s = statsOf.get(selectedPatient.id);
    return (
      <PatientChart
        key={selectedPatient.id}
        patient={selectedPatient}
        memberTier={tierFor(selectedPatient)}
        isProtected={!!s?.isProtected}
        canDelete={canDelete}
        canRefund={canDelete}
        onBack={() => setSelectedPatient(null)}
        onPatientSaved={(updated) => {
          setSelectedPatient(updated);
          setAllPatients(prev => prev.map(x => (x.id === updated.id ? { ...x, ...updated } : x)));
        }}
        onPatientDeleted={() => {
          setAllPatients(prev => prev.filter(x => x.id !== selectedPatient.id));
          setSelectedPatient(null);
          refresh();
        }}
        onOpenPatient={openChart}
        refreshDirectory={refresh}
      />
    );
  }

  // ── Directory view ────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900">
            <Users className="h-6 w-6 text-[#B91C1C]" aria-hidden="true" />
            Patients
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every patient on file — {loading ? 'loading…' : `${allPatients.length.toLocaleString()} total.`}
            {!loading && counts.needs_action > 0 && (
              <span className="ml-1 font-medium text-red-700">{counts.needs_action} need{counts.needs_action === 1 ? 's' : ''} action.</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-10 sm:h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={() => { setCreateError(''); setCreateOpen(true); }}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add patient</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* Stat tiles — click to filter. The four tiles partition every patient. */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible snap-x">
        <div className="grid grid-flow-col auto-cols-[46%] sm:auto-cols-auto sm:grid-cols-4 sm:grid-flow-row gap-2" role="group" aria-label="Patient counts">
          {PATIENT_TILE_KEYS.map(k => {
            const def = PATIENT_FILTERS.find(f => f.key === k)!;
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
                  active ? cn('ring-2 ring-[#B91C1C]/30', PATIENT_TILE_STYLE[k]) : 'bg-white border-gray-200 hover:border-[#B91C1C]/40',
                )}
              >
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 truncate">{def.label}</p>
                <p className={cn('text-2xl font-bold leading-tight mt-0.5 tabular-nums', k === 'needs_action' && counts[k] > 0 && !active && 'text-red-700')}>
                  {loading ? '–' : counts[k]}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {lastError && (
        <Card className="border-red-300 bg-red-50" role="alert">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs flex-1">
              <p className="font-semibold text-red-800">Couldn't load patients</p>
              <p className="text-red-700 mt-0.5 font-mono break-all">{lastError}</p>
              <p className="text-red-600 mt-1">If this says "JWT" or "401/403", log out and back in to refresh your session.</p>
            </div>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={refresh}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Search + sort + chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, phone, address, DOB…"
              aria-label="Search patients"
              className="h-10 sm:h-9 pl-8 text-sm"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            aria-label="Sort patients"
            className="h-10 sm:h-9 text-xs font-medium border border-gray-200 rounded-md px-2 bg-white text-gray-700"
          >
            <option value="name">Name A–Z</option>
            <option value="recent">Recently added</option>
            <option value="last_visit">Last visit</option>
          </select>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap" role="group" aria-label="Status filter">
          {PATIENT_FILTERS.map(f => {
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
                  <span className={cn('w-1.5 h-1.5 rounded-full', active ? 'bg-white' : BUCKET_META[f.key as PatientBucket].dot)} aria-hidden="true" />
                )}
                {f.label}
                <span className={cn('tabular-nums', active ? 'opacity-90' : 'text-gray-500')}>{loading ? '–' : n}</span>
              </button>
            );
          })}
        </div>
        {/* Flag chips — multi-select, AND-ed with the bucket filter. */}
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap items-center" role="group" aria-label="Flag filter">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 whitespace-nowrap mr-0.5">Flags</span>
          {FLAG_KEYS.map(k => {
            const meta = FLAG_META[k];
            const active = flags.has(k);
            const n = flagCounts[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFlags(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; })}
                aria-pressed={active}
                title={meta.desc}
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-[11px] font-medium whitespace-nowrap transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                  active ? cn('ring-2 ring-[#B91C1C]/30', meta.chip) : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
                  !active && n === 0 && 'text-gray-400',
                )}
              >
                {k === 'member' && <Crown className="h-3 w-3" aria-hidden="true" />}
                {k === 'protected' && <Shield className="h-3 w-3" aria-hidden="true" />}
                {meta.label}
                <span className="tabular-nums opacity-70">{loading ? '–' : n}</span>
              </button>
            );
          })}
          {flags.size > 0 && (
            <button type="button" onClick={() => setFlags(new Set())} className="text-[11px] text-gray-500 underline whitespace-nowrap h-8 px-1">Clear flags</button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading && allPatients.length === 0 ? (
        <LoadingRows />
      ) : filtered.length === 0 ? (
        <EmptyState
          filterLabel={activeFilter.label}
          filterDesc={activeFilter.desc}
          hasSearch={search.trim() !== ''}
          hasFlags={flags.size > 0}
          total={allPatients.length}
          onReset={() => { setFilter('all'); setFlags(new Set()); setSearch(''); }}
          onCreate={() => { setCreateError(''); setCreateOpen(true); }}
        />
      ) : lanes ? (
        <div className="space-y-5">
          <section aria-labelledby="lane-action">
            <LaneHeader id="lane-action" title="Needs action" count={lanes.action.length} tone="red" />
            <PatientRows rows={lanes.action} ctx={ctx} handlers={handlers} />
          </section>
          {lanes.rest.length > 0 && (
            <section aria-labelledby="lane-rest">
              <LaneHeader id="lane-rest" title="Everyone else" count={lanes.rest.length} tone="gray" />
              <PatientRows rows={lanes.rest} ctx={ctx} handlers={handlers} />
            </section>
          )}
        </div>
      ) : (
        <PatientRows rows={filtered} ctx={ctx} handlers={handlers} />
      )}

      <p className="text-[11px] text-gray-400">
        Showing {filtered.length} of {allPatients.length} patient{allPatients.length === 1 ? '' : 's'}
      </p>

      {/* Row-level quick actions */}
      <ScheduleAppointmentModal
        open={scheduleOpen}
        onClose={() => { setScheduleOpen(false); setActionPatient(null); }}
        onCreated={() => { setScheduleOpen(false); setActionPatient(null); refresh(); }}
        prefilledPatient={actionPatient ? toPrefilledPatient(actionPatient) : null}
      />
      <SendBookingLinkModal
        open={sendLinkOpen}
        onClose={() => { setSendLinkOpen(false); setActionPatient(null); }}
        patient={actionPatient ? { id: actionPatient.id, firstName: actionPatient.first_name || '', lastName: actionPatient.last_name || '', email: actionPatient.email, phone: actionPatient.phone } : null}
      />

      {/* Add patient */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-[#B91C1C]" aria-hidden="true" /> Add patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>First name *</Label><Input value={newPatient.firstName} onChange={e => setNewPatient(p => ({ ...p, firstName: e.target.value }))} placeholder="John" /></div>
              <div><Label>Last name *</Label><Input value={newPatient.lastName} onChange={e => setNewPatient(p => ({ ...p, lastName: e.target.value }))} placeholder="Smith" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={newPatient.email} onChange={e => setNewPatient(p => ({ ...p, email: e.target.value }))} placeholder="john@email.com" /></div>
              <div><Label>Phone</Label><Input type="tel" value={newPatient.phone} onChange={e => setNewPatient(p => ({ ...p, phone: e.target.value }))} placeholder="4071234567" /></div>
            </div>
            <div><Label>Date of birth</Label><Input type="date" value={newPatient.dob} onChange={e => setNewPatient(p => ({ ...p, dob: e.target.value }))} /></div>

            <div className="border-t pt-3">
              <p className="text-sm font-semibold mb-2">Address</p>
              <div className="space-y-3">
                <div>
                  <Label>Street</Label>
                  <AddressAutocomplete
                    value={newPatient.address}
                    onChange={v => setNewPatient(p => ({ ...p, address: v }))}
                    onPlaceSelected={(place) => {
                      setNewPatient(p => ({ ...p, address: place.street || place.address, city: place.city || p.city, state: place.state || p.state, zipcode: place.zipCode || p.zipcode }));
                    }}
                    placeholder="Start typing address — Google will suggest"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>City</Label><Input value={newPatient.city} onChange={e => setNewPatient(p => ({ ...p, city: e.target.value }))} placeholder="Orlando" /></div>
                  <div><Label>State</Label><Input value={newPatient.state} maxLength={2} onChange={e => setNewPatient(p => ({ ...p, state: e.target.value }))} /></div>
                  <div><Label>ZIP</Label><Input value={newPatient.zipcode} onChange={e => setNewPatient(p => ({ ...p, zipcode: e.target.value }))} placeholder="32801" /></div>
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-semibold mb-2">Insurance</p>
              <div className="space-y-3">
                <div><Label>Provider</Label><Input value={newPatient.insuranceProvider} onChange={e => setNewPatient(p => ({ ...p, insuranceProvider: e.target.value }))} placeholder="Blue Cross" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Member ID</Label><Input value={newPatient.insuranceMemberId} onChange={e => setNewPatient(p => ({ ...p, insuranceMemberId: e.target.value }))} /></div>
                  <div><Label>Group #</Label><Input value={newPatient.insuranceGroup} onChange={e => setNewPatient(p => ({ ...p, insuranceGroup: e.target.value }))} /></div>
                </div>
              </div>
            </div>

            {createError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700" role="alert">{createError}</div>
            )}

            <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11" disabled={!newPatient.firstName.trim() || !newPatient.lastName.trim() || isCreating} onClick={createPatient}>
              {isCreating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> Creating…</> : 'Create patient'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
  <div className="space-y-1.5" aria-busy="true" aria-label="Loading patients">
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

const EmptyState: React.FC<{ filterLabel: string; filterDesc: string; hasSearch: boolean; hasFlags: boolean; total: number; onReset: () => void; onCreate: () => void }> =
  ({ filterLabel, filterDesc, hasSearch, hasFlags, total, onReset, onCreate }) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center">
      <Users className="h-10 w-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
      {total === 0 ? (
        <>
          <p className="text-sm font-semibold text-gray-700">No patients yet.</p>
          <p className="text-xs text-gray-500 mt-1">Patients appear here when they book, when a provider sends an order, or when you add one.</p>
          <Button size="sm" className="mt-3 text-xs h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5" onClick={onCreate}><UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Add patient</Button>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-700">
            {hasSearch ? 'No patients match your search.' : hasFlags ? `Nothing in "${filterLabel}" with those flags.` : `Nothing in "${filterLabel}".`}
          </p>
          <p className="text-xs text-gray-500 mt-1">{hasSearch ? 'Try a name, email, phone, address or date of birth.' : filterDesc}</p>
          <Button variant="outline" size="sm" className="mt-3 text-xs h-9" onClick={onReset}>Show all {total} patients</Button>
        </>
      )}
    </CardContent>
  </Card>
);

/** One bucket pill + a one-line detail (next visit / balance / last visit). */
const StatusPill: React.FC<{ bucket: PatientBucket; stats: PatientStats | undefined; className?: string }> = ({ bucket, stats, className }) => {
  const meta = BUCKET_META[bucket];
  let text: string = meta.label;
  if (bucket === 'balance_due' && stats) text = `Balance $${stats.balanceDue.toFixed(0)}`;
  if (bucket === 'upcoming' && stats?.next) {
    const d = daysFromToday(apptDay(stats.next));
    text = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `Upcoming · ${fmtDay(apptDay(stats.next), 'MMM d')}`;
  }
  if (bucket === 'unresolved_visit' && stats?.unresolved) {
    const d = daysFromToday(apptDay(stats.unresolved));
    text = `Unresolved · ${d !== null ? `${Math.abs(d)}d ago` : ''}`;
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 h-6 rounded-full border text-[11px] font-semibold whitespace-nowrap', meta.pill, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {text}
    </span>
  );
};

const TierPills: React.FC<{ p: PatientRow; tier: MemberTier | undefined; stats: PatientStats | undefined; small?: boolean }> = ({ p, tier, stats, small }) => (
  <>
    {tier && (
      <span title={`${tier} member`} className={cn('inline-flex items-center gap-0.5 rounded-full font-bold uppercase tracking-wide', small ? 'px-1.5 h-5 text-[9px]' : 'px-2 h-5 text-[10px]', tierBadgeClass(tier))}>
        <Crown className="h-2.5 w-2.5" aria-hidden="true" /> {tier}
      </span>
    )}
    {stats?.isProtected && !tier && (
      <span title="Protected from auto-cancel — not a paid member" className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-300">
        <Shield className="h-2.5 w-2.5" aria-hidden="true" /> Protected
      </span>
    )}
    {!(p.phone || '').trim() && !(p.email || '').trim() && (
      <span title="No phone or email on file" className="inline-flex items-center px-1.5 h-5 rounded-full text-[9px] font-semibold bg-red-50 text-red-700 border border-red-200">No contact</span>
    )}
  </>
);

const LastVisit: React.FC<{ stats: PatientStats | undefined }> = ({ stats }) => {
  if (!stats || stats.total === 0) return <span className="text-gray-400">Never</span>;
  if (stats.last) return <span>{fmtDay(apptDay(stats.last), 'MMM d, yyyy')}</span>;
  return <span className="text-gray-400">No completed visit</span>;
};

const PrimaryAction: React.FC<{ p: PatientRow; bucket: PatientBucket; h: RowHandlers; className?: string }> = ({ p, bucket, h, className }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const reachable = !!(p.email || p.phone);
  if ((bucket === 'never_booked' || bucket === 'active') && reachable) {
    return (
      <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onSendLink(p); }}>
        <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Send booking link
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onOpen(p); }}>
      <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Open chart
    </Button>
  );
};

/** Overflow menu — every secondary action in one predictable place. */
const RowMenu: React.FC<{ p: PatientRow; h: RowHandlers; className?: string }> = ({ p, h, className }) => {
  const addr = [p.address, [p.city, p.state, p.zipcode].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${fullName(p)}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => h.onOpen(p)}><FileText className="h-4 w-4 mr-2" aria-hidden="true" /> Open chart</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => h.onSchedule(p)}><CalendarPlus className="h-4 w-4 mr-2" aria-hidden="true" /> Schedule visit</DropdownMenuItem>
        {(p.email || p.phone) && (
          <DropdownMenuItem onSelect={() => h.onSendLink(p)}><Zap className="h-4 w-4 mr-2" aria-hidden="true" /> Send booking link</DropdownMenuItem>
        )}
        {(p.phone || p.email) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openMessageThread(p.phone, p.email)}><MessageSquare className="h-4 w-4 mr-2" aria-hidden="true" /> Message</DropdownMenuItem>
          </>
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
        {(p.phone || p.email || addr) && <DropdownMenuSeparator />}
        {p.phone && <DropdownMenuItem onSelect={() => copyText(p.phone!, 'Phone')}><Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy phone</DropdownMenuItem>}
        {p.email && <DropdownMenuItem onSelect={() => copyText(p.email!, 'Email')}><Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy email</DropdownMenuItem>}
        {addr && <DropdownMenuItem onSelect={() => copyText(addr, 'Address')}><MapPin className="h-4 w-4 mr-2" aria-hidden="true" /> Copy address</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const rowKeyHandler = (open: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return; // let buttons/links inside handle their own keys
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
};

// ──────────────────────────────────────────────────────────────────
// Rows — table on ≥md, cards below. One component so the flat list and
// the lanes render identically.
// ──────────────────────────────────────────────────────────────────
const PatientRows: React.FC<{ rows: PatientRow[]; ctx: RowCtx; handlers: RowHandlers }> = ({ rows, ctx, handlers }) => {
  const tierFor = (p: PatientRow) => (p.user_id ? ctx.tierOf.get(p.user_id) : undefined);
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500 pl-4">Patient</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500">Status</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500">Contact</TableHead>
              <TableHead className="hidden lg:table-cell h-9 text-[11px] uppercase tracking-wider text-gray-500">Address</TableHead>
              <TableHead className="hidden xl:table-cell h-9 text-[11px] uppercase tracking-wider text-gray-500 whitespace-nowrap">DOB</TableHead>
              <TableHead className="hidden lg:table-cell h-9 text-[11px] uppercase tracking-wider text-gray-500 whitespace-nowrap">Last visit</TableHead>
              {/* Actions stay pinned to the right edge so they are never scrolled out of view. */}
              <TableHead className="sticky right-0 z-10 bg-gray-50 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)] h-9 text-[11px] uppercase tracking-wider text-gray-500 text-right pr-3">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(p => {
              const b = ctx.bucketOf.get(p.id) || 'never_booked';
              const s = ctx.statsOf.get(p.id);
              const tier = tierFor(p);
              const open = () => handlers.onOpen(p);
              return (
                <TableRow
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={rowKeyHandler(open)}
                  aria-label={`${fullName(p)}, ${BUCKET_META[b].label}. Open chart`}
                  className={cn(
                    'cursor-pointer bg-white focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40',
                    b === 'balance_due' && 'border-l-4 border-l-red-500',
                    b === 'unresolved_visit' && 'border-l-4 border-l-orange-400',
                  )}
                >
                  <TableCell className="py-2.5 pl-4 align-top">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="text-sm font-semibold text-gray-900 truncate">{fullName(p)}</span>
                      <TierPills p={p} tier={tier} stats={s} small />
                    </div>
                    {s && s.total > 0 && <p className="text-[11px] text-gray-500">{s.total} visit{s.total === 1 ? '' : 's'}{s.completed !== s.total ? ` · ${s.completed} completed` : ''}</p>}
                  </TableCell>
                  <TableCell className="py-2.5 align-top"><StatusPill bucket={b} stats={s} /></TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 max-w-[220px]">
                    {p.phone && <span className="block truncate">{p.phone}</span>}
                    {p.email && <span className="block truncate text-gray-500">{p.email}</span>}
                    {!p.phone && !p.email && <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell py-2.5 align-top text-xs text-gray-700 max-w-[220px]">
                    {p.address ? <span className="block truncate">{p.address}{p.city ? `, ${p.city}` : ''}</span> : <span className="text-amber-700">Missing</span>}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell py-2.5 align-top text-xs text-gray-700 whitespace-nowrap">
                    {p.date_of_birth ? fmtDay(p.date_of_birth) : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell py-2.5 align-top text-xs text-gray-700 whitespace-nowrap"><LastVisit stats={s} /></TableCell>
                  <TableCell className="sticky right-0 z-10 py-2 align-top pr-3 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">
                    <div className="flex items-center justify-end gap-1">
                      <PrimaryAction p={p} bucket={b} h={handlers} className="h-9" />
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
          const b = ctx.bucketOf.get(p.id) || 'never_booked';
          const s = ctx.statsOf.get(p.id);
          const tier = tierFor(p);
          const open = () => handlers.onOpen(p);
          return (
            <Card
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={rowKeyHandler(open)}
              aria-label={`${fullName(p)}, ${BUCKET_META[b].label}. Open chart`}
              className={cn(
                'shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                b === 'balance_due' && 'border-l-4 border-l-red-500',
                b === 'unresolved_visit' && 'border-l-4 border-l-orange-400',
              )}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{fullName(p)}</span>
                      <TierPills p={p} tier={tier} stats={s} small />
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">{p.phone || p.email || 'No contact on file'}</p>
                  </div>
                  <StatusPill bucket={b} stats={s} />
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>Last visit <LastVisit stats={s} /></span>
                  <span className="text-gray-300">·</span>
                  <span className={cn(!p.address && 'text-amber-700')}>{p.address ? `${p.address}${p.city ? `, ${p.city}` : ''}` : 'No address'}</span>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <PrimaryAction p={p} bucket={b} h={handlers} className="h-11 flex-1 justify-center" />
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

export default PatientProfileTab;
