/**
 * AssignOrgButton — phleb-side appointment → organization linker, viewer,
 * and inline editor.
 *
 * Three things a phleb in the field can now do without waiting on admin:
 *   1. ASSIGN — search + tap to link an appointment to a known practice
 *   2. VIEW   — see the org's contact, hours, lab accounts, providers,
 *               so the phleb knows where to deliver and who to contact
 *   3. EDIT   — fix a stale phone, add a missing lab account, update
 *               hours of operation, set manager / front-desk emails
 *
 * The trigger button shows the currently-linked org name (or "Assign
 * organization" if none). Tap → dialog opens with a tabbed surface.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Building2, Check, Loader2, Search, X, Eye, Pencil, LinkIcon,
  Phone, Mail, FileText, Clock, FlaskConical, UserCog, Save, ArrowLeft,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  appointmentId: string;
  currentOrgId?: string | null;
  /** Compact "subtle" fits inline in tight cards. "primary" is full-width. */
  variant?: 'subtle' | 'primary';
  onAssigned?: (orgId: string | null, orgName: string | null) => void;
}

interface OrgSummary {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
}

interface OrgDetail extends OrgSummary {
  manager_email: string | null;
  front_desk_email: string | null;
  fax: string | null;
  hours_of_operation: any | null;
  lab_accounts: any | null;
  default_billed_to: string | null;
}

interface ProviderRow {
  id: string;
  full_name: string;
  npi: string | null;
  email: string | null;
  phone: string | null;
}

type Tab = 'view' | 'assign' | 'edit';

const LAB_OPTIONS = ['Quest Diagnostics', 'LabCorp', 'AdventHealth', 'Orlando Health', 'Genova Diagnostics', 'Mayo Clinic Labs'];

const AssignOrgButton: React.FC<Props> = ({ appointmentId, currentOrgId, variant = 'subtle', onAssigned }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('view');

  // Search list
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  // Current org
  const [current, setCurrent] = useState<OrgDetail | null>(null);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderRow[]>([]);

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<OrgDetail>>({});
  const [editSaving, setEditSaving] = useState(false);

  const loadCurrent = useCallback(async () => {
    if (!currentOrgId) { setCurrent(null); setCurrentName(null); setProviders([]); return; }
    const [{ data: org }, { data: provs }] = await Promise.all([
      supabase.from('organizations')
        .select('id, name, contact_email, contact_phone, manager_email, front_desk_email, fax, hours_of_operation, lab_accounts, default_billed_to')
        .eq('id', currentOrgId).maybeSingle(),
      supabase.from('org_providers' as any)
        .select('id, full_name, npi, email, phone')
        .eq('organization_id', currentOrgId)
        .eq('active', true)
        .order('full_name'),
    ]);
    if (org) {
      setCurrent(org as any);
      setCurrentName((org as any).name || null);
    }
    setProviders((provs as any) || []);
  }, [currentOrgId]);

  useEffect(() => { loadCurrent(); }, [loadCurrent]);

  const loadOrgs = async () => {
    if (orgsLoaded) return;
    const { data } = await supabase.from('organizations')
      .select('id, name, contact_email, contact_phone')
      .order('name', { ascending: true })
      .limit(500);
    setOrgs((data as any) || []);
    setOrgsLoaded(true);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return orgs;
    return orgs.filter(o =>
      o.name.toLowerCase().includes(needle) ||
      (o.contact_email || '').toLowerCase().includes(needle) ||
      (o.contact_phone || '').replace(/\D/g, '').includes(needle.replace(/\D/g, ''))
    );
  }, [orgs, q]);

  const assign = async (org: OrgSummary | null) => {
    setSaving(org?.id || 'clear');
    try {
      const { error } = await supabase.from('appointments')
        .update({ organization_id: org?.id || null, updated_at: new Date().toISOString() })
        .eq('id', appointmentId);
      if (error) throw error;
      toast.success(org ? `Linked to ${org.name}` : 'Organization cleared');
      setCurrentName(org?.name || null);
      onAssigned?.(org?.id || null, org?.name || null);
      setOpen(false);
      setQ('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update');
    } finally {
      setSaving(null);
    }
  };

  const startEdit = () => {
    if (!current) return;
    setEditForm({
      contact_email: current.contact_email || '',
      contact_phone: current.contact_phone || '',
      manager_email: current.manager_email || '',
      front_desk_email: current.front_desk_email || '',
      fax: current.fax || '',
      lab_accounts: current.lab_accounts || [],
    });
    setTab('edit');
  };

  const saveEdit = async () => {
    if (!current) return;
    setEditSaving(true);
    try {
      const { error } = await supabase.from('organizations')
        .update({
          contact_email: editForm.contact_email || null,
          contact_phone: editForm.contact_phone || null,
          manager_email: editForm.manager_email || null,
          front_desk_email: editForm.front_desk_email || null,
          fax: editForm.fax || null,
          lab_accounts: Array.isArray(editForm.lab_accounts) ? editForm.lab_accounts : null,
        })
        .eq('id', current.id);
      if (error) throw error;
      toast.success('Org details updated');
      await loadCurrent();
      setTab('view');
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setEditSaving(false);
    }
  };

  const toggleLab = (lab: string) => {
    const existing: string[] = Array.isArray(editForm.lab_accounts) ? editForm.lab_accounts : [];
    setEditForm(f => ({
      ...f,
      lab_accounts: existing.includes(lab) ? existing.filter(l => l !== lab) : [...existing, lab],
    }));
  };

  // Open behavior: if linked, default to View. If not, default to Assign.
  const openDialog = () => {
    setTab(currentOrgId ? 'view' : 'assign');
    setOpen(true);
    if (!currentOrgId || tab === 'assign') loadOrgs();
  };

  const triggerLabel = currentName
    ? `Org: ${currentName.length > 22 ? currentName.slice(0, 22) + '…' : currentName}`
    : 'Assign organization';

  const trigger = variant === 'primary' ? (
    <Button
      type="button"
      onClick={openDialog}
      className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 gap-1.5 h-9"
    >
      <Building2 className="h-4 w-4 text-[#B91C1C]" />
      <span className="text-sm">{triggerLabel}</span>
    </Button>
  ) : (
    <button
      type="button"
      onClick={openDialog}
      className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-[#B91C1C] underline-offset-2 hover:underline"
    >
      <Building2 className="h-3 w-3" />
      {triggerLabel}
    </button>
  );

  const fmtHours = (h: any) => {
    if (!h || typeof h !== 'object') return null;
    const days = ['mon','tue','wed','thu','fri','sat','sun'];
    const labels: Record<string,string> = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };
    return days.map(d => {
      const v = (h as any)[d];
      if (!v || v.closed) return `${labels[d]}: closed`;
      return `${labels[d]}: ${v.open || ''} – ${v.close || ''}`;
    }).join(' · ');
  };

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={(v) => { if (!editSaving && !saving) setOpen(v); }}>
        <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#B91C1C]" />
              {tab === 'edit' ? `Edit ${currentName || 'organization'}` : 'Organization'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {tab === 'view' && currentName && 'Linked to this appointment. Tap Edit to update details.'}
              {tab === 'assign' && 'Pick the practice that referred this patient. Once linked, future visits + invoicing show the connection.'}
              {tab === 'edit' && 'Update contact, email recipients, fax, and lab accounts. Saves immediately.'}
            </DialogDescription>
          </DialogHeader>

          {/* Tab strip */}
          <div className="flex gap-1 -mt-1 border-b">
            <button onClick={() => setTab('view')}
              disabled={!currentOrgId}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1 ${
                tab === 'view' ? 'border-[#B91C1C] text-[#B91C1C]' : 'border-transparent text-gray-500 hover:text-gray-800 disabled:opacity-40'
              }`}>
              <Eye className="h-3 w-3" /> View
            </button>
            <button onClick={() => { setTab('assign'); loadOrgs(); }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1 ${
                tab === 'assign' ? 'border-[#B91C1C] text-[#B91C1C]' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              <LinkIcon className="h-3 w-3" /> {currentOrgId ? 'Reassign' : 'Assign'}
            </button>
            <button onClick={() => startEdit()}
              disabled={!currentOrgId}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1 ${
                tab === 'edit' ? 'border-[#B91C1C] text-[#B91C1C]' : 'border-transparent text-gray-500 hover:text-gray-800 disabled:opacity-40'
              }`}>
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>

          {/* VIEW */}
          {tab === 'view' && current && (
            <div className="space-y-3 pt-1">
              <div className="rounded-lg border bg-gray-50 p-3 space-y-1.5">
                <div className="text-sm font-semibold text-gray-900">{current.name}</div>
                {current.contact_phone && (
                  <div className="text-xs text-gray-700 flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-gray-400" />
                    <a href={`tel:${current.contact_phone}`} className="text-[#B91C1C] hover:underline">{current.contact_phone}</a>
                  </div>
                )}
                {current.contact_email && (
                  <div className="text-xs text-gray-700 flex items-center gap-1.5">
                    <Mail className="h-3 w-3 text-gray-400" />
                    <a href={`mailto:${current.contact_email}`} className="text-[#B91C1C] hover:underline">{current.contact_email}</a>
                  </div>
                )}
                {current.fax && (
                  <div className="text-xs text-gray-700 flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-gray-400" />
                    Fax: {current.fax}
                  </div>
                )}
                {current.manager_email && (
                  <div className="text-xs text-gray-700 flex items-center gap-1.5">
                    <UserCog className="h-3 w-3 text-gray-400" /> Manager: {current.manager_email}
                  </div>
                )}
                {current.front_desk_email && (
                  <div className="text-xs text-gray-700 flex items-center gap-1.5">
                    <UserCog className="h-3 w-3 text-gray-400" /> Front desk: {current.front_desk_email}
                  </div>
                )}
              </div>

              {Array.isArray(current.lab_accounts) && current.lab_accounts.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5 flex items-center gap-1">
                    <FlaskConical className="h-3 w-3" /> Lab accounts
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(current.lab_accounts as string[]).map(l => (
                      <span key={l} className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">{l}</span>
                    ))}
                  </div>
                </div>
              )}

              {current.hours_of_operation && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Hours of operation
                  </div>
                  <p className="text-[11px] text-gray-700 leading-relaxed">{fmtHours(current.hours_of_operation)}</p>
                </div>
              )}

              {providers.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">Providers</div>
                  <div className="space-y-1">
                    {providers.map(p => (
                      <div key={p.id} className="text-[11px] text-gray-700">
                        <strong>{p.full_name}</strong>{p.npi && <span className="text-gray-500"> · NPI {p.npi}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
                <Button size="sm" onClick={startEdit} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Edit details
                </Button>
              </div>
            </div>
          )}

          {/* ASSIGN */}
          {tab === 'assign' && (
            <div className="space-y-2 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search practices…"
                  className="pl-9 h-10"
                />
              </div>

              {currentOrgId && (
                <div className="flex items-center justify-between p-2 rounded-md bg-amber-50 border border-amber-200">
                  <span className="text-xs text-amber-900">Currently linked: <strong>{currentName || '…'}</strong></span>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-red-700 hover:bg-red-50"
                    onClick={() => assign(null)} disabled={!!saving}>
                    {saving === 'clear' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><X className="h-3 w-3 mr-1" /> Clear</>}
                  </Button>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto divide-y rounded-md border bg-white">
                {!orgsLoaded ? (
                  <div className="p-4 text-center text-xs text-gray-500"><Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Loading…</div>
                ) : filtered.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-500">{orgs.length === 0 ? 'No organizations yet.' : 'No matches.'}</div>
                ) : (
                  filtered.slice(0, 80).map((o) => {
                    const isCurrent = o.id === currentOrgId;
                    return (
                      <button key={o.id} type="button"
                        onClick={() => !isCurrent && assign(o)}
                        disabled={!!saving || isCurrent}
                        className={`w-full text-left p-3 transition flex items-start justify-between gap-2 ${
                          isCurrent ? 'bg-gray-50 cursor-default' : 'hover:bg-red-50'
                        }`}>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{o.name}</div>
                          {(o.contact_email || o.contact_phone) && (
                            <div className="text-[11px] text-gray-500 truncate">
                              {o.contact_email}{o.contact_email && o.contact_phone && ' · '}{o.contact_phone}
                            </div>
                          )}
                        </div>
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                            <Check className="h-3 w-3" /> Current
                          </span>
                        ) : saving === o.id ? (
                          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-gray-400" />
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={!!saving}>Cancel</Button>
              </div>
            </div>
          )}

          {/* EDIT */}
          {tab === 'edit' && current && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={editForm.contact_phone || ''} onChange={e => setEditForm(f => ({ ...f, contact_phone: e.target.value }))} className="h-9" placeholder="(407) 555-1234" />
                </div>
                <div>
                  <Label className="text-xs">Fax</Label>
                  <Input value={editForm.fax || ''} onChange={e => setEditForm(f => ({ ...f, fax: e.target.value }))} className="h-9" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Practice contact email</Label>
                  <Input type="email" value={editForm.contact_email || ''} onChange={e => setEditForm(f => ({ ...f, contact_email: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Manager email</Label>
                  <Input type="email" value={editForm.manager_email || ''} onChange={e => setEditForm(f => ({ ...f, manager_email: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Front-desk email</Label>
                  <Input type="email" value={editForm.front_desk_email || ''} onChange={e => setEditForm(f => ({ ...f, front_desk_email: e.target.value }))} className="h-9" />
                </div>
              </div>

              <div>
                <Label className="text-xs">Lab accounts</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {LAB_OPTIONS.map(lab => {
                    const on = Array.isArray(editForm.lab_accounts) && (editForm.lab_accounts as string[]).includes(lab);
                    return (
                      <button key={lab} type="button" onClick={() => toggleLab(lab)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                          on ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white border-gray-300 text-gray-700 hover:border-[#B91C1C]'
                        }`}>{lab}</button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Tap to toggle. These default the specimen routing.</p>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setTab('view')} disabled={editSaving} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <Button size="sm" onClick={saveEdit} disabled={editSaving} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 min-w-[120px]">
                  {editSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving</> : <><Save className="h-3.5 w-3.5" /> Save changes</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AssignOrgButton;
