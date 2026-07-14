import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Users, UserPlus, Link2, Loader2, ChevronRight, X, Search,
} from 'lucide-react';

/**
 * FamilyHouseholdCard — manage the family/household attached to one patient.
 *
 * Model: everyone sharing tenant_patients.household_id is one household;
 * household_relation labels each member (Self/Spouse/Child/Parent/…). The
 * chart owner is normalized to 'Self'. Adding the first member lazily mints a
 * household_id and stamps the chart owner as 'Self'.
 *
 * Two ways to add (owner chose both, 2026-07-14):
 *   • Add new    — creates a brand-new tenant_patient pre-filled with the
 *                  shared last name + address, then joins them to the household.
 *   • Link existing — search existing patients, attach one to the household.
 *
 * Payoff: once linked, admin booking (AddCompanionDialog) offers the household
 * as one-click companions — see that component's "Add from household" chips.
 */

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const RELATIONS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Other'] as const;

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
}

interface Props {
  patient: PatientLite;
  /** Called after any change so the parent can refresh the patient row. */
  onChanged?: () => void;
  /** Open another patient's chart (member row click). */
  onOpenPatient?: (patient: any) => void;
}

const fullName = (p: PatientLite) =>
  `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unnamed patient';

const FamilyHouseholdCard: React.FC<Props> = ({ patient, onChanged, onOpenPatient }) => {
  const [members, setMembers] = useState<PatientLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!patient?.household_id) { setMembers([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('tenant_patients' as any)
      .select('id, first_name, last_name, email, phone, date_of_birth, household_id, household_relation')
      .eq('household_id', patient.household_id)
      .is('deleted_at', null)
      .neq('id', patient.id)
      .order('household_relation', { ascending: true });
    setMembers((data as PatientLite[]) || []);
    setLoading(false);
  }, [patient?.household_id, patient?.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  // Ensure the chart owner belongs to a household, minting one on first add and
  // stamping them as 'Self'. Returns the household_id to attach members to.
  const ensureHousehold = useCallback(async (): Promise<string> => {
    if (patient.household_id) return patient.household_id;
    const newId = crypto.randomUUID();
    const { error } = await supabase
      .from('tenant_patients' as any)
      .update({ household_id: newId, household_relation: 'Self' })
      .eq('id', patient.id);
    if (error) throw error;
    // Reflect locally so subsequent adds reuse it without a refetch race.
    patient.household_id = newId;
    patient.household_relation = 'Self';
    return newId;
  }, [patient]);

  const afterChange = useCallback(async () => {
    await loadMembers();
    onChanged?.();
  }, [loadMembers, onChanged]);

  const unlinkMember = useCallback(async (m: PatientLite) => {
    const { error } = await supabase
      .from('tenant_patients' as any)
      .update({ household_id: null, household_relation: null })
      .eq('id', m.id);
    if (error) { toast.error('Could not remove from household'); return; }
    toast.success(`${fullName(m)} removed from the household`);
    afterChange();
  }, [afterChange]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-[#B91C1C]" />
            Family / Household
            {members.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px]">{members.length + 1} people</Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8" onClick={() => setLinkOpen(true)}>
              <Link2 className="h-3.5 w-3.5 mr-1" /> Link existing
            </Button>
            <Button size="sm" className="h-8 bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Add new
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-12 bg-muted/50 animate-pulse rounded" />
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No family members linked yet. Add a spouse, child, or parent to book them together and share one address.
          </p>
        ) : (
          <div className="divide-y">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2.5 gap-3 group">
                <button
                  type="button"
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  onClick={() => onOpenPatient?.(m)}
                >
                  <div className="w-9 h-9 rounded-full bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0">
                    <Users className="h-4 w-4 text-[#B91C1C]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{fullName(m)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.household_relation || 'Family'}
                      {m.date_of_birth ? ` · DOB ${m.date_of_birth}` : ''}
                      {m.phone ? ` · ${m.phone}` : ''}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600"
                    title="Remove from household"
                    onClick={() => unlinkMember(m)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AddNewMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        primary={patient}
        ensureHousehold={ensureHousehold}
        onDone={afterChange}
      />
      <LinkExistingDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        primary={patient}
        existingMemberIds={useMemo(() => new Set(members.map((m) => m.id)), [members])}
        ensureHousehold={ensureHousehold}
        onDone={afterChange}
      />
    </Card>
  );
};

// ── Add a brand-new patient into the household ──────────────────────
const AddNewMemberDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  primary: PatientLite;
  ensureHousehold: () => Promise<string>;
  onDone: () => void;
}> = ({ open, onOpenChange, primary, ensureHousehold, onDone }) => {
  const [form, setForm] = useState({
    firstName: '', lastName: primary.last_name || '', dob: '', email: '', phone: '', relation: 'Child',
    shareAddress: true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Re-seed last name whenever the dialog opens for a different primary.
  useEffect(() => {
    if (open) setForm((f) => ({ ...f, lastName: primary.last_name || '' }));
  }, [open, primary.last_name]);

  const submit = async () => {
    setErr('');
    if (!form.firstName.trim()) { setErr('First name is required'); return; }
    setBusy(true);
    try {
      if (form.email.trim()) {
        const { data: existing } = await supabase
          .from('tenant_patients' as any).select('id').ilike('email', form.email.trim()).maybeSingle();
        if (existing) { setErr('A patient with this email already exists — use "Link existing" instead.'); setBusy(false); return; }
      }
      const householdId = await ensureHousehold();
      const { data, error } = await supabase.from('tenant_patients' as any).insert({
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
      }).select().single();
      if (error) throw error;
      if (!data) throw new Error('Member was not created');
      toast.success(`${form.firstName} added to the household`);
      setForm({ firstName: '', lastName: primary.last_name || '', dob: '', email: '', phone: '', relation: 'Child', shareAddress: true });
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'Could not add the family member');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a family member</DialogTitle>
          <DialogDescription>
            Creates a new patient linked to {fullName(primary)}'s household.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First name</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Last name</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Select value={form.relation} onValueChange={(v) => setForm({ ...form, relation: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date of birth</Label>
              <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox" checked={form.shareAddress}
              onChange={(e) => setForm({ ...form, shareAddress: e.target.checked })}
            />
            Share {fullName(primary)}'s address
            {primary.address ? ` (${[primary.address, primary.city].filter(Boolean).join(', ')})` : ' (no address on file)'}
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : <><UserPlus className="mr-2 h-4 w-4" />Add to household</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Link an existing patient into the household ─────────────────────
const LinkExistingDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  primary: PatientLite;
  existingMemberIds: Set<string>;
  ensureHousehold: () => Promise<string>;
  onDone: () => void;
}> = ({ open, onOpenChange, primary, existingMemberIds, ensureHousehold, onDone }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PatientLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [relation, setRelation] = useState('Spouse');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setQ(''); setResults([]); return; }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('tenant_patients' as any)
        .select('id, first_name, last_name, email, phone, date_of_birth, household_id')
        .is('deleted_at', null)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(20);
      if (cancelled) return;
      const filtered = ((data as PatientLite[]) || []).filter(
        (p) => p.id !== primary.id && !existingMemberIds.has(p.id)
      );
      setResults(filtered);
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, primary.id, existingMemberIds]);

  const link = async (p: PatientLite) => {
    setBusyId(p.id);
    try {
      const householdId = await ensureHousehold();
      const { error } = await supabase
        .from('tenant_patients' as any)
        .update({ household_id: householdId, household_relation: relation })
        .eq('id', p.id);
      if (error) throw error;
      toast.success(`${fullName(p)} linked as ${relation.toLowerCase()}`);
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message || 'Could not link that patient');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link an existing patient</DialogTitle>
          <DialogDescription>
            Attach an existing patient to {fullName(primary)}'s household.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Their relationship</Label>
            <Select value={relation} onValueChange={setRelation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8" placeholder="Search by name or email…"
              value={q} onChange={(e) => setQ(e.target.value)} autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto divide-y rounded-md border">
            {searching ? (
              <p className="text-sm text-muted-foreground p-3">Searching…</p>
            ) : q.trim().length < 2 ? (
              <p className="text-sm text-muted-foreground p-3">Type at least 2 characters to search.</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3">No matching patients.</p>
            ) : (
              results.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2.5 gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{fullName(p)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.email || p.phone || '—'}
                      {p.household_id ? ' · already in a household' : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 flex-shrink-0"
                    disabled={busyId === p.id} onClick={() => link(p)}>
                    {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Link'}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FamilyHouseholdCard;
