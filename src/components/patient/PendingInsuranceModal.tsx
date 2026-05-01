/**
 * PendingInsuranceModal — pops up when the patient has an OCR-detected
 * insurance mismatch on a lab order. The lab requisition shows different
 * insurance than what's on file. Patient picks one of two actions:
 *
 *   • Use new (from lab order)   → updates tenant_patients
 *   • Keep what I have on file   → just dismisses the prompt
 *
 * Both routes resolve the queued pending_insurance_changes row so the
 * modal won't reappear for that order.
 */

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PendingChange {
  id: string;
  current_provider: string | null;
  current_member_id: string | null;
  current_group_number: string | null;
  proposed_provider: string | null;
  proposed_member_id: string | null;
  proposed_group_number: string | null;
}

const PendingInsuranceModal: React.FC = () => {
  const [change, setChange] = useState<PendingChange | null>(null);
  const [busy, setBusy] = useState<'accept_new' | 'keep_existing' | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    try {
      const { data } = await supabase.rpc('get_my_pending_insurance_change' as any);
      const row = (data as any) || null;
      if (row && row.id) {
        setChange(row);
        setOpen(true);
      }
    } catch (e) {
      // Silent — RPC errors shouldn't show on dashboard load
    }
  };

  useEffect(() => { refresh(); }, []);

  const resolve = async (action: 'accept_new' | 'keep_existing') => {
    if (!change) return;
    setBusy(action);
    try {
      const { data, error } = await supabase.rpc('resolve_my_pending_insurance' as any, {
        p_change_id: change.id,
        p_action: action,
      });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.reason || error?.message || 'Failed');
      toast.success(action === 'accept_new'
        ? 'Insurance updated on your chart'
        : 'Existing insurance kept');
      setOpen(false);
      setChange(null);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save your choice');
    } finally {
      setBusy(null);
    }
  };

  if (!change) return null;

  const Cell = ({ label, value }: { label: string; value: string | null }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
      <div className="text-sm text-gray-900 font-medium">{value || <span className="text-gray-400 italic">— blank —</span>}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#B91C1C]" />
            Quick check on your insurance
          </DialogTitle>
          <DialogDescription className="text-xs">
            Your most recent lab order shows different insurance than what we have on file. Which one is current?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Current */}
          <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">On file (currently)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Cell label="Carrier" value={change.current_provider} />
              <Cell label="Member ID" value={change.current_member_id} />
              <Cell label="Group #" value={change.current_group_number} />
            </div>
          </div>

          {/* Proposed */}
          <div className="rounded-lg border border-amber-300 bg-amber-50/40 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-amber-800 font-bold flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> From your latest lab order
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Cell label="Carrier" value={change.proposed_provider} />
              <Cell label="Member ID" value={change.proposed_member_id} />
              <Cell label="Group #" value={change.proposed_group_number} />
            </div>
          </div>

          <p className="text-[11px] text-gray-500 leading-relaxed">
            We'll only use what you confirm here. If you've recently changed insurance, pick "Use new" and we'll update your chart automatically.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => resolve('keep_existing')}
              disabled={!!busy}
            >
              {busy === 'keep_existing' ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving</> : 'Keep existing'}
            </Button>
            <Button
              className="flex-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5"
              onClick={() => resolve('accept_new')}
              disabled={!!busy}
            >
              {busy === 'accept_new' ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating</> : 'Use new (from lab order)'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PendingInsuranceModal;
