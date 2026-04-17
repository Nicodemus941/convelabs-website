import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserX, Loader2, Bell, BellOff, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface NoShowAppointmentModalProps {
  appointment: any;
  open: boolean;
  onClose: () => void;
  onMarked: () => void;
}

/**
 * NO-SHOW MODAL — Hormozi-style
 *
 * Marks the patient as a no-show, applies the 50% fee, and optionally texts them.
 *
 * Defaults:
 * - Notify patient ON — they need to know a fee was applied AND how to rebook.
 *   No-shows that don't hear from us never come back. No-shows that do hear
 *   from us come back at ~35%+.
 * - Apply fee ON — the fee exists because 50% of the cost (phleb time, travel,
 *   slot lockout) was already consumed. Waiving is a judgment call, not a default.
 */
const NoShowAppointmentModal: React.FC<NoShowAppointmentModalProps> = ({
  appointment, open, onClose, onMarked,
}) => {
  const appt = appointment;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [note, setNote] = useState('');
  const [notifyPatient, setNotifyPatient] = useState(true);
  const [applyFee, setApplyFee] = useState(true);

  useEffect(() => {
    if (open) {
      setNote('');
      setNotifyPatient(true);
      setApplyFee(true);
    }
  }, [open]);

  if (!appt) return null;

  const patientName = appt.patient_name
    || appt.notes?.match(/Patient:\s*([^|]+)/)?.[1]?.trim()
    || 'Patient';

  const patientPhone = appt.patient_phone
    || appt.notes?.match(/Phone:\s*([^|]+)/)?.[1]?.trim()
    || null;

  const dateStr = appt.appointment_date?.substring(0, 10) || '';
  const formattedDate = dateStr
    ? format(new Date(dateStr + 'T12:00:00'), 'EEE, MMM d, yyyy')
    : '—';
  const timeStr = appt.appointment_time || '';
  const baseAmount = appt.total_amount || 0;
  const calculatedFee = baseAmount * 0.5;
  const fee = applyFee ? calculatedFee : 0;

  const canNotify = !!patientPhone;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      // Cast to any because generated types don't include no_show/no_show_at/no_show_fee yet (columns exist in DB)
      const { error } = await supabase.from('appointments').update({
        status: 'cancelled',
        no_show: true,
        no_show_at: new Date().toISOString(),
        no_show_fee: fee,
        cancellation_reason: `No-show${applyFee ? ` (fee: $${fee.toFixed(2)})` : ' (fee waived)'}${note ? `. ${note}` : ''}`,
        cancelled_at: new Date().toISOString(),
      } as any).eq('id', appt.id);
      if (error) throw error;

      // Activity log
      try {
        await supabase.from('activity_log' as any).insert({
          patient_id: appt.patient_id || null,
          activity_type: 'no_show',
          description: `Marked no-show${applyFee ? ` with $${fee.toFixed(2)} fee` : ' (fee waived)'}${note ? `. Note: ${note}` : ''}${!notifyPatient ? ' [no patient notification]' : ''}`,
          performed_by: 'admin',
          appointment_id: appt.id,
        });
      } catch (logErr) {
        console.warn('Activity log error (non-fatal):', logErr);
      }

      // Patient notification
      if (notifyPatient && canNotify) {
        try {
          const dateLabel = dateStr
            ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
                month: 'long', day: 'numeric',
              })
            : 'your scheduled date';
          const feeText = applyFee
            ? ` A no-show fee of $${fee.toFixed(2)} has been applied per our policy.`
            : '';
          await supabase.functions.invoke('send-sms-notification', {
            body: {
              to: patientPhone,
              message: `ConveLabs: We were unable to complete your appointment on ${dateLabel}${timeStr ? ` at ${timeStr}` : ''}.${feeText} To rebook, call (941) 527-9169 or visit convelabs.com`,
            },
          });
        } catch (notifErr) {
          console.error('SMS notification error (non-fatal):', notifErr);
          toast.warning('No-show recorded but patient notification failed');
        }
      }

      toast.success(
        `${patientName} marked as no-show${applyFee ? ` · $${fee.toFixed(2)} fee logged` : ''}`
      );
      onMarked();
      onClose();
    } catch (err: any) {
      console.error('No-show error:', err);
      toast.error(err.message || 'Failed to mark no-show');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-md w-[95vw] sm:w-full p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <UserX className="h-5 w-5" />
            Mark as No-Show
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Context */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1 text-sm">
            <p className="font-semibold text-gray-900">{patientName}</p>
            <p className="text-gray-700">{formattedDate}{timeStr ? ` · ${timeStr}` : ''}</p>
            {appt.service_name && <p className="text-gray-500 text-xs">{appt.service_name}</p>}
          </div>

          {/* Fee */}
          <div className="border rounded-lg p-3 flex items-start gap-3">
            <input
              type="checkbox"
              id="no-show-apply-fee"
              checked={applyFee}
              onChange={e => setApplyFee(e.target.checked)}
              className="mt-1 rounded border-gray-300"
            />
            <label htmlFor="no-show-apply-fee" className="text-sm flex-1 cursor-pointer">
              <div className="flex items-center gap-1.5 font-medium text-gray-900">
                <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                Apply 50% no-show fee (${calculatedFee.toFixed(2)})
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {applyFee
                  ? `Patient will be charged $${calculatedFee.toFixed(2)} — covers phleb time + travel.`
                  : <span className="text-amber-600">Fee waived — use for first-time no-shows or verified emergencies only.</span>
                }
              </p>
            </label>
          </div>

          {/* Notify */}
          <div className="border rounded-lg p-3 flex items-start gap-3">
            <input
              type="checkbox"
              id="no-show-notify-patient"
              checked={notifyPatient}
              onChange={e => setNotifyPatient(e.target.checked)}
              disabled={!canNotify}
              className="mt-1 rounded border-gray-300"
            />
            <label htmlFor="no-show-notify-patient" className="text-sm flex-1 cursor-pointer">
              <div className="flex items-center gap-1.5 font-medium text-gray-900">
                {notifyPatient
                  ? <Bell className="h-3.5 w-3.5 text-emerald-600" />
                  : <BellOff className="h-3.5 w-3.5 text-gray-400" />}
                Notify patient via SMS
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {!canNotify
                  ? 'No phone number on file — cannot notify'
                  : notifyPatient
                    ? `Text will be sent to ${patientPhone} with rebook link`
                    : <span className="text-amber-600">Patient will NOT be notified — risks them not rebooking</span>
                }
              </p>
            </label>
          </div>

          {/* Note */}
          <div>
            <Label>
              Internal Note{' '}
              <span className="text-muted-foreground font-normal">(Optional)</span>
            </Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Phleb arrived, no answer at door. Called 3x, no pickup."
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Back
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isSubmitting ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Marking...</>
              ) : (
                <><UserX className="mr-1 h-4 w-4" /> Confirm No-Show</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NoShowAppointmentModal;
