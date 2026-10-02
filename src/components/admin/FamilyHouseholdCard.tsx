/**
 * FamilyHouseholdCard — manage the family/household attached to one patient.
 *
 * Data model (verified 2026-10-02, read-only): there is no household table.
 * Everyone sharing `tenant_patients.household_id` is one household and
 * `tenant_patients.household_relation` labels each member relative to the
 * household's primary, who is stored as 'Self'. There are no guarantor /
 * shared-address flags — "share address" simply copies the address columns.
 *
 * RLS: UPDATE on tenant_patients is allowed for super_admin / admin / owner
 * (tp_update_admin); office managers can only update patients scoped to
 * their own organization. A blocked update returns 0 rows with NO error, so
 * every write here checks the returned row count and says so instead of
 * pretending it worked.
 *
 * Workflows (all with a review/confirm step and inline errors):
 *   • Link existing  — search → pick → relationship (+ copy address, move
 *                      out of another household) → review → link
 *   • Add new        — create a patient straight into the household
 *   • Edit link      — change a member's relationship, or make them primary
 *                      (the old primary gets a new relationship)
 *   • Unlink         — confirm; clears the household when one member remains
 *
 * Payoff: once linked, booking (AddCompanionDialog / SendBookingLinkModal)
 * offers the household as one-click companions.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Users, UserPlus, Link2, Loader2, ChevronRight, Search, Pencil, Unlink, Crown, AlertTriangle, MapPin, Lock, X,
} from 'lucide-react';
import {
  ConfirmDialog, FieldGroup, InlineError, ModalTitle, ReviewList, ReviewRow,
} from '@/components/dashboards/admin/chartModalKit';

const db = supabase as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const RELATIONS = ['Spouse', 'Partner', 'Child', 'Parent', 'Sibling', 'Grandparent', 'Grandchild', 'Caregiver', 'Other'] as const;
const PRIMARY = 'Self';

interface PatientLite {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  household_id?: string | null;
  household_relation?: string | null;
  organization_id?: string | null;
}

interface Props {
  patient: PatientLite;
  /** Called after any change so the parent can refresh the patient row. */
  onChanged?: () => void;
  /** Open another patient's chart (member row click). */
  onOpenPatient?: (patient: any) => void;
}

const fullName = (p: PatientLite) => `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unnamed patient';
const firstName = (p: PatientLite | undefined) => (p?.first_name || '').trim() || 'the primary';
const addressOf = (p: PatientLite) => [p.address, [p.city, p.state, p.zipcode].filter(Boolean).join(', ')].filter(Boolean).join(', ');

/** Update one patient's household columns and prove a row actually changed. */
async function updateHousehold(id: string, patch: { household_id: string | null; household_relation: string | null }) {
  const { data, error } = await db.from('tenant_patients').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Nothing changed — your role isn't allowed to edit this patient's household (RLS). Ask a super admin.");
  }
}

function relationLabel(m: PatientLite, primary: PatientLite | undefined, isThisChart: boolean): string {
  if (m.household_relation === PRIMARY) return 'Household primary';
  const rel = m.household_relation || 'Family';
  if (primary && !isThisChart && primary.id !== m.id) return `${rel} of ${firstName(primary)}`;
  if (primary && isThisChart) return `${rel} of ${firstName(primary)}`;
  return rel;
}

// ──────────────────────────────────────────────────────────────────
// Card
// ──────────────────────────────────────────────────────────────────
const FamilyHouseholdCard: React.FC<Props> = ({ patient, onChanged, onOpenPatient }) => {
  const { user } = useAuth();
  const role = String(user?.role || '').toLowerCase();
  // Mirrors tp_update_admin. Office managers can only touch their own org's
  // patients, which this card can't verify member-by-member — read-only for them.
  const canEdit = ['super_admin', 'admin', 'owner'].includes(role);

  const [householdId, setHouseholdId] = useState<string | null>(patient.household_id || null);
  const [members, setMembers] = useState<PatientLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [editing, setEditing] = useState<PatientLite | null>(null);
  const [unlinking, setUnlinking] = useState<PatientLite | null>(null);

  useEffect(() => { setHouseholdId(patient.household_id || null); }, [patient.id, patient.household_id]);

  const loadMembers = useCallback(async () => {
    if (!householdId) { setMembers([]); return; }
    setLoading(true);
    setLoadError(null);
    const { data, error } = await db
      .from('tenant_patients')
      .select('id, first_name, last_name, email, phone, date_of_birth, address, city, state, zipcode, household_id, household_relation, organization_id')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('household_relation', { ascending: true });
    if (error) { setLoadError(error.message || 'Could not load the household'); setMembers([]); }
    else setMembers((data as PatientLite[]) || []);
    setLoading(false);
  }, [householdId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  // Everyone in the household including this chart's patient, primary first.
  const all = useMemo(() => {
    const list = members.length > 0 ? members : [];
    const hasSelfRow = list.some(m => m.id === patient.id);
    const merged = hasSelfRow ? list : (householdId ? [...list, { ...patient, household_id: householdId }] : []);
    return [...merged].sort((a, b) => (a.household_relation === PRIMARY ? -1 : b.household_relation === PRIMARY ? 1 : fullName(a).localeCompare(fullName(b))));
  }, [members, patient, householdId]);
  const primary = all.find(m => m.household_relation === PRIMARY);
  const others = all.filter(m => m.id !== patient.id);

  // Mint a household on first add and stamp this patient as primary.
  const ensureHousehold = useCallback(async (): Promise<string> => {
    if (householdId) return householdId;
    const newId = crypto.randomUUID();
    await updateHousehold(patient.id, { household_id: newId, household_relation: PRIMARY });
    setHouseholdId(newId);
    return newId;
  }, [householdId, patient.id]);

  const afterChange = useCallback(async () => {
    await loadMembers();
    onChanged?.();
  }, [loadMembers, onChanged]);

  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const doUnlink = async () => {
    if (!unlinking) return;
    setUnlinkBusy(true);
    setUnlinkError(null);
    try {
      await updateHousehold(unlinking.id, { household_id: null, household_relation: null });
      const remaining = all.filter(m => m.id !== unlinking.id);
      // A household of one is meaningless — clear the last member too.
      if (remaining.length === 1) {
        await updateHousehold(remaining[0].id, { household_id: null, household_relation: null });
        if (remaining[0].id === patient.id) setHouseholdId(null);
      }
      if (unlinking.id === patient.id) setHouseholdId(null);
      toast.success(`${fullName(unlinking)} removed from the household`);
      setUnlinking(null);
      afterChange();
    } catch (e: any) {
      setUnlinkError(e?.message || 'Could not remove from household');
    } finally {
      setUnlinkBusy(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#B91C1C]" aria-hidden="true" />
              Family / household
              {all.length > 1 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700">{all.length}</span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Linked people book together as one visit and can share an address.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-10 sm:h-9 text-xs gap-1.5" onClick={() => setLinkOpen(true)} disabled={!canEdit}>
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Link existing
            </Button>
            <Button size="sm" className="h-10 sm:h-9 text-xs gap-1.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={() => setAddOpen(true)} disabled={!canEdit}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Add new
            </Button>
          </div>
        </div>

        {!canEdit && (
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            Household links are read-only for your role — a super admin can link, edit or unlink members.
          </p>
        )}
        <InlineError message={loadError} />

        {loading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading household">
            {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 animate-pulse rounded-lg" />)}
          </div>
        ) : all.length === 0 ? (
          <div className="border border-dashed rounded-lg p-6 text-center">
            <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-gray-700">No family linked yet.</p>
            <p className="text-xs text-gray-500 mt-1">Link a spouse, child or parent to book them together and share one address.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border border-gray-200 bg-white">
            {all.map(m => {
              const isThis = m.id === patient.id;
              const isPrimary = m.household_relation === PRIMARY;
              return (
                <li key={m.id} className={cn('flex items-center gap-3 px-3 py-2.5', isThis && 'bg-red-50/40')}>
                  <button
                    type="button"
                    className="flex items-center gap-3 min-w-0 flex-1 text-left disabled:cursor-default"
                    onClick={() => !isThis && onOpenPatient?.(m)}
                    disabled={isThis}
                    aria-label={isThis ? `${fullName(m)} (this chart)` : `Open ${fullName(m)}'s chart`}
                  >
                    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0', isPrimary ? 'bg-amber-100' : 'bg-[#B91C1C]/10')}>
                      {isPrimary ? <Crown className="h-4 w-4 text-amber-700" aria-hidden="true" /> : <Users className="h-4 w-4 text-[#B91C1C]" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {fullName(m)}
                        {isThis && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">this chart</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        <span className={cn('inline-flex items-center px-1.5 h-5 rounded-full border text-[10px] font-semibold mr-1.5', isPrimary ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-gray-50 text-gray-700 border-gray-200')}>
                          {relationLabel(m, primary, isThis)}
                        </span>
                        {m.date_of_birth ? `DOB ${m.date_of_birth}` : ''}
                        {m.date_of_birth && m.phone ? ' · ' : ''}
                        {m.phone || ''}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {canEdit && (
                      <>
                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Edit relationship" aria-label={`Edit ${fullName(m)}'s relationship`} onClick={() => setEditing(m)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-gray-500 hover:text-red-700" title="Remove from household" aria-label={`Remove ${fullName(m)} from the household`} onClick={() => { setUnlinkError(null); setUnlinking(m); }}>
                          <Unlink className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </>
                    )}
                    {!isThis && <ChevronRight className="h-4 w-4 text-gray-300" aria-hidden="true" />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <AddNewMemberDialog open={addOpen} onOpenChange={setAddOpen} primary={patient} householdPrimary={primary} ensureHousehold={ensureHousehold} onDone={afterChange} />
      <LinkExistingDialog open={linkOpen} onOpenChange={setLinkOpen} primary={patient} householdPrimary={primary} existingMemberIds={useMemo(() => new Set(all.map(m => m.id)), [all])} ensureHousehold={ensureHousehold} onDone={afterChange} />
      {editing && (
        <EditLinkDialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }} member={editing} all={all} primary={primary} onDone={() => { setEditing(null); afterChange(); }} />
      )}
      {unlinking && (
        <ConfirmDialog
          open={!!unlinking}
          onOpenChange={(v) => { if (!v) setUnlinking(null); }}
          icon={Unlink}
          tone="danger"
          title={`Remove ${fullName(unlinking)} from the household?`}
          context={unlinking.id === patient.id ? 'This chart' : `${relationLabel(unlinking, primary, false)}`}
          confirmLabel="Remove link"
          busy={unlinkBusy}
          busyLabel="Removing…"
          error={unlinkError}
          onConfirm={doUnlink}
        >
          <ReviewList>
            <ReviewRow label="Keeps">Their patient record, visits, address and insurance — only the household link is removed.</ReviewRow>
            <ReviewRow label="Loses">One-tap family booking and household companions on booking links.</ReviewRow>
            {unlinking.household_relation === PRIMARY && all.length > 2 && (
              <ReviewRow label="Heads up" tone="warn">They are the household primary. The other members stay linked; edit one of them to make them the new primary.</ReviewRow>
            )}
            {all.length === 2 && (
              <ReviewRow label="Also" tone="warn">{fullName(all.find(m => m.id !== unlinking.id)!)} will be the only one left, so the household is cleared for them too.</ReviewRow>
            )}
          </ReviewList>
        </ConfirmDialog>
      )}
    </Card>
  );
};

// ──────────────────────────────────────────────────────────────────
// Relationship picker (shared by the three dialogs)
// ──────────────────────────────────────────────────────────────────
const RelationSelect: React.FC<{ value: string; onChange: (v: string) => void; allowPrimary?: boolean; disabled?: boolean; id?: string }> = ({ value, onChange, allowPrimary, disabled, id }) => (
  <select id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className="w-full h-10 sm:h-9 text-sm border border-gray-200 rounded-md px-2 bg-white">
    {allowPrimary && <option value={PRIMARY}>Household primary</option>}
    {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
    {value && value !== PRIMARY && !(RELATIONS as readonly string[]).includes(value) && <option value={value}>{value}</option>}
  </select>
);

// ──────────────────────────────────────────────────────────────────
// Edit link — change relationship or promote to primary
// ──────────────────────────────────────────────────────────────────
const EditLinkDialog: React.FC<{
  open: boolean; onOpenChange: (v: boolean) => void;
  member: PatientLite; all: PatientLite[]; primary: PatientLite | undefined;
  onDone: () => void;
}> = ({ open, onOpenChange, member, all, primary, onDone }) => {
  const [relation, setRelation] = useState(member.household_relation || 'Spouse');
  const [oldPrimaryRelation, setOldPrimaryRelation] = useState('Spouse');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const becomingPrimary = relation === PRIMARY && member.household_relation !== PRIMARY;
  const demotingPrimary = member.household_relation === PRIMARY && relation !== PRIMARY;
  const otherPrimary = primary && primary.id !== member.id ? primary : undefined;
  const unchanged = relation === (member.household_relation || '');

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (becomingPrimary && otherPrimary) {
        await updateHousehold(otherPrimary.id, { household_id: otherPrimary.household_id || null, household_relation: oldPrimaryRelation });
      }
      await updateHousehold(member.id, { household_id: member.household_id || null, household_relation: relation });
      toast.success(relation === PRIMARY ? `${fullName(member)} is now the household primary` : `${fullName(member)} saved as ${relation.toLowerCase()}`);
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Could not update the link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Pencil}
      title={`Edit link · ${fullName(member)}`}
      context={member.household_relation === PRIMARY ? 'Household primary' : `${member.household_relation || 'Family'} of ${firstName(primary)}`}
      confirmLabel="Save link"
      busy={busy}
      busyLabel="Saving…"
      disabled={unchanged}
      error={error}
      onConfirm={save}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="edit-rel" className="text-xs font-semibold">Relationship to the household primary</Label>
          <RelationSelect id="edit-rel" value={relation} onChange={setRelation} allowPrimary disabled={busy} />
        </div>
        {becomingPrimary && otherPrimary && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-xs text-amber-900 flex items-start gap-2"><Crown className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" /> {fullName(otherPrimary)} is the current primary. Relationships are stored relative to the primary, so pick what {firstName(otherPrimary)} becomes to {firstName(member)}.</p>
            <RelationSelect value={oldPrimaryRelation} onChange={setOldPrimaryRelation} disabled={busy} />
          </div>
        )}
        {demotingPrimary && all.length > 1 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
            This leaves the household without a primary. Other members' relationships will read oddly until you make someone else the primary.
          </p>
        )}
        <ReviewList>
          <ReviewRow label="Before">{member.household_relation === PRIMARY ? 'Household primary' : member.household_relation || '—'}</ReviewRow>
          <ReviewRow label="After" tone="strong">{relation === PRIMARY ? 'Household primary' : relation}</ReviewRow>
        </ReviewList>
      </div>
    </ConfirmDialog>
  );
};

// ──────────────────────────────────────────────────────────────────
// Add a brand-new patient into the household
// ──────────────────────────────────────────────────────────────────
const EMPTY_FORM = { firstName: '', lastName: '', dob: '', email: '', phone: '', relation: 'Child', shareAddress: true };

const AddNewMemberDialog: React.FC<{
  open: boolean; onOpenChange: (v: boolean) => void;
  primary: PatientLite; householdPrimary: PatientLite | undefined;
  ensureHousehold: () => Promise<string>; onDone: () => void;
}> = ({ open, onOpenChange, primary, householdPrimary, ensureHousehold, onDone }) => {
  const [form, setForm] = useState({ ...EMPTY_FORM, lastName: primary.last_name || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setForm({ ...EMPTY_FORM, lastName: primary.last_name || '' }); setErr(null); setTouched(false); }
  }, [open, primary.last_name]);

  const emailOk = !form.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim());
  const nameOk = form.firstName.trim().length > 0 && form.lastName.trim().length > 0;
  const relTo = householdPrimary && householdPrimary.id !== primary.id ? householdPrimary : primary;

  const submit = async () => {
    setTouched(true);
    setErr(null);
    if (!nameOk) { setErr('First and last name are required.'); return; }
    if (!emailOk) { setErr('That email address does not look right.'); return; }
    setBusy(true);
    try {
      if (form.email.trim()) {
        const { data: existing } = await db.from('tenant_patients').select('id, first_name, last_name').ilike('email', form.email.trim()).is('deleted_at', null).limit(1);
        if (existing && existing.length > 0) {
          setErr(`${existing[0].first_name || ''} ${existing[0].last_name || ''} already has this email — use "Link existing" instead.`);
          return;
        }
      }
      const householdId = await ensureHousehold();
      const { data, error } = await db.from('tenant_patients').insert({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        date_of_birth: form.dob || null,
        address: form.shareAddress ? (primary.address || null) : null,
        city: form.shareAddress ? (primary.city || null) : null,
        state: form.shareAddress ? (primary.state || null) : null,
        zipcode: form.shareAddress ? (primary.zipcode || null) : null,
        household_id: householdId,
        household_relation: form.relation,
        tenant_id: TENANT_ID,
      }).select('id').single();
      if (error) throw error;
      if (!data) throw new Error('Member was not created');
      toast.success(`${form.firstName.trim()} added to the household`);
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'Could not add the family member');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-md w-[95vw] max-h-[92vh] overflow-y-auto">
        <ModalTitle icon={UserPlus} title="Add a family member" context={`New patient in ${fullName(primary)}'s household`} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">First name *</Label>
              <Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} className={cn('h-10 sm:h-9', touched && !form.firstName.trim() && 'border-red-300')} autoFocus disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Last name *</Label>
              <Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} className={cn('h-10 sm:h-9', touched && !form.lastName.trim() && 'border-red-300')} disabled={busy} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Relationship to {firstName(relTo)}</Label>
              <RelationSelect value={form.relation} onChange={v => setForm({ ...form, relation: v })} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date of birth</Label>
              <Input type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} className="h-10 sm:h-9" disabled={busy} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Email <span className="font-normal text-gray-400">(optional)</span></Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={cn('h-10 sm:h-9', !emailOk && 'border-red-300')} disabled={busy} />
              {!emailOk && <p className="text-[11px] text-red-600">Email format looks off.</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Phone <span className="font-normal text-gray-400">(optional)</span></Label>
              <Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-10 sm:h-9" disabled={busy} />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-gray-200 p-3">
            <input type="checkbox" className="mt-0.5" checked={form.shareAddress} onChange={e => setForm({ ...form, shareAddress: e.target.checked })} disabled={busy} />
            <span className="min-w-0">
              <span className="font-medium text-gray-900 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" /> Same address as {firstName(primary)}</span>
              <span className="block text-xs text-gray-500 truncate">{addressOf(primary) || 'No address on file yet — nothing will be copied'}</span>
            </span>
          </label>
          <InlineError message={err} />
        </div>
        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button variant="outline" className="h-10 sm:h-9" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="h-10 sm:h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Adding…</> : <><UserPlus className="h-4 w-4" aria-hidden="true" /> Add to household</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ──────────────────────────────────────────────────────────────────
// Link an existing patient — search → pick → review → link
// ──────────────────────────────────────────────────────────────────
const LinkExistingDialog: React.FC<{
  open: boolean; onOpenChange: (v: boolean) => void;
  primary: PatientLite; householdPrimary: PatientLite | undefined;
  existingMemberIds: Set<string>;
  ensureHousehold: () => Promise<string>; onDone: () => void;
}> = ({ open, onOpenChange, primary, householdPrimary, existingMemberIds, ensureHousehold, onDone }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PatientLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PatientLite | null>(null);
  const [otherHouseholdSize, setOtherHouseholdSize] = useState<number | null>(null);
  const [relation, setRelation] = useState('Spouse');
  const [copyAddress, setCopyAddress] = useState(false);
  const [moveOk, setMoveOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setQ(''); setResults([]); setPicked(null); setRelation('Spouse'); setCopyAddress(false); setMoveOk(false); setErr(null); setOtherHouseholdSize(null); }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const safe = term.replace(/[,().]/g, ' ');
      const { data } = await db
        .from('tenant_patients')
        .select('id, first_name, last_name, email, phone, date_of_birth, address, city, state, zipcode, household_id, household_relation')
        .is('deleted_at', null)
        .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .limit(20);
      if (cancelled) return;
      setResults(((data as PatientLite[]) || []).filter(p => p.id !== primary.id && !existingMemberIds.has(p.id)));
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, primary.id, existingMemberIds]);

  const pick = async (p: PatientLite) => {
    setPicked(p);
    setErr(null);
    setMoveOk(false);
    setCopyAddress(!(p.address || '').trim() && !!(primary.address || '').trim());
    if (p.household_id) {
      const { count } = await db.from('tenant_patients').select('id', { count: 'exact', head: true }).eq('household_id', p.household_id).is('deleted_at', null);
      setOtherHouseholdSize(count ?? null);
    } else setOtherHouseholdSize(null);
  };

  const inOtherHousehold = !!picked?.household_id;
  const relTo = householdPrimary && householdPrimary.id !== primary.id ? householdPrimary : primary;

  const link = async () => {
    if (!picked) return;
    if (inOtherHousehold && !moveOk) { setErr('Tick the box to confirm moving them out of their current household.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const householdId = await ensureHousehold();
      await updateHousehold(picked.id, { household_id: householdId, household_relation: relation });
      if (copyAddress) {
        const { error } = await db.from('tenant_patients').update({
          address: primary.address || null, city: primary.city || null, state: primary.state || null, zipcode: primary.zipcode || null,
        }).eq('id', picked.id);
        if (error) toast.warning(`Linked, but the address did not copy: ${error.message}`);
      }
      toast.success(`${fullName(picked)} linked as ${relation.toLowerCase()}`);
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'Could not link that patient');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-md w-[95vw] max-h-[92vh] overflow-y-auto">
        <ModalTitle icon={Link2} title="Link an existing patient" context={`Into ${fullName(primary)}'s household`} />

        {!picked ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <Input className="pl-8 h-10 sm:h-9" placeholder="Search by name, email or phone…" value={q} onChange={e => setQ(e.target.value)} autoFocus aria-label="Search patients" />
              {q && (
                <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto divide-y rounded-md border">
              {searching ? (
                <p className="text-sm text-gray-500 p-3 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching…</p>
              ) : q.trim().length < 2 ? (
                <p className="text-sm text-gray-500 p-3">Type at least 2 characters to search.</p>
              ) : results.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-gray-700 font-medium">No matching patients.</p>
                  <p className="text-xs text-gray-500 mt-1">Not on file yet? Close this and use <strong>Add new</strong>.</p>
                </div>
              ) : (
                results.map(p => (
                  <button key={p.id} type="button" onClick={() => pick(p)} className="w-full flex items-center justify-between p-2.5 gap-2 text-left hover:bg-gray-50 focus:outline-none focus-visible:bg-red-50/60">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">{fullName(p)}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {[p.date_of_birth && `DOB ${p.date_of_birth}`, p.phone, p.email].filter(Boolean).join(' · ') || 'No contact on file'}
                      </p>
                      {p.household_id && <p className="text-[11px] text-amber-700">Already in another household</p>}
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" aria-hidden="true" />
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button type="button" onClick={() => setPicked(null)} className="text-xs text-gray-500 underline" disabled={busy}>← Pick someone else</button>
            <ReviewList>
              <ReviewRow label="Patient" tone="strong">{fullName(picked)}</ReviewRow>
              <ReviewRow label="Contact">{[picked.phone, picked.email].filter(Boolean).join(' · ') || <span className="text-amber-700">No phone or email on file</span>}</ReviewRow>
              <ReviewRow label="Address">{addressOf(picked) || <span className="text-amber-700">None on file</span>}</ReviewRow>
            </ReviewList>
            <div className="space-y-1.5">
              <Label htmlFor="link-rel" className="text-xs font-semibold">{firstName(picked)} is {firstName(relTo)}'s…</Label>
              <RelationSelect id="link-rel" value={relation} onChange={setRelation} disabled={busy} />
            </div>
            {!!(primary.address || '').trim() && (
              <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-gray-200 p-3">
                <input type="checkbox" className="mt-0.5" checked={copyAddress} onChange={e => setCopyAddress(e.target.checked)} disabled={busy} />
                <span className="min-w-0">
                  <span className="font-medium text-gray-900 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" /> Copy {firstName(primary)}'s address onto {firstName(picked)}</span>
                  <span className="block text-xs text-gray-500 truncate">{addressOf(primary)}{(picked.address || '').trim() ? ' — replaces their current address' : ''}</span>
                </span>
              </label>
            )}
            {inOtherHousehold && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-xs text-amber-900 flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" /> {firstName(picked)} is already in another household{otherHouseholdSize ? ` of ${otherHouseholdSize}` : ''}{picked.household_relation ? ` as ${picked.household_relation.toLowerCase()}` : ''}. A patient can only be in one.</p>
                <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer">
                  <input type="checkbox" checked={moveOk} onChange={e => setMoveOk(e.target.checked)} disabled={busy} /> Move them into {firstName(primary)}'s household
                </label>
              </div>
            )}
            <InlineError message={err} />
            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button variant="outline" className="h-10 sm:h-9" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={link} disabled={busy || (inOtherHousehold && !moveOk)} className="h-10 sm:h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Linking…</> : <><Link2 className="h-4 w-4" aria-hidden="true" /> Link {firstName(picked)}</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FamilyHouseholdCard;
