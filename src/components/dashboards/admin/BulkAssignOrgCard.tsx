import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Building2, Loader2, CheckCircle2, Sparkles, Search, Users, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

/**
 * Bulk "Backfill all unassigned appointments" admin tool.
 *
 * Shows every appointment with organization_id=NULL alongside each patient's
 * Hormozi auto-match suggestion. Admin can:
 *   - Accept all suggestions in one click
 *   - Override per-row with a manual org pick
 *   - Skip rows that truly have no org (self-pay patients)
 *
 * Dramatically faster than opening every appointment detail modal one-by-one.
 */

interface UnassignedRow {
  id: string;
  patient_name: string;
  patient_email: string;
  appointment_date: string;
  status: string;
  suggested_org_id: string | null;
  suggested_org_name: string | null;
  manual_org_id?: string | null;
}

interface Org {
  id: string;
  name: string;
}

const BulkAssignOrgCard: React.FC<{ onUpdated?: () => void }> = ({ onUpdated }) => {
  const [rows, setRows] = useState<UnassignedRow[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: orgList }, { data: apptList }] = await Promise.all([
        supabase.from('organizations').select('id, name').eq('is_active', true).order('name'),
        supabase.from('appointments')
          .select('id, patient_name, patient_email, appointment_date, status')
          .is('organization_id', null)
          .not('patient_email', 'is', null)
          .order('appointment_date', { ascending: false })
          .limit(200),
      ]);

      const orgArr = (orgList as Org[]) || [];
      setOrgs(orgArr);
      const orgMap = new Map(orgArr.map(o => [o.id, o.name]));

      // Enrich with Hormozi auto-match suggestion per patient email
      const rowsWithSuggestions: UnassignedRow[] = [];
      for (const a of (apptList as any[]) || []) {
        let suggestedOrgId: string | null = null;
        let suggestedOrgName: string | null = null;
        if (a.patient_email) {
          const { data: sug } = await supabase.rpc('find_best_org_for_patient' as any, {
            p_email: a.patient_email,
          });
          if (typeof sug === 'string') {
            suggestedOrgId = sug;
            suggestedOrgName = orgMap.get(sug) || null;
          }
        }
        rowsWithSuggestions.push({
          id: a.id,
          patient_name: a.patient_name || '',
          patient_email: a.patient_email || '',
          appointment_date: a.appointment_date || '',
          status: a.status || '',
          suggested_org_id: suggestedOrgId,
          suggested_org_name: suggestedOrgName,
        });
      }
      setRows(rowsWithSuggestions);
      // Pre-select rows that have a suggestion
      setSelectedIds(new Set(rowsWithSuggestions.filter(r => r.suggested_org_id).map(r => r.id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.patient_name.toLowerCase().includes(q) ||
      r.patient_email.toLowerCase().includes(q) ||
      r.suggested_org_name?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const setManualOrg = (rowId: string, orgId: string) => {
    setRows(prev => prev.map(r => r.id === rowId
      ? { ...r, manual_org_id: orgId, suggested_org_name: orgs.find(o => o.id === orgId)?.name || null, suggested_org_id: orgId }
      : r));
    setSelectedIds(prev => new Set(prev).add(rowId));
  };

  const acceptSelected = async () => {
    if (selectedIds.size === 0) { toast.error('Nothing selected'); return; }
    setAssigning(true);
    let successCount = 0, failCount = 0;
    for (const id of selectedIds) {
      const row = rows.find(r => r.id === id);
      const orgId = row?.manual_org_id || row?.suggested_org_id;
      if (!orgId) continue;
      const { data, error } = await supabase.rpc('admin_assign_appointment_org' as any, {
        p_appointment_id: id,
        p_org_id: orgId,
      });
      if (error || !(data as any)?.ok) failCount++;
      else successCount++;
    }
    setAssigning(false);
    toast.success(`Assigned ${successCount} appointments${failCount > 0 ? ` · ${failCount} failed` : ''}`);
    onUpdated?.();
    load();
  };

  const withSuggestionCount = rows.filter(r => r.suggested_org_id).length;
  const selectedWithOrg = Array.from(selectedIds).filter(id => {
    const r = rows.find(x => x.id === id);
    return r?.suggested_org_id;
  }).length;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-[#B91C1C]" /> Unassigned appointments
        </CardTitle>
        <p className="text-xs text-gray-500">
          Appointments without an organization. The Hormozi auto-match fills in the ones we can infer; manually pick an org for the rest.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary + bulk action */}
        <div className="flex items-center justify-between flex-wrap gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="text-xs">
            <div><strong>{rows.length}</strong> unassigned total</div>
            <div className="text-emerald-700"><Sparkles className="h-3 w-3 inline" /> <strong>{withSuggestionCount}</strong> have suggested matches</div>
            <div className="text-gray-600"><strong>{rows.length - withSuggestionCount}</strong> need manual assignment</div>
          </div>
          <Button
            onClick={acceptSelected}
            disabled={assigning || selectedWithOrg === 0}
            className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5"
          >
            {assigning ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning…</> : <><CheckCircle2 className="h-4 w-4" /> Assign {selectedWithOrg} selected</>}
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search patient, email, or org…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Rows */}
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading + computing suggestions…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            {rows.length === 0 ? (
              <div className="flex items-center justify-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" /> All appointments assigned
              </div>
            ) : 'No match'}
          </div>
        ) : (
          <div className="border rounded-lg divide-y max-h-[500px] overflow-y-auto">
            {filtered.map(r => {
              const isSelected = selectedIds.has(r.id);
              const hasSuggestion = !!r.suggested_org_id;
              return (
                <div key={r.id} className="p-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(r.id)}
                    disabled={!hasSuggestion && !r.manual_org_id}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900 truncate">{r.patient_name || r.patient_email}</div>
                    <div className="text-[11px] text-gray-500">
                      {r.patient_email} · {r.appointment_date && format(new Date(r.appointment_date), 'MMM d, yyyy')}
                      <Badge variant="outline" className="text-[9px] ml-1.5">{r.status}</Badge>
                    </div>
                  </div>
                  <div className="flex-shrink-0 w-48">
                    {hasSuggestion ? (
                      <div className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                        <div className="text-xs font-medium text-emerald-800 truncate" title={r.suggested_org_name || ''}>{r.suggested_org_name}</div>
                      </div>
                    ) : (
                      <select
                        value={r.manual_org_id || ''}
                        onChange={e => setManualOrg(r.id, e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="">— Pick org —</option>
                        {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rows.length > 0 && (
          <div className="text-[11px] text-gray-500 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>Appointments with no org need manual selection. Self-pay patients without a referring practice can be safely left unassigned.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BulkAssignOrgCard;
