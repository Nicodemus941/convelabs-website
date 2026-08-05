import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Truck, Package, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

/**
 * Additional specimen deliveries for ONE appointment that produced more than
 * one order/specimen going to DIFFERENT destinations — e.g. a Quest blood draw
 * dropped at the lab AND a Vibrant specialty kit shipped via FedEx/UPS. The
 * primary specimen is logged by the parent modal's "Confirm delivered"; THIS
 * logs each extra specimen as its own specimen_deliveries row (with courier +
 * tracking for shipments), so every destination is captured and auditable.
 */
const DROPOFF_LABS = [
  { value: 'Quest Diagnostics', label: 'Quest Diagnostics' },
  { value: 'LabCorp', label: 'LabCorp' },
  { value: 'AdventHealth', label: 'AdventHealth' },
  { value: 'Orlando Health', label: 'Orlando Health' },
  { value: 'Rupa Health', label: 'Rupa Health' },
  { value: 'Other', label: 'Other' },
];
const SHIP_LABS = ['Vibrant', 'Genova', 'DUTCH', 'Mosaic', 'Cyrex', 'Other'];
const COURIERS = [{ value: 'fedex', label: 'FedEx' }, { value: 'ups', label: 'UPS' }];

interface Delivery {
  id: string;
  order_label: string | null;
  delivery_method: string | null;
  lab_name: string;
  courier: string | null;
  tracking_number: string | null;
  specimen_id: string;
}

interface Props {
  appointmentId: string;
  patientId: string | null;
  patientName: string;
  serviceType: string;
  /** Reports how many additional deliveries are logged (for the parent's
   *  "all specimens logged" gate). Called on load and after each save. */
  onCountChange?: (n: number) => void;
}

const AdditionalSpecimenDelivery: React.FC<Props> = ({ appointmentId, patientId, patientName, serviceType, onCountChange }) => {
  const [logged, setLogged] = useState<Delivery[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Draft
  const isKit = /specialty-kit|kit/i.test(serviceType || '');
  const [orderLabel, setOrderLabel] = useState(isKit ? 'Specialty kit' : '');
  const [method, setMethod] = useState<'dropoff' | 'ship'>(isKit ? 'ship' : 'dropoff');
  const [labName, setLabName] = useState(isKit ? 'Vibrant' : 'Quest Diagnostics');
  const [courier, setCourier] = useState('fedex');
  const [tracking, setTracking] = useState('');
  const [specimenId, setSpecimenId] = useState('');
  const [tubeCount, setTubeCount] = useState('1');

  const load = useCallback(async () => {
    const { data } = await supabase.from('specimen_deliveries' as any)
      .select('id, order_label, delivery_method, lab_name, courier, tracking_number, specimen_id')
      .eq('appointment_id', appointmentId)
      .not('order_label', 'is', null)
      .order('created_at', { ascending: true });
    const rows = (data as any) || [];
    setLogged(rows);
    onCountChange?.(rows.length);
  }, [appointmentId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  const canSave = orderLabel.trim() && labName.trim()
    && (method === 'ship' ? !!tracking.trim() : true);

  const save = async () => {
    if (!canSave) { toast.error(method === 'ship' ? 'Tracking number required for a shipment' : 'Fill in the destination'); return; }
    setSaving(true);
    try {
      let deliveredBy = 'Phlebotomist';
      try {
        const { data: u } = await supabase.auth.getUser();
        deliveredBy = u?.user?.user_metadata?.full_name || u?.user?.email || 'Phlebotomist';
      } catch { /* noop */ }
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from('specimen_deliveries' as any).insert({
        appointment_id: appointmentId,
        patient_id: patientId,
        patient_name: patientName,
        order_label: orderLabel.trim(),
        delivery_method: method,
        lab_name: labName.trim(),
        courier: method === 'ship' ? courier : null,
        tracking_number: method === 'ship' ? tracking.trim() : null,
        specimen_id: method === 'ship' ? tracking.trim() : (specimenId.trim() || `${labName}-${Date.now()}`),
        tube_count: parseInt(tubeCount) || 1,
        service_type: serviceType,
        collection_time: nowIso,
        delivered_at: nowIso,
        delivered_by: deliveredBy,
        status: 'delivered',
      });
      if (error) throw error;
      toast.success(`${orderLabel} logged — ${method === 'ship' ? `${courier.toUpperCase()} ${tracking.trim()}` : labName}`);
      setOpen(false);
      setTracking(''); setSpecimenId('');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not log this delivery');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 border-t pt-2">
      {logged.length > 0 && (
        <div className="space-y-1 mb-2">
          {logged.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-[12px] text-gray-600">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium">{d.order_label}</span>
              <span className="text-gray-400">·</span>
              {d.delivery_method === 'ship'
                ? <span>{(d.courier || '').toUpperCase()} {d.tracking_number}</span>
                : <span>{d.lab_name}{d.specimen_id ? ` · ${d.specimen_id}` : ''}</span>}
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="text-[12px] font-medium text-[#B91C1C] flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> Add another specimen / shipment
        </button>
      ) : (
        <div className="rounded-md border p-2.5 space-y-2 bg-gray-50/60">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Order / specimen</Label>
              <Input value={orderLabel} onChange={e => setOrderLabel(e.target.value)} placeholder="e.g. Vibrant kit" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dropoff"><span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />Lab drop-off</span></SelectItem>
                  <SelectItem value="ship"><span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" />Ship (courier)</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {method === 'dropoff' ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Destination lab</Label>
                <Select value={labName} onValueChange={setLabName}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{DROPOFF_LABS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Specimen / accession ID</Label>
                <Input value={specimenId} onChange={e => setSpecimenId(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Lab</Label>
                <Select value={labName} onValueChange={setLabName}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{SHIP_LABS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Courier</Label>
                <Select value={courier} onValueChange={setCourier}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{COURIERS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Tracking #</Label>
                <Input value={tracking} onChange={e => setTracking(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" className="h-8" onClick={save} disabled={saving || !canSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log delivery'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdditionalSpecimenDelivery;
