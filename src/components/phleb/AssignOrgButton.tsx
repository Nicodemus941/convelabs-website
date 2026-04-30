/**
 * AssignOrgButton — phleb-side appointment → organization linker.
 *
 * Why this exists: when a phleb shows up to a draw and sees the lab
 * order is signed by a known practice (e.g. CNIM, NaturaMed), they can
 * link the appointment to that org on the spot — no waiting on admin.
 * That unlocks org-billed invoicing, branded patient portal, and roster
 * inclusion downstream.
 *
 * Maria Tejedor + Jewell Jamison were the trigger case: both belonged
 * to The Center for Natural & Integrative Medicine, but their appointments
 * had organization_id = null because they booked retail. Now any phleb
 * can fix that in 2 taps.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Building2, Check, Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  appointmentId: string;
  currentOrgId?: string | null;
  /** Compact "subtle" fits inline in tight cards. "primary" is full-width. */
  variant?: 'subtle' | 'primary';
  onAssigned?: (orgId: string | null, orgName: string | null) => void;
}

interface Org {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
}

const AssignOrgButton: React.FC<Props> = ({ appointmentId, currentOrgId, variant = 'subtle', onAssigned }) => {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState<string | null>(null); // org id being saved
  const [currentName, setCurrentName] = useState<string | null>(null);

  // Load the current org's name on mount so the button shows it
  useEffect(() => {
    if (!currentOrgId) { setCurrentName(null); return; }
    supabase.from('organizations').select('name').eq('id', currentOrgId).maybeSingle()
      .then(({ data }) => setCurrentName((data as any)?.name || null));
  }, [currentOrgId]);

  const loadOrgs = async () => {
    if (loaded) return;
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, contact_email, contact_phone')
      .order('name', { ascending: true })
      .limit(500);
    if (!error && data) setOrgs(data as any);
    setLoaded(true);
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

  const assign = async (org: Org | null) => {
    setSaving(org?.id || 'clear');
    try {
      const { error } = await supabase
        .from('appointments')
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

  const triggerLabel = currentName
    ? `Org: ${currentName.length > 22 ? currentName.slice(0, 22) + '…' : currentName}`
    : 'Assign organization';

  const trigger = variant === 'primary' ? (
    <Button
      type="button"
      onClick={() => { setOpen(true); loadOrgs(); }}
      className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 gap-1.5 h-9"
    >
      <Building2 className="h-4 w-4 text-[#B91C1C]" />
      <span className="text-sm">{triggerLabel}</span>
    </Button>
  ) : (
    <button
      type="button"
      onClick={() => { setOpen(true); loadOrgs(); }}
      className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-[#B91C1C] underline-offset-2 hover:underline"
    >
      <Building2 className="h-3 w-3" />
      {triggerLabel}
    </button>
  );

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#B91C1C]" />
              Assign to organization
            </DialogTitle>
            <DialogDescription className="text-xs">
              Pick the practice that referred this patient. Once linked, future visits, invoicing,
              and the practice's portal all see the connection.
            </DialogDescription>
          </DialogHeader>

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
              <span className="text-xs text-amber-900">
                Currently linked: <strong>{currentName || '…'}</strong>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-red-700 hover:bg-red-50"
                onClick={() => assign(null)}
                disabled={!!saving}
              >
                {saving === 'clear' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><X className="h-3 w-3 mr-1" /> Clear</>}
              </Button>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto divide-y rounded-md border bg-white">
            {!loaded ? (
              <div className="p-4 text-center text-xs text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">
                {orgs.length === 0 ? 'No organizations yet.' : 'No matches. Try a different search.'}
              </div>
            ) : (
              filtered.slice(0, 80).map((o) => {
                const isCurrent = o.id === currentOrgId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => !isCurrent && assign(o)}
                    disabled={!!saving || isCurrent}
                    className={`w-full text-left p-3 transition flex items-start justify-between gap-2 ${
                      isCurrent ? 'bg-gray-50 cursor-default' : 'hover:bg-red-50'
                    }`}
                  >
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

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={!!saving}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AssignOrgButton;
