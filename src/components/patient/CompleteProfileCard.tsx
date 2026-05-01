/**
 * CompleteProfileCard — soft, non-blocking "finish your chart" nudge.
 *
 * Hormozi rule: don't make the SignupForm bigger. Capture the chart
 * data exactly when each field unlocks something the patient wants —
 * and show the value-trade right next to the input.
 *
 *   Phone        → ETA texts the morning of your visit
 *   Date of birth → Senior pricing auto-applies if 65+
 *   Address      → 90-second booking next time (no re-typing)
 *   Insurance    → Auto-attached to every lab order
 *
 * Component fetches tenant_patients for the signed-in user, counts
 * filled fields, renders a compact progress card. If everything's
 * filled, renders nothing.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Phone, Cake, MapPin, ShieldCheck, ArrowRight, Loader2, Save, X, Check, Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface PatientChart {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  insurance_provider: string | null;
  insurance_member_id: string | null;
  insurance_group_number: string | null;
}

const FIELDS: Array<{
  key: keyof PatientChart;
  label: string;
  icon: React.FC<any>;
  valueTrade: string;
  group: 'phone' | 'dob' | 'address' | 'insurance';
}> = [
  { key: 'phone', label: 'Phone', icon: Phone,
    valueTrade: 'ETA texts the morning of your visit',
    group: 'phone' },
  { key: 'date_of_birth', label: 'Date of birth', icon: Cake,
    valueTrade: 'Senior pricing auto-applies (65+)',
    group: 'dob' },
  { key: 'address', label: 'Address', icon: MapPin,
    valueTrade: '90-second booking next time — no re-typing',
    group: 'address' },
  { key: 'insurance_provider', label: 'Insurance', icon: ShieldCheck,
    valueTrade: 'Auto-attached to every lab order',
    group: 'insurance' },
];

const CompleteProfileCard: React.FC = () => {
  const { user } = useAuth();
  const [chart, setChart] = useState<PatientChart | null>(null);
  const [loading, setLoading] = useState(true);
  const [editGroup, setEditGroup] = useState<'phone' | 'dob' | 'address' | 'insurance' | null>(null);
  const [form, setForm] = useState<Partial<PatientChart>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('tenant_patients')
        .select('id, first_name, last_name, phone, date_of_birth, address, city, state, zipcode, insurance_provider, insurance_member_id, insurance_group_number')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setChart((data as any) || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  // Compute percent complete based on 4 grouped buckets (phone, DOB,
  // address-as-a-whole, insurance-provider-as-a-whole) so partial
  // address still counts and we don't punish the patient for missing
  // a single sub-field.
  const { percent, missing } = useMemo(() => {
    if (!chart) return { percent: 0, missing: FIELDS };
    const filled: Record<string, boolean> = {
      phone:     !!(chart.phone && chart.phone.trim()),
      dob:       !!chart.date_of_birth,
      address:   !!(chart.address && chart.city && chart.zipcode),
      insurance: !!(chart.insurance_provider && chart.insurance_member_id),
    };
    const filledCount = Object.values(filled).filter(Boolean).length;
    const pct = Math.round(((filledCount + 1) / (FIELDS.length + 1)) * 100); // +1 for name, which is always present at signup
    return {
      percent: pct,
      missing: FIELDS.filter(f => !filled[f.group]),
    };
  }, [chart]);

  const startEdit = (group: 'phone' | 'dob' | 'address' | 'insurance') => {
    if (!chart) return;
    setForm({
      phone: chart.phone || '',
      date_of_birth: chart.date_of_birth || '',
      address: chart.address || '',
      city: chart.city || '',
      state: chart.state || 'FL',
      zipcode: chart.zipcode || '',
      insurance_provider: chart.insurance_provider || '',
      insurance_member_id: chart.insurance_member_id || '',
      insurance_group_number: chart.insurance_group_number || '',
    });
    setEditGroup(group);
  };

  const save = async () => {
    if (!chart) return;
    setSaving(true);
    try {
      const patch: any = { updated_at: new Date().toISOString() };
      if (editGroup === 'phone')     patch.phone = (form.phone || '').trim() || null;
      if (editGroup === 'dob')       patch.date_of_birth = form.date_of_birth || null;
      if (editGroup === 'address') {
        patch.address = (form.address || '').trim() || null;
        patch.city = (form.city || '').trim() || null;
        patch.state = (form.state || '').trim() || null;
        patch.zipcode = (form.zipcode || '').trim() || null;
      }
      if (editGroup === 'insurance') {
        patch.insurance_provider = (form.insurance_provider || '').trim() || null;
        patch.insurance_member_id = (form.insurance_member_id || '').trim() || null;
        patch.insurance_group_number = (form.insurance_group_number || '').trim() || null;
      }
      const { error } = await supabase.from('tenant_patients').update(patch).eq('id', chart.id);
      if (error) throw error;
      toast.success('Saved');
      setEditGroup(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !chart || percent === 100) return null;

  return (
    <>
      <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-600" /> Profile {percent}% complete
              </p>
              <p className="text-xs text-gray-600 mt-0.5">Each one unlocks something the next time you book.</p>
            </div>
            <span className="text-xs font-bold text-emerald-700">{percent}%</span>
          </div>

          {/* progress bar */}
          <div className="h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden mb-3">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
          </div>

          {/* missing fields w/ value-trade */}
          <div className="space-y-1.5">
            {missing.map(f => {
              const Icon = f.icon;
              return (
                <button
                  key={f.group}
                  type="button"
                  onClick={() => startEdit(f.group)}
                  className="w-full text-left flex items-center gap-2 p-2 rounded-md hover:bg-emerald-50 transition group"
                >
                  <span className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-3.5 w-3.5 text-emerald-700" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900">{f.label}</p>
                    <p className="text-[11px] text-gray-600 leading-snug">→ {f.valueTrade}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-emerald-700" />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Inline edit dialog — one group at a time, takes seconds */}
      <Dialog open={!!editGroup} onOpenChange={(v) => { if (!v && !saving) setEditGroup(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {editGroup === 'phone' && 'Add your phone'}
              {editGroup === 'dob' && 'Add your date of birth'}
              {editGroup === 'address' && 'Add your address'}
              {editGroup === 'insurance' && 'Add your insurance'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editGroup === 'phone' && 'We text you ETAs the morning of your visit. No marketing, just appointment updates.'}
              {editGroup === 'dob' && 'If you are 65+, your senior rate auto-applies on every visit.'}
              {editGroup === 'address' && 'Pre-fills your booking form so you skip retyping every time.'}
              {editGroup === 'insurance' && 'Your insurance auto-attaches to every lab order — no more "forgot the card."'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {editGroup === 'phone' && (
              <div>
                <Label className="text-xs">Mobile phone</Label>
                <Input type="tel" value={(form.phone as string) || ''}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(407) 555-1234" />
              </div>
            )}
            {editGroup === 'dob' && (
              <div>
                <Label className="text-xs">Date of birth</Label>
                <Input type="date" value={(form.date_of_birth as string) || ''}
                  onChange={(e) => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
              </div>
            )}
            {editGroup === 'address' && (
              <>
                <div>
                  <Label className="text-xs">Street address</Label>
                  <Input value={(form.address as string) || ''}
                    onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="123 Main St" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Label className="text-xs">City</Label>
                    <Input value={(form.city as string) || ''}
                      onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">State</Label>
                    <Input value={(form.state as string) || ''} maxLength={2}
                      onChange={(e) => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">ZIP code</Label>
                  <Input value={(form.zipcode as string) || ''}
                    onChange={(e) => setForm(f => ({ ...f, zipcode: e.target.value }))}
                    placeholder="32789" />
                </div>
              </>
            )}
            {editGroup === 'insurance' && (
              <>
                <div>
                  <Label className="text-xs">Carrier</Label>
                  <Input value={(form.insurance_provider as string) || ''}
                    onChange={(e) => setForm(f => ({ ...f, insurance_provider: e.target.value }))}
                    placeholder="Aetna, BCBS, United, etc." />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Member ID</Label>
                    <Input value={(form.insurance_member_id as string) || ''}
                      onChange={(e) => setForm(f => ({ ...f, insurance_member_id: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Group #</Label>
                    <Input value={(form.insurance_group_number as string) || ''}
                      onChange={(e) => setForm(f => ({ ...f, insurance_group_number: e.target.value }))} />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500">Or skip — we'll auto-extract from your next lab order.</p>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setEditGroup(null)} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving</> : <><Save className="h-3.5 w-3.5" /> Save</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CompleteProfileCard;
