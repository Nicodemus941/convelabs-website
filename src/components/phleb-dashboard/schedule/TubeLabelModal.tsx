import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Printer, Check, Loader2, User, Calendar, Clock, FileText, Users } from 'lucide-react';
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
 * Bundle awareness (2026-05-21): when a visit has companions (family bundle),
 * render ONE tappable label per patient (primary + each companion) so the
 * phleb prints one label per body without re-typing. Each label is its own
 * copy button — tap → paste into NIIMBOT → print → next patient.
 *
 * Collection-time stamp applies to the PRIMARY appointment row only (the
 * bundle is settled at the primary level). Companion appointment rows can
 * be stamped independently later if needed.
 */

interface CompanionPatient {
  name: string;
  dob: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  patientName: string;
  patientDob: string | null;
  companions?: CompanionPatient[];
  existingCollectionAt: string | null;
  onMarked?: () => void;
}

// "John Doe" → "Doe, John". "Mary Jane Smith" → "Smith, Mary Jane".
const formatLastFirst = (full: string): string => {
  const trimmed = (full || '').trim();
  if (!trimmed) return '—';
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return `${last}, ${first}`;
};

const formatDob = (dob: string | null): string => {
  if (!dob) return '—';
  try { return format(new Date(dob + 'T00:00:00'), 'MM/dd/yyyy'); } catch { return dob; }
};

const TubeLabelModal: React.FC<Props> = ({
  open, onClose, appointmentId, patientName, patientDob, companions = [],
  existingCollectionAt, onMarked,
}) => {
  const [now, setNow] = useState<Date>(new Date());
  const [marking, setMarking] = useState(false);
  const [markedAt, setMarkedAt] = useState<Date | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (open && existingCollectionAt) {
      try { setMarkedAt(new Date(existingCollectionAt)); } catch { /* ignore */ }
    } else if (open) {
      setMarkedAt(null);
    }
  }, [open, existingCollectionAt]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [open]);

  const displayDate = (d: Date) => format(d, 'MM/dd/yyyy');
  const displayTime = (d: Date) => format(d, 'HH:mm');
  const usedTime = markedAt || now;

  // Build the patient list — primary first, then any companions.
  const patients = useMemo(() => {
    const list: CompanionPatient[] = [{ name: patientName, dob: patientDob }];
    for (const c of (companions || [])) {
      const n = (c?.name || '').trim();
      if (!n) continue;
      // Don't duplicate primary if it somehow landed in companions list
      if (n.toLowerCase() === (patientName || '').trim().toLowerCase()) continue;
      list.push({ name: n, dob: c.dob || null });
    }
    return list;
  }, [patientName, patientDob, companions]);

  const labelTextFor = (p: CompanionPatient): string => [
    formatLastFirst(p.name),
    formatDob(p.dob),
    `${displayTime(usedTime)} ${displayDate(usedTime)}`,
  ].join('\n');

  const copyLabelAt = useCallback(async (idx: number) => {
    try {
      await navigator.clipboard.writeText(labelTextFor(patients[idx]));
      setCopiedIdx(idx);
      const first = patients[idx].name.split(' ')[0];
      toast.success(`${first}'s label copied — paste into NIIMBOT`);
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 2000);
    } catch {
      toast.error('Copy failed — long-press to select manually');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, usedTime]);

  const markCollection = async () => {
    setMarking(true);
    const stampAt = new Date();
    try {
      // PERF 2026-07-02: stamp the collection time IMMEDIATELY — do NOT block
      // on geolocation first. Previously we awaited
      // navigator.geolocation.getCurrentPosition (up to 5s, and effectively
      // longer/hung inside the iOS WebView while the location permission
      // prompt was up), which made "Mark collection time" feel like it froze
      // for several seconds before logging. Write the timestamp + status now;
      // capture the chain-of-custody location in the BACKGROUND and patch it
      // onto the row when (if) it resolves.
      //
      // N1 fix 2026-05-25: also flip status to 'specimen_delivered' so the
      // visit stops appearing as "in_progress" forever. Phlebs were tapping
      // Mark Collection then forgetting to flip status separately, leaving
      // 10+ stale-status rows visible across dashboards. Single-step
      // collection now closes the workflow loop.
      //
      // We use 'specimen_delivered' (not 'completed') so the visit still
      // shows in the phleb's day view until they confirm specimen handoff.
      const updates: Record<string, any> = {
        collection_at: stampAt.toISOString(),
        status: 'specimen_delivered',
        updated_at: stampAt.toISOString(),
      };
      const { error } = await supabase.from('appointments').update(updates).eq('id', appointmentId);
      if (error) throw error;
      setMarkedAt(stampAt);
      toast.success(`Collection stamped: ${displayTime(stampAt)} · Status → Specimen Delivered`);
      onMarked?.();

      // Background, best-effort chain-of-custody location. Non-blocking: the
      // stamp is already saved, so a slow/denied GPS never delays the phleb.
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            supabase
              .from('appointments')
              .update({ collection_location: location })
              .eq('id', appointmentId)
              .then(() => {}, () => { /* non-fatal: location is optional */ });
          },
          () => { /* declined / unavailable — optional */ },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
        );
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to stamp collection time');
    } finally {
      setMarking(false);
    }
  };

  const isBundle = patients.length > 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !marking && onClose()}>
      <DialogContent className="max-w-md w-[95vw] p-4 sm:p-5 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-[#B91C1C]" />
            Tube Label — NIIMBOT
            {isBundle && (
              <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <Users className="h-3 w-3" /> Bundle · {patients.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-gray-600">
            {isBundle
              ? `Tap each label below to copy that patient's 3 lines, then paste into NIIMBOT and print. Repeat for all ${patients.length} patients. Collection time defaults to now — hit Mark collection time when you finish.`
              : 'Tap the label below to copy all 3 lines, then paste into the NIIMBOT app and print. Collection time defaults to now — hit Mark collection time when you finish the draw to lock the timestamp.'}
          </p>

          {/* One label card per patient */}
          {patients.map((p, idx) => {
            const isCopied = copiedIdx === idx;
            const lastFirst = formatLastFirst(p.name);
            const dobStr = formatDob(p.dob);
            return (
              <button
                key={`${p.name}-${idx}`}
                type="button"
                onClick={() => copyLabelAt(idx)}
                className="w-full text-left border-2 rounded-xl bg-white hover:bg-gray-50 active:bg-gray-100 transition overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40"
                style={{ borderColor: isCopied ? '#10b981' : '#e5e7eb' }}
                title={`Tap to copy ${p.name}'s label`}
              >
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3" />
                    {isBundle ? `Patient ${idx + 1} of ${patients.length}` : 'NIIMBOT label preview'}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] normal-case tracking-normal">
                    {isCopied ? (
                      <><Check className="h-3.5 w-3.5 text-emerald-600" /> <span className="text-emerald-700 font-bold">Copied</span></>
                    ) : (
                      <><Copy className="h-3.5 w-3.5 text-gray-500" /> <span className="text-gray-600">Tap to copy</span></>
                    )}
                  </span>
                </div>
                <div className="p-4 font-mono">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-base font-bold text-gray-900 truncate">{lastFirst}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-gray-800">{dobStr}</span>
                    <span className="text-[10px] uppercase text-gray-400 ml-1">DOB</span>
                    {dobStr === '—' && (
                      <span className="text-[10px] text-amber-700 ml-1">add DOB in NIIMBOT</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-gray-800">{displayTime(usedTime)} {displayDate(usedTime)}</span>
                    <span className="text-[10px] uppercase text-gray-400 ml-1">collected</span>
                  </div>
                </div>
              </button>
            );
          })}

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
