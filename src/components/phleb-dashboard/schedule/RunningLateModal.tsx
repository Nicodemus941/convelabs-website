import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Clock, Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { buildDelayMessage } from '@/lib/phlebHelpers';

/**
 * RUNNING LATE — one-tap "I'm delayed" SMS flow for phlebs.
 *
 * Phleb is stuck in traffic or running over at the prior visit. Instead of
 * fumbling to draft a message at a red light, they hit this button, pick a
 * delay preset (5/10/15/30 min or custom), and a pre-filled Hormozi-tone
 * apology SMS goes to the patient. Also pings the admin so the front office
 * knows a visit is slipping.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  patientFirstName: string;
  patientPhone: string | null;
  appointmentId: string;
}

const PRESETS = [5, 10, 15, 20, 30];

const RunningLateModal: React.FC<Props> = ({ open, onClose, patientFirstName, patientPhone, appointmentId }) => {
  const [delay, setDelay] = useState(15);
  const [message, setMessage] = useState(() => buildDelayMessage(patientFirstName, 15));
  const [sending, setSending] = useState(false);

  // Re-build message when user changes preset
  const pickPreset = (m: number) => {
    setDelay(m);
    setMessage(buildDelayMessage(patientFirstName, m));
  };

  const handleSend = async () => {
    if (!patientPhone) {
      toast.error('No phone number on file for this patient');
      return;
    }
    if (!message.trim()) {
      toast.error('Message cannot be empty');
      return;
    }
    setSending(true);
    try {
      // Send to patient
      const patientResp = await supabase.functions.invoke('send-sms-notification', {
        body: { to: patientPhone, message },
      });
      if (patientResp.error) throw patientResp.error;

      // Ping admin in the background
      try {
        await supabase.functions.invoke('send-sms-notification', {
          body: {
            to: '9415279169',
            message: `⏰ Phleb running late — ${patientFirstName} (appt ${appointmentId.slice(0, 8)}): ETA +${delay}min. Patient notified.`,
          },
        });
      } catch { /* non-blocking */ }

      // Audit log
      try {
        await supabase.from('activity_log' as any).insert({
          appointment_id: appointmentId,
          activity_type: 'running_late_notification',
          description: `Phleb notified patient of ~${delay} min delay.`,
          performed_by: 'phleb',
        });
      } catch { /* non-blocking */ }

      toast.success(`Patient notified (+${delay} min)`);
      onClose();
    } catch (e: any) {
      console.error('Running late SMS error:', e);
      toast.error('SMS failed — call the patient directly');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !sending && onClose()}>
      <DialogContent className="max-w-md w-[95vw] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            Running Late — Notify Patient
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">How far behind are you?</p>
            <div className="grid grid-cols-5 gap-1.5">
              {PRESETS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickPreset(m)}
                  className={`px-2 py-2 rounded-md text-sm font-medium border transition ${
                    delay === m
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-amber-50'
                  }`}
                >
                  +{m}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Message (edit before send)</p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="text-sm resize-none"
              disabled={sending}
            />
            <p className="text-[11px] text-gray-400 mt-1">{message.length} chars · SMS max ~160 per segment</p>
          </div>

          {!patientPhone && (
            <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700">
              ⚠️ No phone number on file. Call patient directly.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              disabled={sending || !patientPhone || !message.trim()}
              onClick={handleSend}
            >
              {sending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
              ) : (
                <><Send className="h-4 w-4" /> Send SMS</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RunningLateModal;
