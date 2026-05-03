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
  patientEmail?: string | null;
  onStatusUpdated: () => void;
}

const OnTheWayDialog: React.FC<OnTheWayDialogProps> = ({
  open,
  onOpenChange,
  appointmentId,
  patientName,
  patientPhone,
  patientEmail,
  onStatusUpdated,
}) => {
  const [etaMinutes, setEtaMinutes] = useState('15');
  const [requiresUrine, setRequiresUrine] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    setIsSending(true);
    try {
      // Update status + capture phleb's current location for the
      // tracking page (best-effort; never blocks the status change).
      const captureGeo = (): Promise<{ lat: number; lng: number; accuracy: number } | null> =>
        new Promise((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
          );
        });
      const geo = await captureGeo();

      const { error: statusError } = await supabase
        .from('appointments')
        .update({
          status: 'en_route',
          ...(geo ? { delivery_location: { ...geo, captured_at: new Date().toISOString() } } : {}),
        })
        .eq('id', appointmentId);

      if (statusError) throw statusError;

      // Pull the appointment's view_token for the tracking link
      const { data: apptRow } = await supabase
        .from('appointments')
        .select('view_token')
        .eq('id', appointmentId)
        .maybeSingle();
      const trackUrl = (apptRow as any)?.view_token
        ? `https://www.convelabs.com/appt/${(apptRow as any).view_token}/track`
        : null;

      // Build message — Uber-style trust signal with tracking link
      let smsMessage = `Great news! Your ConveLabs phlebotomist is on the way and will arrive in approximately ${etaMinutes} minutes. Please have a designated sterile, well-lit area where we can perform the collection.`;
      if (requiresUrine) {
        smsMessage += ` Also, your provider has ordered a urine sample. Your phlebotomist will provide you with a sterile urine container.`;
      }
      if (trackUrl) {
        smsMessage += ` Track live: ${trackUrl}`;
      } else {
        smsMessage += ` We're looking forward to serving you. See you soon!`;
      }

      // Send SMS if phone exists
      let smsSent = false;
      if (patientPhone) {
        const { error: smsError } = await supabase.functions.invoke('send-sms-notification', {
          body: {
            appointmentId,
            notificationType: 'on_the_way_custom',
            phoneNumber: patientPhone.startsWith('+') ? patientPhone : `+1${patientPhone.replace(/\D/g, '')}`,
            customMessage: smsMessage,
          },
        });
        if (!smsError) smsSent = true;
        else console.error('SMS error:', smsError);
      }

      // Always send email too (or as fallback if no phone)
      if (patientEmail) {
        await supabase.functions.invoke('send-email', {
          body: {
            to: patientEmail,
            subject: `Your ConveLabs Phlebotomist is On the Way! ETA: ${etaMinutes} minutes`,
            html: `<div style="font-family:Arial;max-width:600px;margin:0 auto;"><div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;"><h2 style="margin:0;">Your Phlebotomist is On the Way!</h2></div><div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;"><p>Hi ${patientName},</p><p>${smsMessage}</p><p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810<br>(941) 527-9169</p></div></div>`,
          },
        }).catch(err => console.error('Email error:', err));
      }

      if (smsSent) {
        toast.success(`On the way notification sent to ${patientName} (SMS + Email)`);
      } else if (patientEmail) {
        toast.success(`On the way email sent to ${patientName} (no phone on file)`);
      } else {
        toast.success('Status updated (no contact info on file)');
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
