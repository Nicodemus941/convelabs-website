/**
 * RequestLabOrderButton — admin/phleb-side trigger for "patient: please
 * upload your lab order." Calls request-appointment-lab-order edge fn,
 * which sends SMS + email with a magic link. Token-only; no auth wall
 * for the patient — they land directly on the upload page.
 */

import React, { useState } from 'react';
import { Send, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  appointmentId: string;
  patientName?: string | null;
  variant?: 'primary' | 'subtle';
}

const RequestLabOrderButton: React.FC<Props> = ({ appointmentId, patientName, variant = 'subtle' }) => {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-appointment-lab-order', {
        body: { appointmentId },
      });
      if (error) throw error;

      if (data?.deferred) {
        toast.info('Quiet hours — we\'ll send at 8 AM ET tomorrow.');
        setSent(true);
        return;
      }
      if (data?.error === 'send_cap_reached') {
        toast.error(data.message || 'Already sent 3× — try a different channel.');
        return;
      }
      if (data?.error === 'too_soon') {
        toast.error(data.message || 'Last send was recent. Wait a few hours.');
        return;
      }
      if (data?.error === 'no_contact') {
        toast.error('Patient has no email or phone on file. Add one before requesting.');
        return;
      }

      const channels: string[] = [];
      if (data?.sms_sent) channels.push('SMS');
      if (data?.email_sent) channels.push('email');
      if (channels.length === 0) {
        toast.error('Couldn\'t send — check the patient\'s contact info.');
        return;
      }
      toast.success(
        `Sent to ${patientName || 'patient'} via ${channels.join(' + ')}${data?.attempts > 1 ? ` (attempt ${data.attempts})` : ''}`,
        { duration: 5000 },
      );
      setSent(true);
    } catch (e: any) {
      toast.error(e?.message || 'Couldn\'t send request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={variant === 'primary' ? 'default' : 'outline'}
      disabled={busy}
      onClick={handleClick}
      className={`gap-1.5 text-xs h-8 ${
        sent
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          : variant === 'primary'
            ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
            : 'border-blue-300 text-blue-800 hover:bg-blue-50'
      } ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {busy ? (
        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
      ) : sent ? (
        <><CheckCircle2 className="h-3.5 w-3.5" /> Request sent</>
      ) : (
        <><Send className="h-3.5 w-3.5" /> Request from patient</>
      )}
    </Button>
  );
};

export default RequestLabOrderButton;
