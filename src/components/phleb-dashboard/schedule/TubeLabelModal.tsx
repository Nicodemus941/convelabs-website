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

  // "John Doe" → "Doe, John". "Mary Jane Smith" → "Smith, Mary Jane".
  // Single-word names → returned as-is (no comma).
  const formatLastFirst = (full: string): string => {
    const trimmed = (full || '').trim();
    if (!trimmed) return '—';
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return trimmed;
    const last = parts[parts.length - 1];
    const first = parts.slice(0, -1).join(' ');
    return `${last}, ${first}`;
  };
  const lastFirstName = formatLastFirst(patientName);

  // Single-click label payload: 3 lines, ordered exactly the way the
  // phleb wants to read it on a tube — surname-first for chart matching.
  const labelText = [
    lastFirstName,
    displayDob,
    `${displayTime(usedTime)} ${displayDate(usedTime)}`,
  ].join('\n');

  const copyLabel = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(labelText);
      setCopied('all');
      toast.success('Label copied — paste into NIIMBOT');
      setTimeout(() => setCopied((c) => (c === 'all' ? null : c)), 2000);
    } catch {
      toast.error('Copy failed — long-press to select manually');
    }
  }, [labelText]);

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
            Tap the label below to copy all 3 lines, then paste into the NIIMBOT app and print. Collection time defaults to now —
            hit <strong>Mark collection time</strong> when you finish the draw to lock the timestamp.
          </p>

          {/* Single-click label preview — entire block is the copy target */}
          <button
            type="button"
            onClick={copyLabel}
            className="w-full text-left border-2 rounded-xl bg-white hover:bg-gray-50 active:bg-gray-100 transition overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40"
            style={{ borderColor: copied === 'all' ? '#10b981' : '#e5e7eb' }}
            title="Tap to copy all 3 lines"
          >
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> NIIMBOT label preview
              </span>
              <span className="flex items-center gap-1 text-[10px] normal-case tracking-normal">
                {copied === 'all' ? (
                  <><Check className="h-3.5 w-3.5 text-emerald-600" /> <span className="text-emerald-700 font-bold">Copied</span></>
                ) : (
                  <><Copy className="h-3.5 w-3.5 text-gray-500" /> <span className="text-gray-600">Tap to copy</span></>
                )}
              </span>
            </div>
            <div className="p-4 font-mono">
              <div className="flex items-center gap-2 mb-1">
                <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-base font-bold text-gray-900 truncate">{lastFirstName}</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-800">{displayDob}</span>
                <span className="text-[10px] uppercase text-gray-400 ml-1">DOB</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-800">{displayTime(usedTime)} {displayDate(usedTime)}</span>
                <span className="text-[10px] uppercase text-gray-400 ml-1">collected</span>
              </div>
            </div>
          </button>

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
