import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { XCircle, Loader2, AlertTriangle, BellOff, Bell } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface CancelAppointmentModalProps {
  appointment: any;
  open: boolean;
  onClose: () => void;
  onCancelled: () => void;
  /** When true, also SMS the admin line about the cancellation (use for phleb-initiated field cancels). */
  alsoNotifyAdmin?: boolean;
  /** Label for who is performing the cancel — "admin" (default) or "phleb". Affects activity log + admin SMS copy. */
  performedBy?: 'admin' | 'phleb';
}

/**
 * CANCEL APPOINTMENT MODAL — Hormozi-style UX
 *
 * Structure: Purpose → Context → Action → Default.
 *
 * - Shows WHAT is being cancelled (patient + date + time + amount)
 *   so staff never cancel the wrong thing.
 * - Optional reason captured for audit/activity log.
 * - "Notify patient via SMS" toggle — DEFAULT ON.
 *   Protecting the patient relationship is the money-making default.
 *   Staff can suppress for test bookings, duplicates, or obvious mistakes
 *   without needing retraining.
 * - Destructive confirm button is red so mistakes are hard.
 */
const CancelAppointmentModal: React.FC<CancelAppointmentModalProps> = ({
  appointment, open, onClose, onCancelled, alsoNotifyAdmin = false, performedBy = 'admin',
}) => {
  const appt = appointment;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [notifyPatient, setNotifyPatient] = useState(true);

  useEffect(() => {
    if (open) {
      setReason('');
      setNotifyPatient(true);
    }
  }, [open]);

  if (!appt) return null;

  const patientName = appt.patient_name
    || appt.notes?.match(/Patient:\s*([^|]+)/)?.[1]?.trim()
    || 'Patient';

  const patientEmail = appt.patient_email
    || appt.notes?.match(/Email:\s*([^|\s]+)/)?.[1]?.trim()
    || null;

  const patientPhone = appt.patient_phone
    || appt.notes?.match(/Phone:\s*([^|]+)/)?.[1]?.trim()
    || null;

  const dateStr = appt.appointment_date?.substring(0, 10) || '';
  const formattedDate = dateStr
    ? format(new Date(dateStr + 'T12:00:00'), 'EEE, MMM d, yyyy')
    : '—';
  const timeStr = appt.appointment_time || '';
  const total = (appt.total_amount || 0) + (appt.tip_amount || 0);

  const canNotify = !!(patientPhone || patientEmail);

  const handleCancel = async () => {
    setIsSubmitting(true);
    try {
      // Update appointment
      const { error } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || null,
        })
        .eq('id', appt.id);

      if (error) throw error;

      // Activity log (non-fatal)
      try {
        await supabase.from('activity_log' as any).insert({
          patient_id: appt.patient_id || null,
          activity_type: 'cancel',
          description: `Appointment cancelled${reason ? `. Reason: ${reason}` : ''}${!notifyPatient ? ' [no patient notification]' : ''}`,
          performed_by: performedBy,
          appointment_id: appt.id,
        });
      } catch (logErr) {
        console.warn('Activity log error (non-fatal):', logErr);
      }

      // Admin notification (always, if caller requested it — field cancels by phleb)
      if (alsoNotifyAdmin) {
        try {
          await supabase.functions.invoke('send-sms-notification', {
            body: {
              to: '9415279169',
              message: `Appointment cancelled${performedBy === 'phleb' ? ' by phleb' : ''}: ${patientName}${timeStr ? ` (${timeStr})` : ''}${reason ? `. Reason: ${reason}` : ''}${notifyPatient ? '' : ' [patient NOT notified]'}`,
            },
          });
        } catch (e) {
          console.warn('Admin notify failed (non-fatal):', e);
        }
      }

      // Patient notification (only if opted-in and we have contact info)
      if (notifyPatient && canNotify) {
        try {
          if (patientPhone) {
            const dateLabel = dateStr
              ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric',
                })
              : 'your scheduled date';
            await supabase.functions.invoke('send-sms-notification', {
              body: {
                to: patientPhone,
                message: `ConveLabs: Your appointment on ${dateLabel}${timeStr ? ` at ${timeStr}` : ''} has been cancelled. ${reason ? `Reason: ${reason}. ` : ''}To rebook, call (941) 527-9169 or visit convelabs.com`,
              },
            });
          }
        } catch (notifErr) {
          console.error('Notification error (non-fatal):', notifErr);
          // Don't fail the cancel — just warn the user
          toast.warning('Appointment cancelled but patient notification failed');
        }
      }

      toast.success(
        notifyPatient && canNotify
          ? `${patientName}'s appointment cancelled — patient notified`
          : `${patientName}'s appointment cancelled (no notification sent)`
      );
      onCancelled();
      onClose();
    } catch (err: any) {
      console.error('Cancel error:', err);
      toast.error(err.message || 'Failed to cancel appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-md w-[95vw] sm:w-full p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <XCircle className="h-5 w-5" />
            Cancel Appointment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Appointment context */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1 text-sm">
            <p className="font-semibold text-gray-900">{patientName}</p>
            <p className="text-gray-700">{formattedDate}{timeStr ? ` · ${timeStr}` : ''}</p>
            {appt.service_name && <p className="text-gray-500 text-xs">{appt.service_name}</p>}
            {total > 0 && (
              <p className="text-xs text-gray-600">
                ${total.toFixed(2)} · {appt.payment_status === 'completed' ? 'Paid' : 'Unpaid'}
              </p>
            )}
          </div>

          {/* Reason */}
          <div>
            <Label>
              Cancellation Reason{' '}
              <span className="text-muted-foreground font-normal">(Optional)</span>
            </Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Patient request, scheduling conflict, duplicate booking, etc."
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Notify patient toggle */}
          <div className="border rounded-lg p-3 flex items-start gap-3">
            <input
              type="checkbox"
              id="cancel-notify-patient"
              checked={notifyPatient}
              onChange={e => setNotifyPatient(e.target.checked)}
              disabled={!canNotify}
              className="mt-1 rounded border-gray-300"
            />
            <label htmlFor="cancel-notify-patient" className="text-sm flex-1 cursor-pointer">
              <div className="flex items-center gap-1.5 font-medium text-gray-900">
                {notifyPatient ? (
                  <Bell className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <BellOff className="h-3.5 w-3.5 text-gray-400" />
                )}
                Notify patient via SMS
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {!canNotify ? (
                  'No phone number on file — cannot notify'
                ) : notifyPatient ? (
                  `Text will be sent to ${patientPhone}`
                ) : (
                  <span className="text-amber-600">Patient will NOT be notified — use for duplicates or test bookings</span>
                )}
              </p>
            </label>
          </div>

          {/* Warning if unpaid + paid status hint */}
          {appt.payment_status === 'completed' && total > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-700">
                <p className="font-medium">This appointment is paid.</p>
                <p>Cancelling does NOT issue a refund. Process refund separately in Stripe if needed.</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Keep Appointment
            </Button>
            <Button
              onClick={handleCancel}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSubmitting ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Cancelling...</>
              ) : (
                <><XCircle className="mr-1 h-4 w-4" /> Confirm Cancel</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CancelAppointmentModal;
