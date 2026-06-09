import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Check } from 'lucide-react';

/**
 * SendRescheduleLinkButton — admin/phleb action that texts + emails the
 * patient a self-reschedule magic link (/appt/:view_token/confirm). Moves
 * within 24h of the visit charge a $25 fee on that page (waived for members);
 * the move is committed only after the fee clears.
 */
interface Props {
  appointmentId: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'default';
  className?: string;
  label?: string;
}

const SendRescheduleLinkButton: React.FC<Props> = ({
  appointmentId, size = 'sm', variant = 'outline', className, label = 'Send reschedule link',
}) => {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-reschedule-link', {
        body: { appointment_id: appointmentId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const ch = [(data as any)?.sms && 'text', (data as any)?.email && 'email'].filter(Boolean).join(' + ');
      toast.success(`Reschedule link sent${ch ? ` by ${ch}` : ''}.`);
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (e: any) {
      const msg = e?.message === 'no_channel'
        ? 'No phone or email on file for this patient.'
        : e?.message === 'not_reschedulable'
        ? 'This visit can no longer be rescheduled.'
        : (e?.message || 'Could not send the link.');
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Button size={size} variant={variant} className={`gap-1.5 ${className || ''}`} onClick={send} disabled={sending}>
      {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : sent ? <Check className="h-3.5 w-3.5 text-emerald-600" />
        : <CalendarClock className="h-3.5 w-3.5" />}
      {sent ? 'Sent' : label}
    </Button>
  );
};

export default SendRescheduleLinkButton;
