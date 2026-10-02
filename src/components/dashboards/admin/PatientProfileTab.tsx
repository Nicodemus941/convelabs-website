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
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
  BUCKET_META, DUP_REASON_LABEL, FLAG_KEYS, FLAG_META, NEEDS_ACTION, PATIENT_FILTERS, PATIENT_TILE_KEYS, PATIENT_TILE_STYLE,
  type ApptLite, type DuplicateHit, type MemberTier, type PatientBucket, type PatientFilterKey, type PatientFlag, type PatientRow, type PatientStats,
  apptDay, buildDuplicateIndex, computeStats, dataQualityIssues, daysFromToday, derivePatientBucket, digits, dobIssue, fmtDay, fullName, looksLikeOrganization, matchesSearch,
  openMessageThread, stashAdminPrefill, tierBadgeClass, todayKey, toPrefilledPatient, validatePatientFields,
} from './patientDirectory';
import { InlineError, ModalTitle } from './chartModalKit';

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
  dupIndex: Map<string, DuplicateHit[]>;
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

  // Shared email / phone / name+DOB across records — read-only detection.
  const dupIndex = useMemo(() => buildDuplicateIndex(allPatients), [allPatients]);
  const flagCtx = useCallback((p: PatientRow) => ({ stats: statsOf.get(p.id), tier: tierFor(p), dups: dupIndex.get(p.id) }), [statsOf, tierFor, dupIndex]);

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
      const ctx = flagCtx(p);
      for (const k of FLAG_KEYS) if (FLAG_META[k].test(p, ctx)) c[k]++;
    }
    return c;
  }, [allPatients, flagCtx]);

  const filtered = useMemo(() => {
    const def = PATIENT_FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    const qd = digits(q);
    const list = allPatients.filter(p => {
      if (!def.match(bucketOf.get(p.id)!)) return false;
      if (flags.size > 0) {
        const ctx = flagCtx(p);
        for (const k of flags) if (!FLAG_META[k].test(p, ctx)) return false;
      }
      return matchesSearch(p, q, qd);
    });
    const lastDay = (p: PatientRow) => apptDay(statsOf.get(p.id)?.last || { appointment_date: null }) || '';
    if (sort === 'recent') list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    else if (sort === 'last_visit') list.sort((a, b) => lastDay(b).localeCompare(lastDay(a)) || fullName(a).localeCompare(fullName(b)));
    // 'name' keeps the server order (last name, first name).
    return list;
  }, [allPatients, filter, flags, search, sort, bucketOf, statsOf, flagCtx]);

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
  const ctx: RowCtx = { statsOf, bucketOf, tierOf, dupIndex };

  // Add-patient: validation + live "already on file?" check against the
  // loaded directory (email / phone / name+DOB / name) before anything is inserted.
  const newErrors = useMemo(() => validatePatientFields(newPatient), [newPatient]);
  const newDobWarn = useMemo(() => { const i = dobIssue(newPatient.dob || null); return i && i.severity === 'warn' ? i : null; }, [newPatient.dob]);
  const newMatches = useMemo<DuplicateHit[]>(() => {
    const email = newPatient.email.trim().toLowerCase();
    const ph = digits(newPatient.phone);
    const name = `${newPatient.firstName} ${newPatient.lastName}`.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!email && ph.length < 10 && name.length < 4) return [];
    const hits: DuplicateHit[] = [];
    for (const p of allPatients) {
      if (email && (p.email || '').trim().toLowerCase() === email) { hits.push({ reason: 'email', other: p }); continue; }
      if (ph.length >= 10 && digits(p.phone).slice(-10) === ph.slice(-10)) { hits.push({ reason: 'phone', other: p }); continue; }
      if (name.length >= 4 && fullName(p).toLowerCase().replace(/\s+/g, ' ') === name) {
        hits.push({ reason: newPatient.dob && p.date_of_birth === newPatient.dob ? 'name_dob' : 'name', other: p });
      }
    }
    return hits.slice(0, 5);
  }, [newPatient, allPatients]);
  const newBlockingMatch = newMatches.find(h => h.reason === 'email') || null;
  const newLooksLikeOrg = looksLikeOrganization({ first_name: newPatient.firstName, last_name: newPatient.lastName });

  const createPatient = async () => {
    setCreateError('');
    if (Object.keys(newErrors).length > 0) { setCreateError(Object.values(newErrors).join(' ')); return; }
    if (newBlockingMatch) { setCreateError(`${fullName(newBlockingMatch.other)} already has this email — open their chart instead.`); return; }
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
        duplicates={dupIndex.get(selectedPatient.id)}
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
            {!loading && (flagCounts.data_quality > 0 || flagCounts.duplicate > 0) && (
              <button type="button" className="ml-1 font-medium text-amber-800 underline decoration-dotted underline-offset-2" onClick={() => { setFilter('all'); setFlags(new Set<PatientFlag>(flagCounts.data_quality > 0 ? ['data_quality'] : ['duplicate'])); }}>
                {flagCounts.data_quality} data check{flagCounts.data_quality === 1 ? '' : 's'}{flagCounts.duplicate > 0 ? ` · ${flagCounts.duplicate} possible duplicate${flagCounts.duplicate === 1 ? '' : 's'}` : ''}.
              </button>
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

      {/* Add patient — scrollable body, pinned footer, live duplicate check. */}
      <Dialog open={createOpen} onOpenChange={(v) => { if (!isCreating) setCreateOpen(v); }}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
          <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b flex-shrink-0">
            <ModalTitle icon={UserPlus} title="Add patient" context="A person who gets drawn — not a clinic. Practices live under Organizations." />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="First name" required error={newPatient.firstName ? newErrors.firstName : undefined}><Input value={newPatient.firstName} onChange={e => setNewPatient(p => ({ ...p, firstName: e.target.value }))} placeholder="John" className="h-10 sm:h-9" autoFocus /></Field>
              <Field label="Last name" required error={newPatient.lastName ? newErrors.lastName : undefined}><Input value={newPatient.lastName} onChange={e => setNewPatient(p => ({ ...p, lastName: e.target.value }))} placeholder="Smith" className="h-10 sm:h-9" /></Field>
            </div>
            {newLooksLikeOrg && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2" role="status">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p><span className="font-semibold">This name reads like a clinic, not a person.</span> Partner practices belong under Organizations; add the actual people being drawn as patients and attach their visits to the practice there.</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Email" error={newErrors.email}><Input type="email" inputMode="email" autoComplete="off" value={newPatient.email} onChange={e => setNewPatient(p => ({ ...p, email: e.target.value }))} placeholder="john@email.com" className="h-10 sm:h-9" /></Field>
              <Field label="Phone" error={newErrors.phone}><Input type="tel" inputMode="tel" autoComplete="off" value={newPatient.phone} onChange={e => setNewPatient(p => ({ ...p, phone: e.target.value }))} placeholder="(407) 123-4567" className="h-10 sm:h-9" /></Field>
            </div>
            <Field label="Date of birth" hint="labs need it on the requisition" error={newErrors.dob} warn={newDobWarn?.detail}>
              <Input type="date" max={todayKey()} value={newPatient.dob} onChange={e => setNewPatient(p => ({ ...p, dob: e.target.value }))} className="h-10 sm:h-9 max-w-[220px]" />
            </Field>

            {newMatches.length > 0 && (
              <div className={cn('rounded-lg border p-3 space-y-2', newBlockingMatch ? 'border-red-300 bg-red-50' : 'border-fuchsia-300 bg-fuchsia-50')} role="status">
                <p className={cn('text-xs font-semibold', newBlockingMatch ? 'text-red-900' : 'text-fuchsia-900')}>
                  {newBlockingMatch ? 'Already on file — this email belongs to:' : 'Possibly already on file — check before creating a duplicate:'}
                </p>
                <ul className="space-y-1.5">
                  {newMatches.map(h => (
                    <li key={h.other.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-gray-800">
                        <span className="font-medium">{fullName(h.other)}</span>
                        <span className="text-gray-500"> · {DUP_REASON_LABEL[h.reason]}{h.other.date_of_birth ? ` · DOB ${fmtDay(h.other.date_of_birth)}` : ''}{h.other.phone ? ` · ${h.other.phone}` : ''}</span>
                      </span>
                      <Button size="sm" variant="outline" className="h-8 text-xs flex-shrink-0" onClick={() => { setCreateOpen(false); openChart(h.other); }}>Open chart</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t pt-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2 flex items-center gap-1.5"><MapPin className="h-3 w-3" aria-hidden="true" /> Address <span className="text-gray-400 normal-case font-normal">(where we draw)</span></p>
              <div className="space-y-3">
                <div className="min-w-0">
                  <AddressAutocomplete
                    value={newPatient.address}
                    onChange={v => setNewPatient(p => ({ ...p, address: v }))}
                    onPlaceSelected={(place) => {
                      setNewPatient(p => ({ ...p, address: place.street || place.address, city: place.city || p.city, state: place.state || p.state, zipcode: place.zipCode || p.zipcode }));
                    }}
                    placeholder="Start typing address — Google will suggest"
                    className="h-10 sm:h-9"
                  />
                </div>
                <div className="grid grid-cols-[1fr_64px_96px] gap-2">
                  <Input value={newPatient.city} onChange={e => setNewPatient(p => ({ ...p, city: e.target.value }))} placeholder="City" aria-label="City" className="h-10 sm:h-9 min-w-0" />
                  <Input value={newPatient.state} maxLength={2} onChange={e => setNewPatient(p => ({ ...p, state: e.target.value.toUpperCase() }))} placeholder="FL" aria-label="State" className="h-10 sm:h-9 min-w-0 uppercase" />
                  <Input value={newPatient.zipcode} inputMode="numeric" onChange={e => setNewPatient(p => ({ ...p, zipcode: e.target.value }))} placeholder="ZIP" aria-label="ZIP" className="h-10 sm:h-9 min-w-0" />
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2 flex items-center gap-1.5"><Shield className="h-3 w-3" aria-hidden="true" /> Insurance <span className="text-gray-400 normal-case font-normal">(optional — blank = self-pay)</span></p>
              <div className="space-y-2">
                <Input value={newPatient.insuranceProvider} onChange={e => setNewPatient(p => ({ ...p, insuranceProvider: e.target.value }))} placeholder="Insurance provider" aria-label="Insurance provider" className="h-10 sm:h-9" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={newPatient.insuranceMemberId} onChange={e => setNewPatient(p => ({ ...p, insuranceMemberId: e.target.value }))} placeholder="Member ID" aria-label="Member ID" className="h-10 sm:h-9 min-w-0" />
                  <Input value={newPatient.insuranceGroup} onChange={e => setNewPatient(p => ({ ...p, insuranceGroup: e.target.value }))} placeholder="Group #" aria-label="Group number" className="h-10 sm:h-9 min-w-0" />
                </div>
              </div>
            </div>

            <InlineError message={createError || null} />
          </div>
          <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-3 border-t bg-white flex-shrink-0">
            <Button variant="outline" className="h-10 sm:h-9" onClick={() => setCreateOpen(false)} disabled={isCreating}>Cancel</Button>
            <Button className="h-10 sm:h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5" disabled={!newPatient.firstName.trim() || !newPatient.lastName.trim() || Object.keys(newErrors).length > 0 || !!newBlockingMatch || isCreating} onClick={createPatient}>
              {isCreating ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Creating…</> : <><UserPlus className="h-4 w-4" aria-hidden="true" /> Create patient</>}
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

/** Labelled field with inline error / warning — shared by the Add patient form. */
const Field: React.FC<{ label: string; required?: boolean; hint?: string; error?: string; warn?: string; children: React.ReactNode }> = ({ label, required, hint, error, warn, children }) => (
  <div className="space-y-1 min-w-0">
    <Label className="text-xs font-semibold text-gray-700">
      {label}{required && <span className="text-[#B91C1C]"> *</span>}
      {hint && <span className="font-normal text-gray-400"> · {hint}</span>}
    </Label>
    {children}
    {error ? <p className="text-[11px] text-red-600">{error}</p> : warn ? <p className="text-[11px] text-amber-700">{warn}</p> : null}
  </div>
);

/** Amber "Data check" / fuchsia "Dup" pills — orthogonal to bucket + tier. */
const QualityPills: React.FC<{ p: PatientRow; dups: DuplicateHit[] | undefined }> = ({ p, dups }) => {
  const issues = dataQualityIssues(p);
  const strongDup = (dups || []).some(d => d.reason !== 'name');
  if (issues.length === 0 && !strongDup) return null;
  return (
    <>
      {issues.length > 0 && (
        <span title={issues.map(i => i.detail).join('\n')} className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full text-[9px] font-semibold bg-amber-50 text-amber-900 border border-amber-300">
          <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" /> {issues.length === 1 ? issues[0].label : `${issues.length} data checks`}
        </span>
      )}
      {strongDup && (
        <span title={`Possible duplicate — ${Array.from(new Set((dups || []).map(d => DUP_REASON_LABEL[d.reason]))).join(', ')}`} className="inline-flex items-center px-1.5 h-5 rounded-full text-[9px] font-semibold bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-300">Possible dup</span>
      )}
    </>
  );
};

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
                      <QualityPills p={p} dups={ctx.dupIndex.get(p.id)} />
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
                      <QualityPills p={p} dups={ctx.dupIndex.get(p.id)} />
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
