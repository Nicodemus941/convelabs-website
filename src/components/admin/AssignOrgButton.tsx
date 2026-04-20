import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Building2, Search, Loader2, CheckCircle2, Sparkles, X, Star } from 'lucide-react';

/**
 * AssignOrgButton — admin-only, MULTI-ORG link.
 *
 * Appointments can now notify multiple organizations. Common case:
 * patient's PCP + their concierge doctor + corporate wellness sponsor
 * all want the delivery receipt.
 *
 * Model:
 *   - ONE org is designated 'primary' (who ordered the labs / pays)
 *   - 0+ additional orgs are 'cc' (receive delivery notifications only)
 *   - Delivery notification loops every linked org (primary + cc)
 *   - Dedup per-appointment-per-org
 *
 * Also exposes the Hormozi auto-match as a one-click "add suggested" chip.
 */

interface Props {
  appointmentId: string;
  patientEmail?: string | null;
  onAssigned?: () => void;
  size?: 'sm' | 'default';
}

interface Org {
  id: string;
  name: string;
  billing_email?: string | null;
  contact_email?: string | null;
}

interface LinkedOrg {
  organization_id: string;
  role: 'primary' | 'cc';
  notified_delivery_at: string | null;
}

const AssignOrgButton: React.FC<Props> = ({ appointmentId, patientEmail, onAssigned, size = 'sm' }) => {
  const [open, setOpen] = useState(false);
  const [allOrgs, setAllOrgs] = useState<Org[]>([]);
  const [linkedOrgs, setLinkedOrgs] = useState<LinkedOrg[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [suggestedOrgId, setSuggestedOrgId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: orgs }, { data: links }, suggestedRes] = await Promise.all([
        supabase.from('organizations').select('id, name, billing_email, contact_email')
          .eq('is_active', true).order('name'),
        supabase.from('appointment_organizations').select('organization_id, role, notified_delivery_at')
          .eq('appointment_id', appointmentId),
        patientEmail
          ? supabase.rpc('find_best_org_for_patient' as any, { p_email: patientEmail })
          : Promise.resolve({ data: null } as any),
      ]);
      setAllOrgs((orgs as Org[]) || []);
      setLinkedOrgs((links as LinkedOrg[]) || []);
      setSuggestedOrgId(typeof suggestedRes?.data === 'string' ? suggestedRes.data : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open, appointmentId, patientEmail]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOrgs;
    return allOrgs.filter(o =>
      o.name?.toLowerCase().includes(q) ||
      o.billing_email?.toLowerCase().includes(q) ||
      o.contact_email?.toLowerCase().includes(q)
    );
  }, [allOrgs, search]);

  const linkedMap = useMemo(() => {
    const m = new Map<string, LinkedOrg>();
    for (const l of linkedOrgs) m.set(l.organization_id, l);
    return m;
  }, [linkedOrgs]);

  const primaryOrg = linkedOrgs.find(l => l.role === 'primary');
  const ccOrgs = linkedOrgs.filter(l => l.role === 'cc');
  const buttonLabel = linkedOrgs.length === 0
    ? 'Link org'
    : linkedOrgs.length === 1
    ? `Org: ${allOrgs.find(o => o.id === primaryOrg?.organization_id)?.name || 'Assigned'}`
    : `${linkedOrgs.length} orgs linked`;

  const addOrg = async (orgId: string, role: 'primary' | 'cc') => {
    setSubmittingId(orgId);
    try {
      // If adding as primary, demote existing primary to cc
      if (role === 'primary' && primaryOrg && primaryOrg.organization_id !== orgId) {
        await supabase.from('appointment_organizations')
          .update({ role: 'cc' })
          .eq('appointment_id', appointmentId)
          .eq('organization_id', primaryOrg.organization_id);
      }
      // Upsert. Use admin_assign for primary (syncs appointments.organization_id too)
      if (role === 'primary') {
        await supabase.rpc('admin_assign_appointment_org' as any, {
          p_appointment_id: appointmentId, p_org_id: orgId,
        });
      } else {
        const { error } = await supabase.from('appointment_organizations').upsert({
          appointment_id: appointmentId,
          organization_id: orgId,
          role: 'cc',
        }, { onConflict: 'appointment_id,organization_id' });
        if (error) throw error;
      }
      toast.success(`Linked ${role === 'primary' ? 'as primary' : 'as CC'}`);
      await load();
      onAssigned?.();
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setSubmittingId(null);
    }
  };

  const removeOrg = async (orgId: string) => {
    const link = linkedMap.get(orgId);
    if (!link) return;
    if (link.role === 'primary') {
      // Clear primary via admin RPC (also clears appointments.organization_id)
      await supabase.rpc('admin_assign_appointment_org' as any, {
        p_appointment_id: appointmentId, p_org_id: null,
      });
    } else {
      await supabase.from('appointment_organizations')
        .delete()
        .eq('appointment_id', appointmentId)
        .eq('organization_id', orgId);
    }
    toast.success('Removed');
    load();
    onAssigned?.();
  };

  const promoteToPrimary = async (orgId: string) => {
    await addOrg(orgId, 'primary');
  };

  const suggested = allOrgs.find(o => o.id === suggestedOrgId);
  const suggestedIsAlreadyLinked = suggestedOrgId ? linkedMap.has(suggestedOrgId) : false;

  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1 text-xs"
      >
        <Building2 className="h-3.5 w-3.5" />
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#B91C1C]" /> Link organizations
            </DialogTitle>
            <p className="text-xs text-gray-500">
              Every linked org gets the specimen-delivery notification. Mark ONE as primary (ordering provider); any number as CC.
            </p>
          </DialogHeader>

          {/* Currently linked */}
          {linkedOrgs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">Linked ({linkedOrgs.length})</p>
              {[...linkedOrgs].sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0)).map(l => {
                const o = allOrgs.find(x => x.id === l.organization_id);
                if (!o) return null;
                return (
                  <div key={l.organization_id} className={`flex items-center gap-2 p-2 rounded-lg border ${l.role === 'primary' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                    {l.role === 'primary' ? (
                      <Star className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    ) : (
                      <Building2 className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{o.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className={`text-[9px] ${l.role === 'primary' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                          {l.role === 'primary' ? 'PRIMARY' : 'CC'}
                        </Badge>
                        {l.notified_delivery_at && (
                          <span className="text-[10px] text-emerald-700">✓ notified</span>
                        )}
                      </div>
                    </div>
                    {l.role === 'cc' && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-blue-700"
                        onClick={() => promoteToPrimary(l.organization_id)}
                        disabled={submittingId !== null}>
                        <Star className="h-3 w-3 mr-0.5" /> Make primary
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600"
                      onClick={() => removeOrg(l.organization_id)}
                      disabled={submittingId !== null}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Suggested (not yet linked) */}
          {suggested && !suggestedIsAlreadyLinked && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Suggested match</span>
              </div>
              <div className="text-sm font-semibold text-gray-900 mb-2">{suggested.name}</div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                  onClick={() => addOrg(suggested.id, linkedOrgs.length === 0 ? 'primary' : 'cc')}
                  disabled={submittingId !== null}>
                  {submittingId === suggested.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Add as {linkedOrgs.length === 0 ? 'primary' : 'CC'}
                </Button>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-9" placeholder="Search organizations to add…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto border rounded-lg divide-y max-h-[40vh]">
            {loading ? (
              <div className="p-6 text-center text-sm text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                {search ? 'No match' : 'No organizations found'}
              </div>
            ) : (
              filtered.map(o => {
                const linked = linkedMap.get(o.id);
                return (
                  <div key={o.id} className="p-2.5 flex items-center justify-between gap-2 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                        {o.name}
                        {linked && (
                          <Badge variant="outline" className={`text-[9px] ${linked.role === 'primary' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                            {linked.role === 'primary' ? 'primary' : 'cc'}
                          </Badge>
                        )}
                      </div>
                      {(o.billing_email || o.contact_email) && (
                        <div className="text-[11px] text-gray-500 truncate">{o.billing_email || o.contact_email}</div>
                      )}
                    </div>
                    {!linked && (
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]"
                          onClick={() => addOrg(o.id, 'cc')}
                          disabled={submittingId !== null}>
                          {submittingId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '+ CC'}
                        </Button>
                        {!primaryOrg && (
                          <Button size="sm" className="h-7 px-2 text-[10px] bg-blue-600 hover:bg-blue-700 text-white gap-0.5"
                            onClick={() => addOrg(o.id, 'primary')}
                            disabled={submittingId !== null}>
                            <Star className="h-2.5 w-2.5" /> Primary
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <p className="text-[11px] text-gray-500 text-center">
            <strong>Primary</strong> = ordering provider (who pays / owns the order). <strong>CC</strong> = additional recipients of delivery receipts. Each linked org gets notified on specimen delivery.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AssignOrgButton;
