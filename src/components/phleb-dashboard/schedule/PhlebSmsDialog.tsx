import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Smartphone, MessageSquare, Send, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

/**
 * PhlebSmsDialog — lets the phlebotomist choose HOW to text the patient:
 *
 *   1. "My phone" — opens the phlebotomist's own native Messages app via an
 *      `sms:` deep link, pre-addressed to the patient's number. The text is
 *      sent from the phleb's personal device/number (no ConveLabs record).
 *   2. "ConveLabs text" — sends through our system (send-sms-notification),
 *      from the business number, logged + visible in the SMS inbox. A short
 *      composer is shown; the patient's number is pre-populated.
 *
 * Either way the patient's phone number is carried over automatically.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  patientName: string;
  patientPhone: string | null;
}

// E.164-ish normalize for the system send path (assumes US).
function toE164(raw: string): string {
  return raw.startsWith('+') ? raw : `+1${raw.replace(/\D/g, '')}`;
}

const PhlebSmsDialog: React.FC<Props> = ({ open, onOpenChange, appointmentId, patientName, patientPhone }) => {
  const [mode, setMode] = useState<'choose' | 'system'>('choose');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => { setMode('choose'); setMessage(''); setSending(false); };
  const close = () => { onOpenChange(false); setTimeout(reset, 200); };

  const openNative = () => {
    if (!patientPhone) { toast.error(`No phone number for ${patientName}`); return; }
    // `sms:` opens the phleb's device Messages app, pre-addressed to the patient.
    window.open(`sms:${patientPhone}`, '_blank');
    close();
  };

  const sendSystem = async () => {
    if (!patientPhone) { toast.error(`No phone number for ${patientName}`); return; }
    if (!message.trim()) { toast.error('Type a message first'); return; }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-sms-notification', {
        body: {
          appointmentId,
          notificationType: 'phleb_manual',
          phoneNumber: toE164(patientPhone),
          customMessage: message.trim(),
        },
      });
      if (error) throw error;
      toast.success(`Text sent to ${patientName} via ConveLabs`);
      close();
    } catch (e: any) {
      toast.error(e?.message || 'Could not send the text — try your phone instead.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[#B91C1C]" /> Text {patientName}
          </DialogTitle>
          <DialogDescription>
            {patientPhone ? <>To: <span className="font-medium">{patientPhone}</span></> : 'No phone number on file'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'choose' ? (
          <div className="space-y-2 py-1">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-3"
              disabled={!patientPhone}
              onClick={openNative}
            >
              <Smartphone className="h-5 w-5 text-[#B91C1C]" />
              <span className="text-left">
                <span className="block font-semibold text-sm">My phone's Messages</span>
                <span className="block text-xs text-muted-foreground">Opens your phone, texts from your number</span>
              </span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-3"
              disabled={!patientPhone}
              onClick={() => setMode('system')}
            >
              <MessageSquare className="h-5 w-5 text-[#B91C1C]" />
              <span className="text-left">
                <span className="block font-semibold text-sm">ConveLabs text</span>
                <span className="block text-xs text-muted-foreground">Sends from the business number, logged in the inbox</span>
              </span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Message to ${patientName}…`}
              rows={4}
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setMode('choose')} disabled={sending}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white"
                onClick={sendSystem}
                disabled={sending || !message.trim()}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send via ConveLabs
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PhlebSmsDialog;
