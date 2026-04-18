import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Printer, Check, Loader2, User, Calendar, Clock, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { format } from 'date-fns';

/**
 * TUBE LABEL MODAL — NIIMBOT-friendly label prep for phlebs.
 *
 * Context: phlebs use NIIMBOT Bluetooth label printers (B21/D11) to label
 * blood tubes AFTER collection. The NIIMBOT app accepts text fields directly —
 * the phleb types patient name, DOB, collection time/date, then prints.
 *
 * This modal pre-formats the 4 fields NIIMBOT wants, with one-tap copy
 * buttons per field so the phleb can paste into the NIIMBOT app without
 * retyping. Also stamps `appointments.collection_at` the moment they hit
 * "Mark collection time" — giving us a real timestamp for HIPAA chain of
 * custody AND distinguishing drawn-but-not-delivered from still-scheduled.
 *
 * If the phleb allows geolocation, we also stash the draw location in
 * `collection_location` for audit.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  patientName: string;
  patientDob: string | null;
  existingCollectionAt: string | null;
  onMarked?: () => void;
}

const TubeLabelModal: React.FC<Props> = ({ open, onClose, appointmentId, patientName, patientDob, existingCollectionAt, onMarked }) => {
  const [now, setNow] = useState<Date>(new Date());
  const [marking, setMarking] = useState(false);
  const [markedAt, setMarkedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Restore previously-marked time so reopening the modal doesn't lose state
  useEffect(() => {
    if (open && existingCollectionAt) {
      try { setMarkedAt(new Date(existingCollectionAt)); } catch { /* ignore */ }
    } else if (open) {
      setMarkedAt(null);
    }
  }, [open, existingCollectionAt]);

  // Keep "now" ticking while modal is open so the time field is accurate at mark-time
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(new Date()), 30_000); // every 30s
    return () => clearInterval(t);
  }, [open]);

  const displayDob = patientDob ? (() => {
    try {
      return format(new Date(patientDob + 'T00:00:00'), 'MM/dd/yyyy');
    } catch {
      return patientDob;
    }
  })() : '—';

  const displayDate = (d: Date) => format(d, 'MM/dd/yyyy');
  const displayTime = (d: Date) => format(d, 'HH:mm');

  const usedTime = markedAt || now;

  const copy = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      toast.error('Copy failed — long-press to select manually');
    }
  }, []);

  const copyAll = useCallback(async () => {
    const block = [
      `Name: ${patientName}`,
      `DOB: ${displayDob}`,
      `Date: ${displayDate(usedTime)}`,
      `Time: ${displayTime(usedTime)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(block);
      setCopied('all');
      toast.success('All 4 fields copied — paste into NIIMBOT');
      setTimeout(() => setCopied((c) => (c === 'all' ? null : c)), 2000);
    } catch {
      toast.error('Copy failed');
    }
  }, [patientName, displayDob, usedTime]);

  const markCollection = async () => {
    setMarking(true);
    const stampAt = new Date();
    let location: { lat: number; lng: number; accuracy: number } | null = null;

    // Best-effort geolocation — don't block if denied
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject('no_geo');
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 60_000,
        });
      });
      location = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch { /* ignore — geo opt-in */ }

    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          collection_at: stampAt.toISOString(),
          ...(location ? { collection_location: location } : {}),
        })
        .eq('id', appointmentId);
      if (error) throw error;
      setMarkedAt(stampAt);
      toast.success(`Collection time stamped: ${displayTime(stampAt)}`);
      onMarked?.();
    } catch (e: any) {
      toast.error(e.message || 'Failed to stamp collection time');
    } finally {
      setMarking(false);
    }
  };

  const FieldRow: React.FC<{ icon: any; label: string; value: string; k: string }> = ({ icon: Icon, label, value, k }) => (
    <div className="flex items-stretch gap-2 border rounded-lg overflow-hidden bg-white">
      <div className="flex items-center px-3 bg-gray-50 border-r flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0 py-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</p>
        <p className="text-sm font-mono font-semibold text-gray-900 truncate">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => copy(k, value)}
        className="px-3 flex items-center border-l hover:bg-gray-50 transition"
        title={`Copy ${label}`}
      >
        {copied === k
          ? <Check className="h-4 w-4 text-emerald-600" />
          : <Copy className="h-4 w-4 text-gray-500" />}
      </button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !marking && onClose()}>
      <DialogContent className="max-w-md w-[95vw] p-4 sm:p-5 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-[#B91C1C]" />
            Tube Label — NIIMBOT
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-gray-600">
            Paste these fields into the NIIMBOT app and print. Collection time defaults to now —
            hit <strong>Mark collection time</strong> when you finish the draw to lock the timestamp.
          </p>

          <FieldRow icon={User} label="Patient Name" value={patientName} k="name" />
          <FieldRow icon={FileText} label="DOB" value={displayDob} k="dob" />
          <FieldRow icon={Calendar} label="Collection Date" value={displayDate(usedTime)} k="date" />
          <FieldRow icon={Clock} label="Collection Time" value={displayTime(usedTime)} k="time" />

          <Button
            variant="outline"
            size="sm"
            className="w-full h-10 gap-1.5"
            onClick={copyAll}
          >
            {copied === 'all' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            Copy all 4 fields
          </Button>

          {markedAt ? (
            <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3 text-xs text-emerald-800">
              <div className="flex items-center gap-1.5 font-semibold mb-0.5">
                <Check className="h-3.5 w-3.5" /> Collection stamped at {format(markedAt, 'MMM d, h:mm a')}
              </div>
              <p className="text-emerald-700">
                Time is now locked on the record for audit + delivery. Tube labels should use this exact time.
              </p>
            </div>
          ) : (
            <Button
              className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-11"
              disabled={marking}
              onClick={markCollection}
            >
              {marking ? <><Loader2 className="h-4 w-4 animate-spin" /> Stamping…</> : <>Mark collection time ({displayTime(now)})</>}
            </Button>
          )}

          <p className="text-[10px] text-gray-400 leading-relaxed pt-1">
            If location permission is granted, we'll also log the draw location for HIPAA chain-of-custody. Optional — you can decline.
          </p>

          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={marking}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TubeLabelModal;
