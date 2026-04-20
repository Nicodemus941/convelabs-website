import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Truck, Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

/**
 * MarkSpecimenDeliveredButton — admin/phleb drops into any appointment row.
 * Captures: delivery timestamp (defaults to now), lab name, tracking ID.
 * Single click fires the DB trigger → send-specimen-delivery-notification →
 * org gets HIPAA-compliant delivery receipt email with tracking ID.
 *
 * Already-delivered appointments show an emerald badge instead of the button,
 * with the tracking ID + lab visible.
 */

interface Props {
  appointmentId: string;
  alreadyDelivered?: boolean;
  deliveredAt?: string | null;
  currentLabName?: string | null;
  currentTrackingId?: string | null;
  orgNotifiedAt?: string | null;
  onDelivered?: () => void;
  size?: 'sm' | 'default';
}

const LAB_SUGGESTIONS = ['LabCorp Maitland', 'LabCorp Winter Park', 'Quest Maitland', 'Quest Orlando', 'Mayo Clinic Labs'];

const MarkSpecimenDeliveredButton: React.FC<Props> = ({
  appointmentId, alreadyDelivered, deliveredAt, currentLabName, currentTrackingId,
  orgNotifiedAt, onDelivered, size = 'sm',
}) => {
  const [open, setOpen] = useState(false);
  const [labName, setLabName] = useState(currentLabName || 'LabCorp Maitland');
  const [trackingId, setTrackingId] = useState(currentTrackingId || '');
  const [submitting, setSubmitting] = useState(false);

  if (alreadyDelivered) {
    return (
      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
        <CheckCircle2 className="h-3 w-3" />
        Delivered{currentLabName ? ` · ${currentLabName}` : ''}{currentTrackingId ? ` · ${currentTrackingId}` : ''}
        {orgNotifiedAt && <span className="text-emerald-500 ml-1">· notified</span>}
      </div>
    );
  }

  const submit = async () => {
    if (!labName.trim()) { toast.error('Lab name required'); return; }
    setSubmitting(true);
    try {
      // Generate a tracking ID if admin didn't type one
      const finalTrackingId = trackingId.trim() || `CL-${appointmentId.substring(0, 8).toUpperCase()}`;
      const { error } = await supabase.from('appointments').update({
        delivered_at: new Date().toISOString(),
        specimen_lab_name: labName.trim(),
        specimen_tracking_id: finalTrackingId,
      }).eq('id', appointmentId);
      if (error) throw new Error(error.message);

      toast.success(`Marked delivered to ${labName} · tracking ${finalTrackingId}. Org notification queued.`);
      setOpen(false);
      onDelivered?.();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to mark delivered');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600"
      >
        <Truck className="h-3.5 w-3.5" /> Mark Delivered
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-emerald-600" /> Mark specimen delivered
            </DialogTitle>
            <p className="text-xs text-gray-500">
              Triggers a delivery receipt email to the linked organization (if they've consented).
            </p>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Reference lab *</Label>
              <Input value={labName} onChange={e => setLabName(e.target.value)} list="lab-suggestions" />
              <datalist id="lab-suggestions">
                {LAB_SUGGESTIONS.map(l => <option key={l} value={l} />)}
              </datalist>
              <div className="flex gap-1 flex-wrap mt-1.5">
                {LAB_SUGGESTIONS.map(l => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLabName(l)}
                    className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded hover:border-emerald-400 hover:bg-emerald-50 text-gray-600"
                  >{l}</button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Specimen tracking ID <span className="text-gray-400">(optional — auto-generates if blank)</span></Label>
              <Input value={trackingId} onChange={e => setTrackingId(e.target.value)} placeholder="e.g. LC-1234567890 or auto" />
              <p className="text-[10px] text-gray-500 mt-1">
                If you leave this blank, we'll generate <code className="bg-gray-100 px-1 rounded">CL-{appointmentId.substring(0, 8).toUpperCase()}</code>. The lab usually gives you a scanned receipt — paste that here.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-[11px] text-blue-900">
              <strong>What happens next:</strong>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>Appointment marked delivered at {format(new Date(), 'MMM d, p')}</li>
                <li>DB trigger fires → org notification email in ~3 sec</li>
                <li>Email includes patient first name + tracking ID + lab</li>
                <li>HIPAA footer + unsubscribe link on the email</li>
              </ul>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={submit} disabled={submitting || !labName.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Marking…</> : <><Truck className="h-4 w-4" /> Mark delivered + notify org</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MarkSpecimenDeliveredButton;
