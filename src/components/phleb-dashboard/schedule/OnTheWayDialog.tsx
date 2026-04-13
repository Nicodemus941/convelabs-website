import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Truck, Navigation, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

interface OnTheWayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  patientName: string;
  patientPhone: string | null;
  onStatusUpdated: () => void;
}

const OnTheWayDialog: React.FC<OnTheWayDialogProps> = ({
  open,
  onOpenChange,
  appointmentId,
  patientName,
  patientPhone,
  onStatusUpdated,
}) => {
  const [etaMinutes, setEtaMinutes] = useState('15');
  const [requiresUrine, setRequiresUrine] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    setIsSending(true);
    try {
      // Update status
      const { error: statusError } = await supabase
        .from('appointments')
        .update({ status: 'en_route' })
        .eq('id', appointmentId);

      if (statusError) throw statusError;

      // Build message
      let smsMessage = `Great news! Your ConveLabs phlebotomist is on the way and will arrive in approximately ${etaMinutes} minutes. Please have a designated sterile, well-lit area where we can perform the collection.`;
      if (requiresUrine) {
        smsMessage += ` Also, your provider has ordered a urine sample. Your phlebotomist will provide you with a sterile urine container.`;
      }
      smsMessage += ` We're looking forward to serving you. See you soon!`;

      // Send SMS
      if (patientPhone) {
        const { error: smsError } = await supabase.functions.invoke('send-sms-notification', {
          body: {
            appointmentId,
            notificationType: 'on_the_way_custom',
            phoneNumber: patientPhone,
            customMessage: smsMessage,
          },
        });
        if (smsError) {
          console.error('SMS error:', smsError);
          toast.error('Status updated but SMS failed');
        } else {
          toast.success(`On the way notification sent to ${patientName}`);
        }
      } else {
        toast.success('Status updated (no phone on file)');
      }

      onStatusUpdated();
      onOpenChange(false);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Failed to update status');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-[#B91C1C]" />
            On the Way
          </DialogTitle>
          <DialogDescription>
            Notify {patientName} that you're heading to their location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">ETA (minutes)</label>
            <Input
              type="number"
              min="1"
              max="120"
              value={etaMinutes}
              onChange={(e) => setEtaMinutes(e.target.value)}
              className="text-lg text-center font-semibold"
            />
          </div>

          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <Checkbox
              id="urine-sample"
              checked={requiresUrine}
              onCheckedChange={(checked) => setRequiresUrine(checked === true)}
              className="mt-0.5"
            />
            <label htmlFor="urine-sample" className="text-sm cursor-pointer">
              <span className="font-medium text-amber-800">Patient requires a urine sample</span>
              <p className="text-xs text-amber-600 mt-0.5">
                Patient will be notified to expect a sterile urine container.
              </p>
            </label>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Message Preview</p>
            <p className="text-sm text-gray-700">
              Great news! Your ConveLabs phlebotomist is on the way and will arrive in approximately {etaMinutes || '...'} minutes. Please have a designated sterile, well-lit area where we can perform the collection.
              {requiresUrine && ' Also, your provider has ordered a urine sample. Your phlebotomist will provide you with a sterile urine container.'}
              {' '}We're looking forward to serving you. See you soon!
            </p>
          </div>

          {!patientPhone && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs text-red-700">No phone number on file. Status will be updated but no SMS sent.</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button
            className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-2"
            onClick={handleSend}
            disabled={isSending || !etaMinutes}
          >
            {isSending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
            ) : (
              <><Navigation className="h-4 w-4" /> Send & Go</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OnTheWayDialog;
