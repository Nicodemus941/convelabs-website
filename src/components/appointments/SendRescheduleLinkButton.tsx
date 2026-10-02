import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Check } from 'lucide-react';
import { ConfirmDialog, ReviewList, ReviewRow } from '@/components/dashboards/admin/chartModalKit';

/**
 * SendRescheduleLinkButton — admin/phleb action that texts + emails the
 * patient a self-reschedule magic link (/appt/:view_token/confirm). Moves
 * within 24h of the visit charge a $25 fee on that page (waived for members);
 * the move is committed only after the fee clears.
 *
 * `confirmBeforeSend` (default false, so existing callers are unchanged)
 * shows a review step naming the recipient before anything goes out.
 */
interface Props {
  appointmentId: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'default';
  className?: string;
  label?: string;
  confirmBeforeSend?: boolean;
  /** Context for the review step — who gets the link. */
  patient?: { first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null } | null;
  visitLabel?: string;
}

const SendRescheduleLinkButton: React.FC<Props> = ({
  appointmentId, size = 'sm', variant = 'outline', className, label = 'Send reschedule link',
  confirmBeforeSend = false, patient, visitLabel,
}) => {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-reschedule-link', {
        body: { appointment_id: appointmentId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const ch = [(data as any)?.sms && 'text', (data as any)?.email && 'email'].filter(Boolean).join(' + ');
      toast.success(`Reschedule link sent${ch ? ` by ${ch}` : ''}.`);
      setSent(true);
      setReviewOpen(false);
      setTimeout(() => setSent(false), 4000);
    } catch (e: any) {
      const msg = e?.message === 'no_channel'
        ? 'No phone or email on file for this patient.'
        : e?.message === 'not_reschedulable'
        ? 'This visit can no longer be rescheduled.'
        : (e?.message || 'Could not send the link.');
      if (confirmBeforeSend) setError(msg); else toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const name = patient ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim() : '';
  const channels = [patient?.phone && `text to ${patient.phone}`, patient?.email && `email to ${patient.email}`].filter(Boolean) as string[];

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={`gap-1.5 ${className || ''}`}
        onClick={() => { if (confirmBeforeSend) { setError(null); setReviewOpen(true); } else void send(); }}
        disabled={sending}
      >
        {sending && !confirmBeforeSend ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : sent ? <Check className="h-3.5 w-3.5 text-emerald-600" />
          : <CalendarClock className="h-3.5 w-3.5" />}
        {sent ? 'Sent' : label}
      </Button>

      {confirmBeforeSend && (
        <ConfirmDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          icon={CalendarClock}
          title="Send reschedule link"
          context={[name, patient?.phone, patient?.email].filter(Boolean).join(' · ') || undefined}
          confirmLabel={<><CalendarClock className="h-4 w-4" aria-hidden="true" /> Send link</>}
          busy={sending}
          busyLabel="Sending…"
          error={error}
          onConfirm={send}
          quietHours="text and email"
        >
          <ReviewList>
            {visitLabel && <ReviewRow label="Visit">{visitLabel}</ReviewRow>}
            <ReviewRow label="Goes to" tone={channels.length === 0 ? 'warn' : 'default'}>
              {channels.length > 0 ? channels.join(' and ') : 'No phone or email on file — the send will fail'}
            </ReviewRow>
            <ReviewRow label="They can">Pick a new date and time themselves. Moves within 24 h of the visit charge a $25 fee on that page (waived for members).</ReviewRow>
          </ReviewList>
        </ConfirmDialog>
      )}
    </>
  );
};

export default SendRescheduleLinkButton;
