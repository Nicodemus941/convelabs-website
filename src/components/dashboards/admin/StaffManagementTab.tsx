/**
 * StaffManagementTab — the ConveLabs team roster (staff_profiles) plus the
 * schedule / time-off blocks (time_blocks), in the shared admin list language
 * (see adminListKit + LabOrdersTab for the reference).
 *
 * Rendered via Dashboard.tsx SECTION_SCREENS["team/staff"] (nav label
 * "Phlebotomists"). Visible to both admin roles; managing the roster (add /
 * invite / remove / pay rates / time blocks) gates on `super_admin` inside
 * this file — the two `office_manager` accounts are partner-clinic staff.
 *
 * Every staff row maps to exactly ONE bucket (deriveBucket):
 *
 *   attention  → compliance not cleared, or a phlebotomist whose Stripe
 *                Connect payouts aren't set up (needs action)
 *   phleb      → draws patients (specialty phlebotomy / mobile phlebotomy)
 *   office     → office manager / admin staff
 *   other      → nursing, lab tech, anything else
 *
 * ⚠ Known limitation (flagged, not rewritten here): "Add staff" calls
 * `supabase.auth.admin.createUser` from the browser. That endpoint needs the
 * service-role key, so with the anon key it fails ("User not allowed"). The
 * token-based "Send offer" flow (InviteStaffDialog → create-staff-invitation
 * edge function) is the working path.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  UserPlus, Users, Trash2, Clock, CalendarOff, Mail, Loader2, Send, MoreHorizontal, Phone, Copy,
  ChevronRight, ChevronDown, AlertTriangle, Briefcase, Wallet, ShieldCheck, Repeat, Building2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { toast } from 'sonner';
import InviteStaffDialog from './InviteStaffDialog';
import {
  ago, copyText, rowKeyHandler, plural, TH, TH_STICKY, TD_STICKY, ROW_FOCUS, CARD_FOCUS,
  PageHeader, RefreshButton, StatTiles, FilterChips, SearchBox, SegmentedControl, LaneHeader, LoadingRows,
  EmptyState, ErrorCard, ListFooter, Pill, Field, SectionLabel, DetailDrawer, QuickActions, Notice,
  type TileDef, type ChipDef,
} from './adminListKit';

// Untyped table access — time_blocks isn't in the generated Database type,
// and several staff_profiles columns we read aren't either.
const db = supabase as any;

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────
export interface StaffMember {
  id: string;
  user_id: string;
  specialty: string | null;
  pay_rate: number;
  premium_pay_rate: number | null;
  bio: string | null;
  photo_url: string | null;
  phone: string | null;
  hired_date: string | null;
  compliance_status: string | null;
  compliance_cleared_at: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarded_at: string | null;
  stripe_connect_payouts_enabled: boolean | null;
  stripe_connect_disabled_reason: string | null;
  exclude_from_auto_assignment: boolean | null;
  receives_owner_alerts: boolean | null;
  certification_details: any;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
  updated_at: string | null;
  // Enriched
  name: string;
  completed_draws: number;
  last_draw_at: string | null;
}

export interface TimeBlock {
  id: string;
  staff_id: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  block_type: string | null;
  start_time: string | null;
  end_time: string | null;
  recurring: boolean | null;
  recurring_day: string | null;
  created_at: string | null;
}

const ROLES = [
  { value: 'phlebotomist', label: 'Phlebotomist' },
  { value: 'office_manager', label: 'Office Manager / Admin' },
  { value: 'staff', label: 'General Staff' },
];

const SPECIALTIES = [
  { value: 'phlebotomy', label: 'Phlebotomy' },
  { value: 'office_manager', label: 'Office Management' },
  { value: 'nursing', label: 'Nursing' },
  { value: 'lab_tech', label: 'Lab Technician' },
];

const SPECIALTY_LABEL: Record<string, string> = {
  phlebotomy: 'Phlebotomy', 'mobile phlebotomy': 'Mobile phlebotomy', office_manager: 'Office management',
  nursing: 'Nursing', lab_tech: 'Lab technician',
};
const specialtyLabel = (s: string | null) => (s ? SPECIALTY_LABEL[s.toLowerCase()] || s : 'No specialty');

export type Kind = 'phleb' | 'office' | 'other';
export function kindOf(s: StaffMember): Kind {
  const sp = (s.specialty || '').toLowerCase();
  if (sp.includes('phleb')) return 'phleb';
  if (sp.includes('office') || sp.includes('admin')) return 'office';
  return 'other';
}
const KIND_LABEL: Record<Kind, string> = { phleb: 'Phlebotomist', office: 'Office & admin', other: 'Other staff' };

/** Things that block this person from working / getting paid. */
export function issuesOf(s: StaffMember): string[] {
  const out: string[] = [];
  if ((s.compliance_status || 'pending') !== 'cleared') out.push('Compliance not cleared');
  if (kindOf(s) === 'phleb' && !s.exclude_from_auto_assignment) {
    if (!s.stripe_connect_account_id) out.push('No Stripe Connect account — payouts blocked');
    else if (!s.stripe_connect_onboarded_at) out.push('Stripe Connect onboarding not finished');
    else if (s.stripe_connect_payouts_enabled === false) out.push(`Stripe payouts disabled${s.stripe_connect_disabled_reason ? ` · ${s.stripe_connect_disabled_reason}` : ''}`);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
// Buckets — ONE per row.
// ──────────────────────────────────────────────────────────────────
export type Bucket = 'attention' | Kind;

export function deriveBucket(s: StaffMember): Bucket {
  if (issuesOf(s).length > 0) return 'attention';
  return kindOf(s);
}

const NEEDS_ACTION: ReadonlySet<Bucket> = new Set<Bucket>(['attention']);

interface BucketMeta { label: string; desc: string; pill: string; tile: string; dot: string }

const BUCKET_META: Record<Bucket, BucketMeta> = {
  attention: {
    label: 'Needs attention', desc: 'Compliance pending or payouts not set up',
    pill: 'bg-red-100 text-red-800 border-red-200', tile: 'border-red-300 bg-red-50 text-red-800', dot: 'bg-red-500',
  },
  phleb: {
    label: 'Phlebotomist', desc: 'Draws patients — cleared and payable',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', tile: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500',
  },
  office: {
    label: 'Office & admin', desc: 'Office manager / admin staff',
    pill: 'bg-blue-100 text-blue-800 border-blue-200', tile: 'border-blue-300 bg-blue-50 text-blue-800', dot: 'bg-blue-500',
  },
  other: {
    label: 'Other staff', desc: 'Nursing, lab tech and everything else',
    pill: 'bg-gray-100 text-gray-700 border-gray-200', tile: 'border-gray-300 bg-gray-100 text-gray-800', dot: 'bg-gray-400',
  },
};

type FilterKey = 'all' | 'needs_action' | Bucket;

const FILTERS: Array<ChipDef<FilterKey> & { match: (b: Bucket) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Everyone on the team', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: BUCKET_META.attention.desc, match: b => NEEDS_ACTION.has(b) },
  { key: 'phleb', label: 'Phlebotomists', desc: BUCKET_META.phleb.desc, dot: BUCKET_META.phleb.dot, match: b => b === 'phleb' },
  { key: 'office', label: 'Office & admin', desc: BUCKET_META.office.desc, dot: BUCKET_META.office.dot, match: b => b === 'office' },
  { key: 'other', label: 'Other', desc: BUCKET_META.other.desc, dot: BUCKET_META.other.dot, match: b => b === 'other' },
];

const TILES: TileDef<FilterKey>[] = [
  { key: 'needs_action', label: 'Needs attention', desc: BUCKET_META.attention.desc, style: BUCKET_META.attention.tile, alert: true },
  { key: 'phleb', label: 'Phlebotomists', desc: BUCKET_META.phleb.desc, style: BUCKET_META.phleb.tile },
  { key: 'office', label: 'Office & admin', desc: BUCKET_META.office.desc, style: BUCKET_META.office.tile },
  { key: 'other', label: 'Other staff', desc: BUCKET_META.other.desc, style: BUCKET_META.other.tile },
];

const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toFixed(Number(n) % 1 === 0 ? 0 : 2)}`);
const dateOnly = (d: string | null | undefined, fmt = 'MMM d, yyyy') => {
  if (!d) return null;
  const dt = new Date(d.length === 10 ? d + 'T12:00:00' : d);
  return isValid(dt) ? format(dt, fmt) : null;
};
const todayKey = () => format(new Date(), 'yyyy-MM-dd');

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────
const StaffManagementTab: React.FC = () => {
  const { user } = useAuth();
  // Roster management (add / invite / remove / pay rates / time blocks) is
  // admin-only. Office managers are partner-clinic staff.
  const canManage = user?.role === 'super_admin';

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [view, setView] = useState<'roster' | 'schedule'>('roster');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    role: 'phlebotomist', specialty: 'phlebotomy',
    payRate: '35', premiumRate: '55', bio: '',
  });

  const fetchTimeBlocks = useCallback(async () => {
    const { data, error } = await db.from('time_blocks').select('*').order('start_date', { ascending: false });
    if (error) { console.error('[StaffManagementTab] time_blocks:', error); return; }
    setTimeBlocks((data as TimeBlock[]) || []);
  }, []);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const { data: profiles, error } = await db
        .from('staff_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (profiles as any[]) || [];
      if (list.length === 0) { setStaff([]); return; }

      const userIds = list.map(p => p.user_id).filter(Boolean);
      const [{ data: userProfiles }, { data: draws }] = await Promise.all([
        db.from('user_profiles').select('id, full_name, phone').in('id', userIds),
        // Completed draws per phlebotomist. appointments.phlebotomist_id is
        // the auth user id, not the staff_profiles id.
        db.from('appointments').select('phlebotomist_id, appointment_date').eq('status', 'completed').in('phlebotomist_id', userIds).limit(5000),
      ]);
      const userMap = new Map<string, any>();
      ((userProfiles as any[]) || []).forEach(u => userMap.set(u.id, u));
      const drawCount = new Map<string, number>();
      const lastDraw = new Map<string, string>();
      ((draws as any[]) || []).forEach(a => {
        drawCount.set(a.phlebotomist_id, (drawCount.get(a.phlebotomist_id) || 0) + 1);
        if (a.appointment_date && (!lastDraw.has(a.phlebotomist_id) || a.appointment_date > lastDraw.get(a.phlebotomist_id)!)) lastDraw.set(a.phlebotomist_id, a.appointment_date);
      });

      setStaff(list.map(p => ({
        ...p,
        name: userMap.get(p.user_id)?.full_name || p.bio?.replace('ConveLabs Admin - ', '') || 'Staff member',
        phone: p.phone || userMap.get(p.user_id)?.phone || null,
        completed_draws: drawCount.get(p.user_id) || 0,
        last_draw_at: lastDraw.get(p.user_id) || null,
      })));
    } catch (err: any) {
      console.error('[StaffManagementTab] load failed:', err);
      setLastError(err?.message || String(err));
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => { fetchStaff(); fetchTimeBlocks(); }, [fetchStaff, fetchTimeBlocks]);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    const fresh = staff.find(s => s.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [staff]); // eslint-disable-line react-hooks/exhaustive-deps

  const bucketOf = useMemo(() => {
    const m = new Map<string, Bucket>();
    for (const s of staff) m.set(s.id, deriveBucket(s));
    return m;
  }, [staff]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map(f => [f.key, 0])) as Record<FilterKey, number>;
    for (const s of staff) {
      const b = bucketOf.get(s.id)!;
      for (const f of FILTERS) if (f.match(b)) c[f.key]++;
    }
    return c;
  }, [staff, bucketOf]);

  const filtered = useMemo(() => {
    const def = FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    return staff.filter(s => def.match(bucketOf.get(s.id)!) && (q === '' ||
      s.name.toLowerCase().includes(q) ||
      (s.specialty || '').toLowerCase().includes(q) ||
      (s.bio || '').toLowerCase().includes(q) ||
      (s.phone || '').includes(q)
    ));
  }, [staff, filter, search, bucketOf]);

  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(s => NEEDS_ACTION.has(bucketOf.get(s.id)!));
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(s => !NEEDS_ACTION.has(bucketOf.get(s.id)!)) };
  }, [filtered, filter, bucketOf]);

  const upcomingBlocks = useMemo(() => {
    const t = todayKey();
    return timeBlocks.filter(b => b.recurring || b.end_date >= t);
  }, [timeBlocks]);

  const resetForm = () => {
    setFormData({ firstName: '', lastName: '', email: '', phone: '', role: 'phlebotomist', specialty: 'phlebotomy', payRate: '35', premiumRate: '55', bio: '' });
  };

  // Direct add — existing flow, unchanged. See the file header: this calls the
  // admin auth API from the browser and fails with the anon key.
  const handleAddStaff = async () => {
    if (!formData.email || !formData.firstName) {
      toast.error('Name and email are required');
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: formData.email.trim().toLowerCase(),
        password: 'ConveLabs2026!Temp',
        email_confirm: false,
        user_metadata: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          full_name: `${formData.firstName} ${formData.lastName}`.trim(),
          role: formData.role,
        },
      });

      if (authError) {
        if (authError.message?.includes('already')) toast.error('This email is already registered');
        else if (/not allowed|service_role|403/i.test(authError.message || '')) toast.error('Direct add needs the admin API, which the browser can\'t call. Use "Send offer" instead.');
        else throw authError;
        setIsSubmitting(false);
        return;
      }

      const userId = authData.user?.id;
      if (!userId) throw new Error('No user ID returned');

      await db.from('staff_profiles').insert([{
        user_id: userId,
        pay_rate: parseFloat(formData.payRate) || 35,
        premium_pay_rate: parseFloat(formData.premiumRate) || null,
        specialty: formData.specialty,
        bio: formData.bio || `${formData.firstName} ${formData.lastName} - ${formData.role}`,
      }]);

      await db.from('user_profiles').upsert([{
        id: userId,
        full_name: `${formData.firstName} ${formData.lastName}`.trim(),
        phone: formData.phone || null,
      }]);

      await supabase.auth.resetPasswordForEmail(formData.email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      toast.success(`${formData.firstName} added! Email invite sent.`);
      setShowAddModal(false);
      resetForm();
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add staff');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveStaff = useCallback(async (s: StaffMember) => {
    if (!window.confirm(`Remove ${s.name} from the roster? Their login stays; only the staff profile (pay rate, assignments) is deleted.`)) return;
    setRemoving(s.id);
    try {
      const { error } = await db.from('staff_profiles').delete().eq('id', s.id);
      if (error) throw error;
      toast.success(`${s.name} removed from the roster`);
      setSelected(prev => (prev?.id === s.id ? null : prev));
      fetchStaff();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove staff member');
    } finally {
      setRemoving(null);
    }
  }, [fetchStaff]);

  const handlers: RowHandlers = { canManage, onOpen: setSelected, onRemove: handleRemoveStaff };
  const activeFilter = FILTERS.find(f => f.key === filter)!;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      <PageHeader
        icon={Briefcase}
        title="Team"
        subtitle={<>{loading ? 'Loading the roster…' : `${plural(staff.length, 'team member')} · ${plural(upcomingBlocks.length, 'upcoming time block')}.`}{counts.needs_action > 0 && <span className="ml-1 font-medium text-red-700">{counts.needs_action} need attention.</span>}</>}
        actions={
          <>
            <SegmentedControl
              options={[{ key: 'roster', label: 'Roster' }, { key: 'schedule', label: 'Schedule & time off' }]}
              value={view}
              onChange={v => setView(v)}
              ariaLabel="Team view"
            />
            <RefreshButton onClick={refresh} loading={loading} />
            {canManage && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-10 sm:h-9" onClick={() => setShowInviteModal(true)}>
                  <Send className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Send offer</span>
                </Button>
                <Button size="sm" className="gap-1.5 text-xs h-10 sm:h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={() => { resetForm(); setShowAddModal(true); }}>
                  <UserPlus className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Add staff</span>
                </Button>
              </>
            )}
          </>
        }
      />

      {lastError && <ErrorCard what="the team roster" message={lastError} onRetry={refresh} />}

      {view === 'roster' ? (
        <>
          <StatTiles tiles={TILES} counts={counts} active={filter} onSelect={k => setFilter(k)} loading={loading} ariaLabel="Team counts" />

          <div className="space-y-2">
            <SearchBox value={search} onChange={setSearch} placeholder="Search name, specialty, phone…" ariaLabel="Search team" />
            <FilterChips filters={FILTERS} counts={counts} active={filter} onSelect={k => setFilter(k)} ariaLabel="Team filter" />
          </div>

          {loading && staff.length === 0 ? (
            <LoadingRows label="Loading team" rows={3} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              emptyTitle="No team members yet."
              emptyHint={canManage ? 'Use "Send offer" to invite your first phlebotomist.' : 'Staff appear here once an offer is accepted.'}
              filterLabel={activeFilter.label}
              filterDesc={activeFilter.desc}
              hasSearch={search.trim() !== ''}
              searchHint="Try a name, specialty or phone."
              total={staff.length}
              noun="team members"
              onReset={() => { setFilter('all'); setSearch(''); }}
            />
          ) : lanes ? (
            <div className="space-y-5">
              <section aria-labelledby="lane-action">
                <LaneHeader id="lane-action" title="Needs action" count={lanes.action.length} tone="red" />
                <StaffRows rows={lanes.action} bucketOf={bucketOf} handlers={handlers} removing={removing} />
              </section>
              {lanes.rest.length > 0 && (
                <section aria-labelledby="lane-rest">
                  <LaneHeader id="lane-rest" title="Everything else" count={lanes.rest.length} tone="gray" />
                  <StaffRows rows={lanes.rest} bucketOf={bucketOf} handlers={handlers} removing={removing} />
                </section>
              )}
            </div>
          ) : (
            <StaffRows rows={filtered} bucketOf={bucketOf} handlers={handlers} removing={removing} />
          )}

          <ListFooter shown={filtered.length} total={staff.length} noun="team member" />
        </>
      ) : (
        <ScheduleView staff={staff} blocks={timeBlocks} canManage={canManage} onChanged={fetchTimeBlocks} />
      )}

      {selected && (
        <StaffDetailDrawer
          s={selected}
          bucket={bucketOf.get(selected.id) || deriveBucket(selected)}
          blocks={timeBlocks.filter(b => b.staff_id === selected.id)}
          canManage={canManage}
          removing={removing === selected.id}
          onClose={() => setSelected(null)}
          onRemove={() => handleRemoveStaff(selected)}
        />
      )}

      {/* Invite Staff Modal (token-based, sends offer email) */}
      <InviteStaffDialog open={showInviteModal} onOpenChange={setShowInviteModal} onSent={fetchStaff} />

      {/* Add Staff Modal (direct add — existing flow) */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-[#B91C1C]" aria-hidden="true" /> Add staff member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Notice tone="amber" icon={AlertTriangle}>
              <p><strong>Prefer "Send offer".</strong> Direct add creates the login through the admin auth API, which the browser session can't call — it fails with "User not allowed". The offer flow (role, pay, start date, 72-hour link) is the working path.</p>
            </Notice>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First name *</Label><Input value={formData.firstName} onChange={e => setFormData(p => ({ ...p, firstName: e.target.value }))} /></div>
              <div><Label>Last name</Label><Input value={formData.lastName} onChange={e => setFormData(p => ({ ...p, lastName: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email *</Label><Input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input type="tel" value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role *</Label>
                <Select value={formData.role} onValueChange={v => setFormData(p => ({ ...p, role: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Specialty</Label>
                <Select value={formData.specialty} onValueChange={v => setFormData(p => ({ ...p, specialty: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Pay rate ($/draw)</Label><Input type="number" value={formData.payRate} onChange={e => setFormData(p => ({ ...p, payRate: e.target.value }))} /></div>
              <div><Label>Premium rate ($/specialty)</Label><Input type="number" value={formData.premiumRate} onChange={e => setFormData(p => ({ ...p, premiumRate: e.target.value }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={formData.bio} onChange={e => setFormData(p => ({ ...p, bio: e.target.value }))} rows={2} /></div>
            <Notice tone="blue" icon={Mail}><p>An email invite is sent so they can set their password.</p></Notice>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button onClick={handleAddStaff} disabled={isSubmitting} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding…</> : <><UserPlus className="h-4 w-4 mr-1" /> Add & invite</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Rows
// ──────────────────────────────────────────────────────────────────
interface RowHandlers {
  canManage: boolean;
  onOpen: (s: StaffMember) => void;
  onRemove: (s: StaffMember) => void;
}

const StatusPill: React.FC<{ s: StaffMember; bucket: Bucket; className?: string }> = ({ s, bucket, className }) => {
  const meta = BUCKET_META[bucket];
  const issues = issuesOf(s);
  const text = bucket === 'attention' ? (issues.length === 1 ? issues[0].split(' — ')[0] : `${issues.length} issues`) : meta.label;
  return <Pill className={cn(meta.pill, className)} dot={meta.dot} title={issues.join(' · ') || meta.desc}>{text}</Pill>;
};

const PayoutCell: React.FC<{ s: StaffMember }> = ({ s }) => {
  if (kindOf(s) !== 'phleb') return <span className="text-gray-400">—</span>;
  if (!s.stripe_connect_account_id) return <span className="text-red-700">Not connected</span>;
  if (!s.stripe_connect_onboarded_at) return <span className="text-amber-700">Onboarding</span>;
  if (s.stripe_connect_payouts_enabled === false) return <span className="text-red-700">Disabled</span>;
  return <span className="text-emerald-700 inline-flex items-center gap-1"><Wallet className="h-3 w-3" aria-hidden="true" /> Ready</span>;
};

const ComplianceCell: React.FC<{ s: StaffMember }> = ({ s }) => {
  const st = (s.compliance_status || 'pending').toLowerCase();
  if (st === 'cleared') return <span className="text-emerald-700 inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Cleared</span>;
  return <span className="text-amber-700 capitalize">{st}</span>;
};

const RowMenu: React.FC<{ s: StaffMember; h: RowHandlers; className?: string }> = ({ s, h, className }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${s.name}`} onClick={(e) => e.stopPropagation()}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => h.onOpen(s)}>
        <Users className="h-4 w-4 mr-2" aria-hidden="true" /> Open profile
      </DropdownMenuItem>
      {s.phone && (
        <DropdownMenuItem asChild>
          <a href={`tel:${s.phone}`}><Phone className="h-4 w-4 mr-2" aria-hidden="true" /> Call {s.phone}</a>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => copyText(s.user_id, 'User ID')}>
        <Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy user ID
      </DropdownMenuItem>
      {h.canManage && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-700 focus:text-red-700" onSelect={() => h.onRemove(s)}>
            <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" /> Remove from roster
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

const Avatar: React.FC<{ s: StaffMember; size?: 'sm' | 'md' }> = ({ s, size = 'sm' }) => {
  const cls = size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-11 h-11 text-sm';
  if (s.photo_url) return <img src={s.photo_url} alt="" className={cn(cls, 'rounded-full object-cover flex-shrink-0')} />;
  const initials = s.name.split(/\s+/).filter(w => !w.startsWith('"')).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  return <div className={cn(cls, 'rounded-full bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0 font-bold text-[#B91C1C]')} aria-hidden="true">{initials}</div>;
};

const StaffRows: React.FC<{ rows: StaffMember[]; bucketOf: Map<string, Bucket>; handlers: RowHandlers; removing: string | null }> = ({ rows, bucketOf, handlers, removing }) => {
  const bucket = (s: StaffMember) => bucketOf.get(s.id) || deriveBucket(s);
  return (
    <>
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className={cn(TH, 'pl-4')}>Team member</TableHead>
              <TableHead className={TH}>Role</TableHead>
              {handlers.canManage && <TableHead className={cn(TH, 'whitespace-nowrap')}>Pay</TableHead>}
              <TableHead className={cn(TH, 'text-right whitespace-nowrap')}>Draws</TableHead>
              <TableHead className={TH}>Payouts</TableHead>
              <TableHead className={TH}>Compliance</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={cn('hidden xl:table-cell', TH, 'whitespace-nowrap')}>Last draw</TableHead>
              <TableHead className={TH_STICKY}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(s => {
              const b = bucket(s);
              const open = () => handlers.onOpen(s);
              return (
                <TableRow
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={rowKeyHandler(open)}
                  aria-label={`${s.name}, ${BUCKET_META[b].label}. Open profile`}
                  className={cn(ROW_FOCUS, 'bg-white', b === 'attention' && 'border-l-4 border-l-red-500')}
                >
                  <TableCell className="py-2.5 pl-4 align-top">
                    <div className="flex items-start gap-2 min-w-0">
                      <Avatar s={s} />
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-gray-800 truncate block">{s.name}</span>
                        <p className="text-[11px] text-gray-500 truncate">{s.phone || (s.exclude_from_auto_assignment ? 'Excluded from auto-assign' : `Joined ${dateOnly(s.hired_date || s.created_at, 'MMM yyyy')}`)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 whitespace-nowrap">
                    <span className="block">{KIND_LABEL[kindOf(s)]}</span>
                    <span className="block text-[11px] text-gray-500">{specialtyLabel(s.specialty)}</span>
                  </TableCell>
                  {handlers.canManage && (
                    <TableCell className="py-2.5 align-top text-xs text-gray-700 whitespace-nowrap">
                      {kindOf(s) === 'phleb'
                        ? <><span className="block">{money(s.pay_rate)}/draw</span>{s.premium_pay_rate != null && <span className="block text-[11px] text-gray-500">{money(s.premium_pay_rate)} specialty</span>}</>
                        : <span className="block">{money(s.pay_rate)}</span>}
                    </TableCell>
                  )}
                  <TableCell className="py-2.5 align-top text-sm font-medium text-right tabular-nums">{kindOf(s) === 'phleb' || s.completed_draws > 0 ? s.completed_draws : <span className="text-gray-400 font-normal">—</span>}</TableCell>
                  <TableCell className="py-2.5 align-top text-xs whitespace-nowrap"><PayoutCell s={s} /></TableCell>
                  <TableCell className="py-2.5 align-top text-xs whitespace-nowrap"><ComplianceCell s={s} /></TableCell>
                  <TableCell className="py-2.5 align-top"><StatusPill s={s} bucket={b} /></TableCell>
                  <TableCell className="hidden xl:table-cell py-2.5 align-top text-xs text-gray-600 whitespace-nowrap">
                    {s.last_draw_at ? <><span className="block">{dateOnly(s.last_draw_at)}</span><span className="block text-[11px] text-gray-400">{ago(s.last_draw_at)}</span></> : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className={TD_STICKY}>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); open(); }}>
                        Open
                      </Button>
                      {handlers.canManage && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-gray-500 hover:text-red-700" aria-label={`Remove ${s.name}`} disabled={removing === s.id} onClick={(e) => { e.stopPropagation(); handlers.onRemove(s); }}>
                              {removing === s.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove from roster</TooltipContent>
                        </Tooltip>
                      )}
                      <RowMenu s={s} h={handlers} />
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
          const open = () => handlers.onOpen(s);
          return (
            <Card
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={rowKeyHandler(open)}
              aria-label={`${s.name}, ${BUCKET_META[b].label}. Open profile`}
              className={cn(CARD_FOCUS, b === 'attention' && 'border-l-4 border-l-red-500')}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Avatar s={s} />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-gray-800 block truncate">{s.name}</span>
                    <p className="text-[11px] text-gray-500 truncate">{KIND_LABEL[kindOf(s)]} · {specialtyLabel(s.specialty)}</p>
                  </div>
                  <StatusPill s={s} bucket={b} />
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                  {kindOf(s) === 'phleb' && <span>{plural(s.completed_draws, 'draw')}</span>}
                  {kindOf(s) === 'phleb' && <span className="text-gray-300">·</span>}
                  <span>Payouts: <PayoutCell s={s} /></span>
                  <span className="text-gray-300">·</span>
                  <ComplianceCell s={s} />
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Button size="sm" variant="outline" className="h-11 flex-1 justify-center text-xs" onClick={(e) => { e.stopPropagation(); open(); }}>Open profile</Button>
                  <RowMenu s={s} h={handlers} className="h-11 w-11 flex-shrink-0 border border-gray-200" />
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
const StaffDetailDrawer: React.FC<{
  s: StaffMember;
  bucket: Bucket;
  blocks: TimeBlock[];
  canManage: boolean;
  removing: boolean;
  onClose: () => void;
  onRemove: () => void;
}> = ({ s, bucket, blocks, canManage, removing, onClose, onRemove }) => {
  const issues = issuesOf(s);
  const t = todayKey();
  const upcoming = blocks.filter(b => b.recurring || b.end_date >= t);
  return (
    <DetailDrawer
      titleId={`staff-title-${s.id}`}
      eyebrow={KIND_LABEL[kindOf(s)]}
      title={s.name}
      meta={
        <>
          <StatusPill s={s} bucket={bucket} className="bg-white/95" />
          <span className="text-sm opacity-95">{specialtyLabel(s.specialty)}</span>
        </>
      }
      onClose={onClose}
    >
      {issues.length > 0 && (
        <Notice tone="red" icon={AlertTriangle}>
          <ul className="list-disc pl-4 space-y-0.5">{issues.map(i => <li key={i}>{i}</li>)}</ul>
        </Notice>
      )}
      {s.exclude_from_auto_assignment && (
        <Notice tone="amber" icon={CalendarOff}><p>Excluded from auto-assignment — new bookings won't be routed to this person automatically.</p></Notice>
      )}

      <QuickActions>
        {s.phone && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
            <a href={`tel:${s.phone}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call</a>
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={() => copyText(s.user_id, 'User ID')}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy user ID
        </Button>
        {canManage && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0 border-red-300 text-red-700 hover:bg-red-50" onClick={onRemove} disabled={removing}>
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />} Remove from roster
          </Button>
        )}
      </QuickActions>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-1.5 text-sm">
          <SectionLabel>Profile</SectionLabel>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <Field label="Specialty">{specialtyLabel(s.specialty)}</Field>
            <Field label="Phone">{s.phone || '—'}</Field>
            <Field label="Hired">{dateOnly(s.hired_date) || <span className="text-gray-400">not set · profile created {dateOnly(s.created_at)}</span>}</Field>
            <Field label="Emergency">{s.emergency_contact_name ? `${s.emergency_contact_name}${s.emergency_contact_phone ? ` · ${s.emergency_contact_phone}` : ''}` : '—'}</Field>
            <Field label="Owner alerts">{s.receives_owner_alerts ? 'Yes' : 'No'}</Field>
            <Field label="Auto-assign">{s.exclude_from_auto_assignment ? <span className="text-amber-700">Excluded</span> : 'Eligible'}</Field>
          </div>
        </div>
        <div className="space-y-1.5 text-sm">
          <SectionLabel>Pay & payouts</SectionLabel>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            {canManage ? (
              <>
                <Field label="Pay rate">{kindOf(s) === 'phleb' ? `${money(s.pay_rate)} per draw` : money(s.pay_rate)}</Field>
                <Field label="Premium">{s.premium_pay_rate != null ? `${money(s.premium_pay_rate)} per specialty draw` : '—'}</Field>
              </>
            ) : (
              <Field label="Pay rate"><span className="text-gray-400">Admin only</span></Field>
            )}
            <Field label="Stripe Connect"><PayoutCell s={s} /></Field>
            {s.stripe_connect_account_id && <Field label="Account"><span className="font-mono text-[10px]">{s.stripe_connect_account_id}</span></Field>}
            {s.stripe_connect_onboarded_at && <Field label="Onboarded">{dateOnly(s.stripe_connect_onboarded_at)}</Field>}
            <Field label="Compliance"><ComplianceCell s={s} />{s.compliance_cleared_at && <span className="text-gray-400"> · {dateOnly(s.compliance_cleared_at)}</span>}</Field>
          </div>
        </div>
        <div className="space-y-1.5 text-sm">
          <SectionLabel>Activity</SectionLabel>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <Field label="Completed draws"><span className="font-medium">{s.completed_draws}</span></Field>
            <Field label="Last draw">{s.last_draw_at ? `${dateOnly(s.last_draw_at)} · ${ago(s.last_draw_at)}` : '—'}</Field>
            <Field label="Time off">{upcoming.length > 0 ? plural(upcoming.length, 'upcoming block') : 'None scheduled'}</Field>
            <Field label="User ID"><span className="font-mono text-[10px]">{s.user_id}</span></Field>
          </div>
        </div>
      </div>

      {s.bio && (
        <div>
          <SectionLabel>Bio / notes</SectionLabel>
          <p className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded px-3 py-2">{s.bio}</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <SectionLabel className="mb-2">Upcoming time off</SectionLabel>
          <div className="space-y-1.5">{upcoming.map(b => <BlockRow key={b.id} block={b} staffName={s.name} />)}</div>
        </div>
      )}
    </DetailDrawer>
  );
};

// ──────────────────────────────────────────────────────────────────
// Schedule & time off
// ──────────────────────────────────────────────────────────────────
const blockRange = (b: TimeBlock) => {
  const start = dateOnly(b.start_date, 'MMM d') || b.start_date;
  const end = dateOnly(b.end_date, 'MMM d') || b.end_date;
  let s = b.start_date === b.end_date ? start : `${start} — ${end}`;
  if (b.start_time && b.end_time) s += ` · ${b.start_time}–${b.end_time}`;
  else if (b.start_time) s += ` · from ${b.start_time}`;
  else if (b.end_time) s += ` · until ${b.end_time}`;
  return s;
};

const BlockRow: React.FC<{ block: TimeBlock; staffName?: string | null; past?: boolean; onDelete?: () => void; deleting?: boolean }> = ({ block: b, staffName, past, onDelete, deleting }) => {
  const closure = b.block_type === 'office_closure';
  return (
    <div className={cn('flex items-center justify-between gap-2 rounded-lg border p-3 text-sm', past ? 'bg-gray-50 border-gray-200' : closure ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200')}>
      <div className="min-w-0">
        <p className={cn('font-medium truncate', past ? 'text-gray-600' : closure ? 'text-red-800' : 'text-amber-900')}>{blockRange(b)}</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <p className={cn('text-xs truncate', past ? 'text-gray-500' : closure ? 'text-red-700' : 'text-amber-800')}>{b.reason || 'Blocked'}</p>
          {staffName && <Pill className="bg-white text-gray-700 border-gray-300">{staffName}</Pill>}
          {b.recurring && <Pill className="bg-white text-gray-700 border-gray-300"><Repeat className="h-3 w-3" aria-hidden="true" /> {b.recurring_day || 'weekly'}</Pill>}
          {closure && <Pill className="bg-red-100 text-red-800 border-red-200"><Building2 className="h-3 w-3" aria-hidden="true" /> Office closed</Pill>}
        </div>
      </div>
      {onDelete && (
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-gray-500 hover:text-red-700 flex-shrink-0" aria-label="Delete time block" onClick={onDelete} disabled={deleting}>
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
        </Button>
      )}
    </div>
  );
};

const HOURS_START = ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
const HOURS_END = ['12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '8:00 PM'];

const ScheduleView: React.FC<{ staff: StaffMember[]; blocks: TimeBlock[]; canManage: boolean; onChanged: () => void }> = ({ staff, blocks, canManage, onChanged }) => {
  const [form, setForm] = useState({
    staffId: '', startDate: '', endDate: '', reason: '',
    startTime: '', endTime: '', recurring: false, recurringDay: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const t = todayKey();
  const staffName = (id: string | null) => (id ? staff.find(s => s.id === id)?.name || null : null);
  const upcoming = blocks.filter(b => b.recurring || b.end_date >= t).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = blocks.filter(b => !b.recurring && b.end_date < t);
  const closures = upcoming.filter(b => b.block_type === 'office_closure').length;
  const recurring = upcoming.filter(b => b.recurring).length;

  const handleBlockTime = async () => {
    if (!form.startDate || !form.endDate) { toast.error('Start and end dates are required'); return; }
    if (form.endDate < form.startDate) { toast.error('End date is before the start date'); return; }
    setSaving(true);
    try {
      const staffLabel = form.staffId === 'all' ? 'Office Closure'
        : form.staffId === 'owner' ? 'Owner'
        : form.staffId === 'admin' ? 'Admin'
        : staff.find(s => s.id === form.staffId)?.name || '';
      const fullReason = staffLabel ? `${staffLabel}: ${form.reason || 'Time off'}` : form.reason || 'Time off';

      const insertPayload: Record<string, any> = {
        start_date: form.startDate,
        end_date: form.endDate,
        reason: fullReason,
        block_type: form.staffId === 'all' ? 'office_closure' : 'time_off',
        start_time: form.startTime || null,
        end_time: form.endTime || null,
        recurring: form.recurring || false,
        recurring_day: form.recurringDay || null,
      };
      // Only include staff_id if it's a real staff row (not 'all' / 'owner' / 'admin')
      if (form.staffId && !['all', 'owner', 'admin'].includes(form.staffId)) insertPayload.staff_id = form.staffId;

      const { data: inserted, error } = await db.from('time_blocks').insert(insertPayload).select();
      if (error) throw error;
      if (!inserted || inserted.length === 0) throw new Error('Block was not created — check permissions');

      // Affected appointments in the blocked range → warn + text the patient
      // (existing behaviour, unchanged).
      const { data: affected } = await db
        .from('appointments')
        .select('id, patient_name, patient_email, patient_phone, appointment_date, appointment_time, notes')
        .gte('appointment_date', form.startDate + 'T00:00:00')
        .lte('appointment_date', form.endDate + 'T23:59:59')
        .in('status', ['scheduled', 'confirmed']);

      if (affected && affected.length > 0) {
        const names = (affected as any[]).map(a => a.patient_name || a.notes?.match(/Patient:\s*([^|]+)/)?.[1]?.trim() || 'Unknown').join(', ');
        toast.warning(`${affected.length} appointment(s) affected: ${names}. These patients should be rescheduled.`, { duration: 8000 });
        for (const appt of affected as any[]) {
          const phone = appt.patient_phone || appt.notes?.match(/Phone:\s*([^|]+)/)?.[1]?.trim();
          const name = appt.patient_name || appt.notes?.match(/Patient:\s*([^|]+)/)?.[1]?.trim() || 'Patient';
          if (phone) {
            supabase.functions.invoke('send-sms-notification', {
              body: {
                to: phone,
                message: `ConveLabs: Hi ${name.split(' ')[0]}, we need to reschedule your appointment due to ${form.reason || 'a schedule change'}. We'll reach out shortly with a new time, or call us at (941) 527-9169.`,
              },
            }).catch(() => {});
          }
        }
      } else {
        toast.success('Time block saved');
      }

      setForm({ staffId: '', startDate: '', endDate: '', reason: '', startTime: '', endTime: '', recurring: false, recurringDay: '' });
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save time block');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b: TimeBlock) => {
    if (!window.confirm(`Delete this block (${blockRange(b)})?`)) return;
    setDeleting(b.id);
    try {
      const { error } = await db.from('time_blocks').delete().eq('id', b.id);
      if (error) throw error;
      toast.success('Time block removed');
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete time block');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mini KPI strip — these three partition the upcoming blocks. */}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Time block counts">
        {[
          { label: 'Upcoming blocks', n: upcoming.length, cls: 'text-gray-900' },
          { label: 'Office closures', n: closures, cls: closures > 0 ? 'text-red-700' : 'text-gray-900' },
          { label: 'Recurring', n: recurring, cls: 'text-gray-900' },
        ].map(k => (
          <div key={k.label} className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 min-h-[64px] shadow-sm">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 truncate">{k.label}</p>
            <p className={cn('text-2xl font-bold leading-tight mt-0.5', k.cls)}>{k.n}</p>
          </div>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#B91C1C]" aria-hidden="true" />
            <h2 className="text-sm font-bold text-gray-900">Business hours</h2>
            <span className="text-[11px] text-gray-400">· fixed</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => (
              <div key={day} className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                <span className="font-medium">{day}</span>
                <span className="text-gray-500">6:00 AM – 1:30 PM</span>
              </div>
            ))}
            <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs">
              <span className="font-medium">Saturday</span>
              <span className="text-amber-700">6 – 9:30 AM <span className="text-[10px] font-semibold">· members</span></span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg border border-red-200 text-xs">
              <span className="font-medium">Sunday</span>
              <span className="text-red-600">Closed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-[#B91C1C]" aria-hidden="true" />
              <h2 className="text-sm font-bold text-gray-900">Block time off</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Who is this for?</Label>
                <Select value={form.staffId} onValueChange={v => setForm(p => ({ ...p, staffId: v }))}>
                  <SelectTrigger className="h-10 sm:h-9 text-sm"><SelectValue placeholder="Select staff or office…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All staff / office closure</SelectItem>
                    <SelectItem value="owner">Owner (Nicodemme)</SelectItem>
                    <SelectItem value="admin">Admin (Naquala)</SelectItem>
                    {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({KIND_LABEL[kindOf(s)]})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Start date</Label><Input type="date" className="h-10 sm:h-9 text-sm" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value, endDate: p.endDate || e.target.value }))} /></div>
              <div><Label className="text-xs">End date</Label><Input type="date" className="h-10 sm:h-9 text-sm" value={form.endDate} min={form.startDate || undefined} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} /></div>
              <div><Label className="text-xs">Reason</Label><Input className="h-10 sm:h-9 text-sm" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="PTO, sick, training…" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Start time <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Select value={form.startTime || 'full-day'} onValueChange={v => setForm(p => ({ ...p, startTime: v === 'full-day' ? '' : v }))}>
                  <SelectTrigger className="h-10 sm:h-9 text-sm"><SelectValue placeholder="Full day" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-day">Full day</SelectItem>
                    {HOURS_START.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">End time <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Select value={form.endTime || 'full-day'} onValueChange={v => setForm(p => ({ ...p, endTime: v === 'full-day' ? '' : v }))}>
                  <SelectTrigger className="h-10 sm:h-9 text-sm"><SelectValue placeholder="Full day" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-day">Full day</SelectItem>
                    {HOURS_END.map(h => <SelectItem key={h} value={h}>{h}{h === '12:00 PM' ? ' (morning off)' : h === '8:00 PM' ? ' (full PM off)' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex items-end gap-4 flex-wrap">
                <label className="flex items-center gap-2 h-10 sm:h-9 text-sm font-medium cursor-pointer">
                  <input type="checkbox" checked={form.recurring} onChange={e => setForm(p => ({ ...p, recurring: e.target.checked }))} className="rounded border-gray-300" />
                  Recurring weekly
                </label>
                {form.recurring && (
                  <Select value={form.recurringDay} onValueChange={v => setForm(p => ({ ...p, recurringDay: v }))}>
                    <SelectTrigger className="w-44 h-10 sm:h-9 text-sm"><SelectValue placeholder="Which day?" /></SelectTrigger>
                    <SelectContent>
                      {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(d => <SelectItem key={d} value={d} className="capitalize">Every {d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <Notice tone="amber" icon={AlertTriangle}>
              <p>Patients already booked inside this range get a text asking to reschedule. Double-check the dates before saving.</p>
            </Notice>
            <Button size="sm" onClick={handleBlockTime} disabled={saving} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white h-10 sm:h-9 gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarOff className="h-4 w-4" aria-hidden="true" />} Block time
            </Button>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="blocks-upcoming">
        <LaneHeader id="blocks-upcoming" title="Upcoming & recurring" count={upcoming.length} tone={closures > 0 ? 'red' : 'gray'} />
        {upcoming.length === 0 ? (
          <Card className="border-dashed"><CardContent className="p-6 text-center text-xs text-gray-500">No upcoming time off or closures.</CardContent></Card>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map(b => <BlockRow key={b.id} block={b} staffName={staffName(b.staff_id)} onDelete={canManage ? () => handleDelete(b) : undefined} deleting={deleting === b.id} />)}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="blocks-past">
          <button type="button" onClick={() => setShowPast(v => !v)} aria-expanded={showPast} className="flex items-center gap-2 mb-2 min-h-[36px]">
            <ChevronDown className={cn('h-4 w-4 text-gray-500 transition', !showPast && '-rotate-90')} aria-hidden="true" />
            <h2 id="blocks-past" className="text-sm font-bold text-gray-700">Past</h2>
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700">{past.length}</span>
          </button>
          {showPast && (
            <div className="space-y-1.5">
              {past.map(b => <BlockRow key={b.id} block={b} staffName={staffName(b.staff_id)} past onDelete={canManage ? () => handleDelete(b) : undefined} deleting={deleting === b.id} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default StaffManagementTab;
