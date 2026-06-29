import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Split } from 'lucide-react';

interface Props {
  appt: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}

/**
 * Split a companion out of its family group into a standalone appointment on a
 * new date/time/address — the primary appointment stays exactly as-is and is
 * still serviced. Calls the split_companion_appointment RPC (admin-gated).
 */
export default function SplitCompanionDialog({ appt, open, onOpenChange, onDone }: Props) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('07:30');
  const [address, setAddress] = useState(appt?.address || '');
  const [zip, setZip] = useState(appt?.zipcode || '');
  const [waiveFee, setWaiveFee] = useState(true);
  const [moveLabs, setMoveLabs] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!date || !time) {
      toast.error('Pick a new date and time');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('split_companion_appointment' as any, {
        p_companion_id: appt.id,
        p_new_date: date,
        p_new_time: time.length === 5 ? `${time}:00` : time,
        p_new_address: address || null,
        p_new_zip: zip || null,
        p_waive_fee: waiveFee,
        p_new_total: null,
        p_move_lab_from_primary: moveLabs,
      });
      if (error) throw error;
      const moved = (data as any)?.moved_labs;
      toast.success(
        `${appt.patient_name || 'Companion'} split to ${date} ${time}${waiveFee ? ' · fee waived' : ''}${moved ? ' · lab order moved' : ''}`,
      );
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message || 'Could not split the companion appointment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule companion separately</DialogTitle>
          <DialogDescription>
            Moves {appt?.patient_name || 'this companion'} to their own appointment. The original
            patient's visit is left unchanged and still serviced.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="split-date">New date</Label>
              <Input id="split-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-time">Time</Label>
              <Input id="split-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="split-address">Address</Label>
            <Input id="split-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, City, ZIP" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="split-zip">ZIP</Label>
            <Input id="split-zip" value={zip} onChange={(e) => setZip(e.target.value)} className="w-32" />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Waive the fee</p>
              <p className="text-xs text-muted-foreground">Set this visit to $0</p>
            </div>
            <Switch checked={waiveFee} onCheckedChange={setWaiveFee} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Move lab order from primary</p>
              <p className="text-xs text-muted-foreground">If their order was uploaded on the primary by mistake</p>
            </div>
            <Switch checked={moveLabs} onCheckedChange={setMoveLabs} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Splitting…</> : <><Split className="mr-2 h-4 w-4" />Split & reschedule</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
