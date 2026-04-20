import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Building2, Search, Loader2, CheckCircle2, Sparkles, XCircle } from 'lucide-react';

/**
 * AssignOrgButton — admin-only. Drops into any appointment row.
 * One click → modal with search + Hormozi-suggested org (auto-match) +
 * full org list. One click → assigned.
 *
 * Auto-match priority (from find_best_org_for_patient RPC):
 *   1. Referral chain (converted provider)
 *   2. Historical match (patient's most recent org)
 *   3. None — admin picks manually
 */

interface Props {
  appointmentId: string;
  patientEmail?: string | null;
  currentOrgId?: string | null;
  currentOrgName?: string | null;
  onAssigned?: () => void;
  size?: 'sm' | 'default';
}

interface Org {
  id: string;
  name: string;
  billing_email?: string | null;
  contact_email?: string | null;
}

const AssignOrgButton: React.FC<Props> = ({ appointmentId, patientEmail, currentOrgId, currentOrgName, onAssigned, size = 'sm' }) => {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [suggestedOrgId, setSuggestedOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const [{ data: orgList }, { data: suggested }] = await Promise.all([
          supabase.from('organizations').select('id, name, billing_email, contact_email')
            .eq('is_active', true).order('name'),
          patientEmail
            ? supabase.rpc('find_best_org_for_patient' as any, { p_email: patientEmail })
            : Promise.resolve({ data: null } as any),
        ]);
        setOrgs((orgList as Org[]) || []);
        setSuggestedOrgId(typeof suggested === 'string' ? suggested : null);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, patientEmail]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(o =>
      o.name?.toLowerCase().includes(q) ||
      o.billing_email?.toLowerCase().includes(q) ||
      o.contact_email?.toLowerCase().includes(q)
    );
  }, [orgs, search]);

  const suggested = orgs.find(o => o.id === suggestedOrgId);
  const current = orgs.find(o => o.id === currentOrgId);

  const assign = async (orgId: string | null) => {
    setSubmitting(orgId || 'clear');
    try {
      const { data, error } = await supabase.rpc('admin_assign_appointment_org' as any, {
        p_appointment_id: appointmentId,
        p_org_id: orgId,
      });
      if (error) throw new Error(error.message);
      const res = data as any;
      if (!res?.ok) throw new Error(res?.reason || 'Assignment failed');
      toast.success(orgId
        ? `Assigned to ${orgs.find(o => o.id === orgId)?.name || 'org'}`
        : 'Cleared org assignment');
      onAssigned?.();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1 text-xs"
      >
        <Building2 className="h-3.5 w-3.5" />
        {currentOrgId ? `Org: ${currentOrgName || 'Assigned'}` : 'Assign org'}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#B91C1C]" /> Assign to organization
            </DialogTitle>
            {patientEmail && (
              <p className="text-xs text-gray-500">Patient: {patientEmail}</p>
            )}
          </DialogHeader>

          {/* Current */}
          {current && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 flex items-center justify-between">
              <div className="text-xs">
                <span className="text-blue-700 font-semibold">Currently assigned:</span>{' '}
                <span className="font-bold">{current.name}</span>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => assign(null)} disabled={submitting !== null}>
                <XCircle className="h-3 w-3 mr-0.5" /> Clear
              </Button>
            </div>
          )}

          {/* Suggested (Hormozi auto-match) */}
          {suggested && suggested.id !== currentOrgId && (
            <button
              onClick={() => assign(suggested.id)}
              disabled={submitting !== null}
              className="text-left bg-emerald-50 border-2 border-emerald-300 rounded-lg p-3 hover:bg-emerald-100 transition flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Suggested match</div>
                  <div className="text-sm font-bold text-gray-900">{suggested.name}</div>
                </div>
              </div>
              {submitting === suggested.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              ) : (
                <Badge variant="outline" className="bg-emerald-600 text-white border-emerald-600 text-[10px]">1-click</Badge>
              )}
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-9" placeholder="Search all organizations…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
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
              filtered.map(o => (
                <button
                  key={o.id}
                  onClick={() => assign(o.id)}
                  disabled={submitting !== null || o.id === currentOrgId}
                  className={`w-full text-left p-3 hover:bg-gray-50 transition flex items-center justify-between gap-2 ${o.id === currentOrgId ? 'bg-blue-50 cursor-default' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{o.name}</div>
                    {(o.billing_email || o.contact_email) && (
                      <div className="text-[11px] text-gray-500 truncate">{o.billing_email || o.contact_email}</div>
                    )}
                  </div>
                  {o.id === currentOrgId ? (
                    <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-800 border-blue-300">Current</Badge>
                  ) : submitting === o.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-gray-300" />
                  )}
                </button>
              ))
            )}
          </div>

          <p className="text-[11px] text-gray-500 text-center">
            {currentOrgId ? 'Click another org to reassign, or Clear to unassign.' : 'Click an org to assign this appointment.'}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AssignOrgButton;
