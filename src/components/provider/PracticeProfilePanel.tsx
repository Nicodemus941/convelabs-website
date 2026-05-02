/**
 * PRACTICE PROFILE PANEL
 *
 * Hormozi-structured org-completeness flow. Single-canvas form (no
 * abandonment-prone wizard), save-as-you-go (every blur autosaves),
 * progress bar that visibly unlocks features:
 *   • 50%+  → patient booking links work
 *   • 80%+  → patient roster appears + "Add patient" button enables
 *   • 100%  → org-billed monthly invoicing eligible (real $ unlock)
 *
 * Reciprocity: each completion stage shows what just unlocked. Field
 * labels explain WHY ("for results routing", "for invoice delivery") so
 * the provider feels the trade, not the demand.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, CheckCircle2, Lock, Sparkles } from 'lucide-react';
import AddressAutocomplete from '@/components/ui/address-autocomplete';

interface OrgProvider {
  id: string;
  full_name: string;
  npi: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  is_primary: boolean;
}

interface OrgRow {
  id: string;
  name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  fax: string | null;
  manager_email: string | null;
  front_desk_email: string | null;
  billing_email: string | null;
  hours_of_operation: any;
  lab_accounts: any;
}

const FIELD_LABELS: Record<string, string> = {
  org_name: 'Organization name',
  contact_email: 'Main contact email',
  contact_phone: 'Main phone',
  address: 'Practice address',
  fax: 'Fax (for results routing)',
  manager_email: "Office manager's email",
  front_desk_email: 'Front-desk email',
  hours_of_operation: 'Hours of operation',
  lab_accounts: 'Laboratory accounts',
  providers: 'At least one provider',
  provider_npi: "Primary provider's NPI",
  billing_email: 'Billing email (for org-billed invoices)',
};

const LAB_OPTIONS = ['Quest Diagnostics', 'LabCorp', 'AdventHealth', 'Orlando Health', 'Genova Diagnostics', 'Mayo Clinic Labs'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export const PracticeProfilePanel: React.FC<{ orgId: string }> = ({ orgId }) => {
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [providers, setProviders] = useState<OrgProvider[]>([]);
  const [pct, setPct] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [{ data: orgRow }, { data: provs }, { data: pctRow }] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
      supabase.from('org_providers' as any).select('*').eq('organization_id', orgId).eq('active', true).order('is_primary', { ascending: false }),
      supabase.rpc('get_org_profile_completeness' as any, { p_org_id: orgId }),
    ]);
    setOrg(orgRow as any);
    setProviders((provs as any[]) || []);
    if (pctRow && (pctRow as any[])[0]) {
      setPct(((pctRow as any[])[0]).pct);
      setMissing(((pctRow as any[])[0]).missing || []);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveField = async (col: string, value: any) => {
    setSaving(col);
    try {
      const { error } = await supabase.from('organizations').update({ [col]: value, updated_at: new Date().toISOString() } as any).eq('id', orgId);
      if (error) throw error;
      await refresh();
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message || 'unknown'}`);
    } finally {
      setSaving(null);
    }
  };

  const addProvider = async () => {
    const name = prompt('Provider full name (e.g., Dr. Jane Doe, MD)');
    if (!name?.trim()) return;
    const npi = prompt("Provider's 10-digit NPI (optional but recommended)") || null;
    const email = prompt("Provider's email (optional)") || null;
    setSaving('add_provider');
    try {
      const { error } = await supabase.from('org_providers' as any).insert({
        organization_id: orgId,
        full_name: name.trim(),
        npi: npi?.trim() || null,
        email: email?.trim() || null,
        is_primary: providers.length === 0,
      } as any);
      if (error) throw error;
      toast.success('Provider added');
      await refresh();
    } catch (e: any) {
      toast.error(`Add failed: ${e?.message || 'unknown'}`);
    } finally { setSaving(null); }
  };

  const removeProvider = async (id: string) => {
    if (!confirm('Remove this provider?')) return;
    await supabase.from('org_providers' as any).update({ active: false } as any).eq('id', id);
    await refresh();
  };

  const toggleLab = async (lab: string) => {
    const current: any[] = Array.isArray(org?.lab_accounts) ? (org!.lab_accounts as any[]) : [];
    const exists = current.some((l: any) => l.lab === lab);
    const next = exists ? current.filter((l: any) => l.lab !== lab) : [...current, { lab, account_id: '', primary_lab: current.length === 0 }];
    await saveField('lab_accounts', next);
  };

  const setHours = async (day: string, key: 'open' | 'close' | 'closed', val: string | boolean) => {
    const current = (org?.hours_of_operation as any) || {};
    const dayObj = current[day] || {};
    if (key === 'closed' && val === true) {
      current[day] = { closed: true };
    } else {
      current[day] = { ...dayObj, [key]: val, closed: false };
    }
    await saveField('hours_of_operation', current);
  };

  if (loading) {
    return (
      <Card><CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading practice profile…
      </CardContent></Card>
    );
  }

  if (!org) return null;

  const unlocked = (threshold: number) => pct >= threshold;
  const labAccounts: any[] = Array.isArray(org.lab_accounts) ? (org.lab_accounts as any[]) : [];
  const hours: Record<string, any> = (org.hours_of_operation as any) || {};

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#B91C1C]" /> Practice profile
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Complete your profile to unlock more features. Auto-saves as you fill.
            </p>
          </div>
          <Badge className={`${pct >= 100 ? 'bg-emerald-100 text-emerald-800' : pct >= 80 ? 'bg-blue-100 text-blue-800' : pct >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'} text-xs`}>
            {pct}% complete
          </Badge>
        </div>

        {/* Progress bar with unlock markers */}
        <div className="mt-3">
          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden relative">
            <div
              className={`h-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-blue-500' : pct >= 50 ? 'bg-amber-500' : 'bg-gray-400'}`}
              style={{ width: `${pct}%` }}
            />
            <div className="absolute top-0 left-[50%] h-full w-px bg-white/60" />
            <div className="absolute top-0 left-[80%] h-full w-px bg-white/60" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
            <div className={`flex items-center gap-1 ${unlocked(50) ? 'text-emerald-700' : 'text-gray-400'}`}>
              {unlocked(50) ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              50% — patient booking links live
            </div>
            <div className={`flex items-center gap-1 ${unlocked(80) ? 'text-emerald-700' : 'text-gray-400'}`}>
              {unlocked(80) ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              80% — patient roster
            </div>
            <div className={`flex items-center gap-1 ${unlocked(100) ? 'text-emerald-700' : 'text-gray-400'}`}>
              {unlocked(100) ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              100% — org-billed monthly invoicing
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">

        {/* CORE CONTACT */}
        <Section title="Core contact" hint="Used on every confirmation, invoice, and result routing">
          <Field label="Organization name" value={org.name || ''} onSave={(v) => saveField('name', v)} saving={saving === 'name'} />
          <Field label="Main contact email" value={org.contact_email || ''} onSave={(v) => saveField('contact_email', v)} saving={saving === 'contact_email'} type="email" />
          <Field label="Main phone" value={org.contact_phone || ''} onSave={(v) => saveField('contact_phone', v)} saving={saving === 'contact_phone'} />
          {/* Practice address — Google Places autocomplete so we capture a
              clean, validated formatted address (street + city + state + zip
              all in one), matching the patient booking flow. Save policy
              mirrors other Fields: persists on place-selected (instant) OR
              on a 1.2s typing pause (debounced) so we don't hit DB per
              keystroke. */}
          <AddressField
            value={org.address || ''}
            saving={saving === 'address'}
            onSave={(v) => saveField('address', v)}
          />
          <Field label="Fax (for results routing)" value={org.fax || ''} onSave={(v) => saveField('fax', v)} saving={saving === 'fax'} />
        </Section>

        {/* TEAM EMAILS */}
        <Section title="Team emails" hint="So the right person gets the right notifications — confirmations to front desk, escalations to manager, billing to billing">
          <Field label="Office manager email" value={org.manager_email || ''} onSave={(v) => saveField('manager_email', v)} saving={saving === 'manager_email'} type="email" />
          <Field label="Front-desk email" value={org.front_desk_email || ''} onSave={(v) => saveField('front_desk_email', v)} saving={saving === 'front_desk_email'} type="email" />
          <Field label="Billing email" value={org.billing_email || ''} onSave={(v) => saveField('billing_email', v)} saving={saving === 'billing_email'} type="email" hint="Used for org-billed monthly invoices" />
        </Section>

        {/* PROVIDERS */}
        <Section title="Providers" hint="Each provider's NPI lets us sign lab orders correctly + auto-route results">
          <div className="space-y-2">
            {providers.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-md p-2 text-sm">
                <div className="flex-1">
                  <p className="font-medium">{p.full_name} {p.is_primary && <Badge variant="outline" className="ml-1 text-[10px]">primary</Badge>}</p>
                  <p className="text-xs text-gray-500">
                    {p.npi ? `NPI ${p.npi}` : <span className="text-amber-700">No NPI on file</span>}
                    {p.email && <> · {p.email}</>}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeProvider(p.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addProvider} disabled={saving === 'add_provider'} className="gap-1.5">
              {saving === 'add_provider' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add a provider
            </Button>
          </div>
        </Section>

        {/* HOURS OF OPERATION */}
        <Section title="Hours of operation" hint="So patients see slots that work for your office's pickup/drop windows">
          <div className="space-y-1.5">
            {DAYS.map(d => {
              const dh = hours[d] || {};
              const isClosed = dh.closed === true;
              return (
                <div key={d} className="flex items-center gap-2 text-sm">
                  <span className="w-12 font-medium text-gray-700">{DAY_LABELS[d]}</span>
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={isClosed} onChange={e => setHours(d, 'closed', e.target.checked)} />
                    Closed
                  </label>
                  {!isClosed && (
                    <>
                      <Input type="time" defaultValue={dh.open || '09:00'} className="h-8 w-[110px] text-xs" onBlur={e => setHours(d, 'open', e.target.value)} />
                      <span className="text-xs text-gray-500">to</span>
                      <Input type="time" defaultValue={dh.close || '17:00'} className="h-8 w-[110px] text-xs" onBlur={e => setHours(d, 'close', e.target.value)} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* LAB ACCOUNTS — multi-select. Practices commonly have accounts
            with 2-3 labs (Quest + LabCorp is the most common combo). The
            previous styling was too subtle to read as "selected vs not"
            so users thought it was single-select. Solid emerald fill on
            active + checkmark + a running count up top makes it obvious. */}
        <Section title="Laboratory accounts" hint="Tells us which labs your patients' results should route to. We send specimens to the lab the patient picks at booking — but knowing your accounts means we can default to the right one. Most practices select 2-3.">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-700">
              <strong>Select all that apply</strong>
              {labAccounts.length > 0 && <span className="text-emerald-700"> · {labAccounts.length} selected</span>}
            </p>
            {labAccounts.length === 0 && (
              <span className="text-[10px] text-gray-400">Tap each lab you have an account with</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {LAB_OPTIONS.map(lab => {
              const active = labAccounts.some((l: any) => l.lab === lab);
              return (
                <button
                  key={lab}
                  type="button"
                  onClick={() => toggleLab(lab)}
                  aria-pressed={active}
                  className={`text-xs px-3 py-1.5 rounded-full border-2 transition font-medium ${
                    active
                      ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-emerald-400 hover:bg-emerald-50'
                  }`}
                >
                  {active
                    ? <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                    : <Plus className="h-3 w-3 inline mr-1 -mt-0.5 text-gray-400" />}
                  {lab}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            {labAccounts.length === 0
              ? 'No accounts selected yet. Tap each lab — we\'ll only set up account-specific routing once you tell us which ones you have.'
              : labAccounts.length === 1
                ? 'Got 1. If you have accounts with more labs, add them too — we\'ll route results to the right one for each patient.'
                : `Great — ${labAccounts.length} accounts on file. We'll route every patient's results to the lab their order specifies.`}
          </p>
        </Section>

        {/* MISSING PROMPTS */}
        {missing.length > 0 && pct < 100 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-900 mb-1">Still to fill ({missing.length})</p>
            <ul className="text-[11px] text-amber-800 space-y-0.5">
              {missing.slice(0, 6).map(m => (
                <li key={m}>• {FIELD_LABELS[m] || m}</li>
              ))}
              {missing.length > 6 && <li className="text-amber-700">… and {missing.length - 6} more</li>}
            </ul>
          </div>
        )}

        {pct >= 100 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-emerald-900">100% complete — all features unlocked</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">Your practice is eligible for org-billed monthly invoicing. Reach out if you'd like to switch from per-visit patient-billed.</p>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
};

const Section: React.FC<React.PropsWithChildren<{ title: string; hint?: string }>> = ({ title, hint, children }) => (
  <div>
    <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
    {hint && <p className="text-[11px] text-gray-500 mb-3">{hint}</p>}
    {children}
  </div>
);

/**
 * AddressField — Google Places-backed practice address with debounced
 * save (1.2s after last keystroke) + instant save on place-pick. Avoids
 * the per-keystroke DB write that would happen if we saved on every
 * onChange.
 */
const AddressField: React.FC<{
  value: string;
  saving?: boolean;
  onSave: (v: string) => Promise<void> | void;
}> = ({ value, saving, onSave }) => {
  const [local, setLocal] = useState(value);
  const dirtyRef = useRef(false);
  const timerRef = useRef<any>(null);

  useEffect(() => { setLocal(value); }, [value]);

  // Debounced save on plain typing
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (local !== value) onSave(local);
      dirtyRef.current = false;
    }, 1200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [local, value, onSave]);

  return (
    <div className="space-y-1 mb-2">
      <Label className="text-xs">
        Practice address {saving && <Loader2 className="h-3 w-3 animate-spin inline ml-1 text-gray-400" />}
      </Label>
      <AddressAutocomplete
        value={local}
        onChange={(v) => { dirtyRef.current = true; setLocal(v); }}
        onPlaceSelected={(place) => {
          // Pick a suggestion → save the canonical formatted address
          // immediately (skip debounce). Cancel any pending timer.
          if (timerRef.current) clearTimeout(timerRef.current);
          dirtyRef.current = false;
          const formatted = place.address || place.street;
          setLocal(formatted);
          onSave(formatted);
        }}
        placeholder="Start typing your practice address…"
      />
      <p className="text-[10px] text-gray-500">Used on every confirmation, invoice, and Maps directions for the phleb</p>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onSave: (v: string) => Promise<void> | void;
  saving?: boolean;
  type?: string;
  hint?: string;
}> = ({ label, value, onSave, saving, type = 'text', hint }) => {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="space-y-1 mb-2">
      <Label className="text-xs">{label} {saving && <Loader2 className="h-3 w-3 animate-spin inline ml-1 text-gray-400" />}</Label>
      <Input
        type={type}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onSave(local); }}
        className="h-9 text-sm"
      />
      {hint && <p className="text-[10px] text-gray-500">{hint}</p>}
    </div>
  );
};

export default PracticeProfilePanel;
