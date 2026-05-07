import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Home, Briefcase, MapPin, Plus, Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * PatientAddressPicker — Hormozi-style multi-address picker.
 *
 * Surfaces every saved address for a patient (home / office / other),
 * lets admin/staff pick which one this visit goes to, and inline-add
 * a new one if the right address isn't on file yet.
 *
 * Use this in:
 *   - CreateLabRequestModal  (provider portal)
 *   - ScheduleAppointmentModal (admin manual booking)
 *   - PatientDetailDrawer (chart maintenance)
 *
 * The "for business owners" rule: every patient gets to keep at least
 * a home + an office. The ★ default is the address auto-selected for
 * new visits unless the user explicitly switches.
 */

export interface PatientAddress {
  id: string;
  patient_id: string;
  label: 'home' | 'office' | 'other';
  nickname: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  access_notes: string | null;
  is_default: boolean;
  is_active: boolean;
}

interface Props {
  patientId: string;
  /** Currently-selected address id; if null, falls back to default. */
  value?: string | null;
  onChange: (addressId: string, address: PatientAddress) => void;
  /** Show inline "+ Add another" button (default true). */
  allowAdd?: boolean;
}

const labelIcon: Record<PatientAddress['label'], React.ComponentType<{ className?: string }>> = {
  home: Home,
  office: Briefcase,
  other: MapPin,
};

const labelText: Record<PatientAddress['label'], string> = {
  home: 'Home',
  office: 'Office',
  other: 'Other',
};

const PatientAddressPicker: React.FC<Props> = ({ patientId, value, onChange, allowAdd = true }) => {
  const [rows, setRows] = useState<PatientAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<PatientAddress>>({ label: 'home', line1: '', city: '', zipcode: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!patientId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('patient_addresses' as any)
      .select('*')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('label', { ascending: true });
    if (error) console.warn('[address-picker] load failed:', error);
    setRows((data as any) || []);
    setLoading(false);
    // Auto-select default if no value chosen
    if (!value && data && data.length > 0) {
      const def = (data as any[]).find(a => a.is_default) || data[0];
      onChange(def.id, def);
    }
  };

  useEffect(() => { load(); }, [patientId]);

  const submitDraft = async () => {
    if (!draft.line1?.trim()) { toast.error('Street address required'); return; }
    setSaving(true);
    try {
      const isFirst = rows.length === 0;
      const { data, error } = await supabase
        .from('patient_addresses' as any)
        .insert({
          patient_id: patientId,
          label: draft.label || 'home',
          nickname: draft.nickname?.trim() || null,
          line1: draft.line1.trim(),
          line2: draft.line2?.trim() || null,
          city: draft.city?.trim() || null,
          state: draft.state?.trim() || null,
          zipcode: draft.zipcode?.trim() || null,
          access_notes: draft.access_notes?.trim() || null,
          is_default: isFirst, // first address auto-defaults
          is_active: true,
        })
        .select('*').single();
      if (error) throw error;
      toast.success(`${labelText[(draft.label as any) || 'home']} address added`);
      setAdding(false);
      setDraft({ label: 'home', line1: '', city: '', zipcode: '' });
      await load();
      // Auto-select the just-added one
      if (data) onChange((data as any).id, data as any);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: string) => {
    try {
      // Clear any existing default first (unique partial index enforces this)
      await supabase.from('patient_addresses' as any).update({ is_default: false }).eq('patient_id', patientId).eq('is_default', true);
      await supabase.from('patient_addresses' as any).update({ is_default: true }).eq('id', id);
      toast.success('Default address updated');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update default');
    }
  };

  if (loading) {
    return <div className="text-xs text-gray-500 p-2 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading addresses…</div>;
  }

  return (
    <div className="space-y-2">
      {/* Address tiles */}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {rows.map((a) => {
            const Icon = labelIcon[a.label];
            const selected = value === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onChange(a.id, a)}
                className={`relative text-left rounded-lg border-2 p-3 transition ${
                  selected
                    ? 'border-[#B91C1C] bg-red-50 ring-2 ring-red-100'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${selected ? 'text-[#B91C1C]' : 'text-gray-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">{labelText[a.label]}</span>
                      {a.nickname && <span className="text-[10px] text-gray-500">· {a.nickname}</span>}
                      {a.is_default && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] px-1 py-0 h-4 hover:bg-amber-100 gap-0.5">
                          <Star className="h-2 w-2 fill-current" /> Default
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs font-medium text-gray-900 mt-0.5 truncate">{a.line1}</div>
                    {(a.city || a.zipcode) && (
                      <div className="text-[11px] text-gray-500 truncate">
                        {[a.city, a.state, a.zipcode].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {a.access_notes && (
                      <div className="text-[10px] text-amber-700 italic mt-1 truncate">📌 {a.access_notes}</div>
                    )}
                  </div>
                </div>
                {!a.is_default && selected && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDefault(a.id); }}
                    className="absolute top-1.5 right-1.5 text-[9px] text-gray-500 hover:text-amber-700 underline"
                  >
                    Make default
                  </button>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && !adding && (
        <div className="border-2 border-dashed rounded-lg p-4 text-center text-xs text-gray-500">
          No addresses on file. Add one below.
        </div>
      )}

      {/* Inline add */}
      {adding ? (
        <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
          <div className="flex gap-1.5">
            {(['home', 'office', 'other'] as const).map(lab => {
              const Icon = labelIcon[lab];
              const active = draft.label === lab;
              return (
                <button
                  key={lab}
                  type="button"
                  onClick={() => setDraft({ ...draft, label: lab })}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs border transition ${
                    active ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-3 w-3" /> {labelText[lab]}
                </button>
              );
            })}
          </div>
          {draft.label === 'office' && (
            <Input
              value={draft.nickname || ''}
              onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
              placeholder="Nickname (e.g. PCC HQ, Downtown Clinic) — optional"
              className="h-8 text-xs"
            />
          )}
          <Input
            value={draft.line1 || ''}
            onChange={(e) => setDraft({ ...draft, line1: e.target.value })}
            placeholder="Street address *"
            className="h-8 text-xs"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={draft.city || ''}
              onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              placeholder="City"
              className="h-8 text-xs"
            />
            <Input
              value={draft.zipcode || ''}
              onChange={(e) => setDraft({ ...draft, zipcode: e.target.value })}
              placeholder="ZIP"
              className="h-8 text-xs"
            />
          </div>
          <Input
            value={draft.access_notes || ''}
            onChange={(e) => setDraft({ ...draft, access_notes: e.target.value })}
            placeholder="Access notes (gate code, parking, suite #) — optional"
            className="h-8 text-xs"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={submitDraft} disabled={saving}>
              {saving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving</> : 'Save address'}
            </Button>
          </div>
        </div>
      ) : (
        allowAdd && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="h-8 text-xs gap-1.5 w-full">
            <Plus className="h-3 w-3" /> Add another address
          </Button>
        )
      )}
    </div>
  );
};

export default PatientAddressPicker;
