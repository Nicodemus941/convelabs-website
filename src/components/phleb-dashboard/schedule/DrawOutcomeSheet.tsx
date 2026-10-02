/**
 * DrawOutcomeSheet — the "Draw done" step of the live visit.
 *
 * Stamps `collection_at` (keeping an earlier tube-label stamp if one exists)
 * and REQUIRES a one-tap outcome:
 *   success_first_stick | success_after_second_stick | partial | unsuccessful
 * Unsuccessful also needs a reason (+ note), and offers "Schedule a free
 * redraw" (create_free_redraw RPC → linked $0 visit, no patient messaging).
 * Optional tube count. If the visit has no service_type, one must be chosen
 * here so the lab-bound classifier has something to work with.
 *
 * This is the data behind the draw success rate + draw time metrics
 * (Owner › Quality). Phone-first: big tap targets, brand-red primary.
 */
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2, Droplets, AlertTriangle, CalendarPlus, Syringe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  DRAW_OUTCOME_LABELS, DRAW_FAILURE_LABELS, type DrawOutcome, type DrawFailureReason,
} from '@/lib/phlebHelpers';

export interface DrawOutcomePatch {
  collection_at: string;
  draw_outcome: DrawOutcome;
  draw_failure_reason: DrawFailureReason | null;
  draw_note: string | null;
  tube_count: number | null;
  service_type?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  patientName: string;
  serviceType: string | null;
  existingCollectionAt: string | null;
  existing?: {
    draw_outcome?: string | null;
    draw_failure_reason?: string | null;
    draw_note?: string | null;
    tube_count?: number | null;
  };
  /** Fired after the row is saved so the card can update without a refetch. */
  onSaved: (patch: DrawOutcomePatch) => void;
}

// Service types a phleb can pick when the visit came in blank. Labels match
// scheduleShared SERVICE_LABELS; ids are the canonical codes.
const SERVICE_CHOICES: Array<{ id: string; label: string }> = [
  { id: 'mobile', label: 'Mobile blood draw' },
  { id: 'senior', label: 'Senior / assisted-living draw' },
  { id: 'in-office', label: 'In-office draw (left on site)' },
  { id: 'specialty-kit', label: 'Specialty kit (ships UPS/FedEx)' },
  { id: 'therapeutic', label: 'Therapeutic phlebotomy' },
  { id: 'specimen-collection-stool-urine', label: 'Specimen collection (stool/urine)' },
];

const OUTCOMES: Array<{ id: DrawOutcome; icon: React.ElementType; tone: string; activeTone: string; hint: string }> = [
  { id: 'success_first_stick', icon: CheckCircle2, tone: 'border-emerald-200 text-emerald-800 bg-emerald-50', activeTone: 'bg-emerald-600 text-white border-emerald-600', hint: 'One stick, all tubes' },
  { id: 'success_after_second_stick', icon: Syringe, tone: 'border-amber-200 text-amber-800 bg-amber-50', activeTone: 'bg-amber-600 text-white border-amber-600', hint: 'Needed a second stick' },
  { id: 'partial', icon: Droplets, tone: 'border-orange-200 text-orange-800 bg-orange-50', activeTone: 'bg-orange-600 text-white border-orange-600', hint: 'Some tubes short' },
  { id: 'unsuccessful', icon: AlertTriangle, tone: 'border-red-200 text-red-800 bg-red-50', activeTone: 'bg-[#B91C1C] text-white border-[#B91C1C]', hint: 'No usable sample' },
];

const DrawOutcomeSheet: React.FC<Props> = ({
  open, onClose, appointmentId, patientName, serviceType, existingCollectionAt, existing, onSaved,
}) => {
  const [outcome, setOutcome] = useState<DrawOutcome | null>(null);
  const [reason, setReason] = useState<DrawFailureReason | null>(null);
  const [note, setNote] = useState('');
  const [tubes, setTubes] = useState('');
  const [chosenService, setChosenService] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedUnsuccessful, setSavedUnsuccessful] = useState(false);
  const [redrawId, setRedrawId] = useState<string | null>(null);
  const [schedulingRedraw, setSchedulingRedraw] = useState(false);

  const needsServiceType = !(serviceType || '').trim();

  useEffect(() => {
    if (!open) return;
    setOutcome((existing?.draw_outcome as DrawOutcome) || null);
    setReason((existing?.draw_failure_reason as DrawFailureReason) || null);
    setNote(existing?.draw_note || '');
    setTubes(existing?.tube_count != null ? String(existing.tube_count) : '');
    setChosenService('');
    setSavedUnsuccessful(false);
    setRedrawId(null);
  }, [open, existing?.draw_outcome, existing?.draw_failure_reason, existing?.draw_note, existing?.tube_count]);

  const tubeCount = tubes.trim() === '' ? null : Math.max(0, Math.min(60, parseInt(tubes, 10) || 0));
  const canSave = !!outcome
    && (outcome !== 'unsuccessful' || (!!reason && (reason !== 'other' || note.trim().length >= 3)))
    && (!needsServiceType || !!chosenService);

  const save = async () => {
    if (!canSave || !outcome) return;
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const patch: DrawOutcomePatch = {
        collection_at: existingCollectionAt || nowIso,
        draw_outcome: outcome,
        draw_failure_reason: outcome === 'unsuccessful' ? reason : null,
        draw_note: note.trim() || null,
        tube_count: tubeCount,
        ...(needsServiceType && chosenService ? { service_type: chosenService } : {}),
      };
      // Defense-in-depth (.select) so an RLS no-op can't look like success.
      // types.ts predates draw_outcome & co, hence the cast.
      const { data, error } = await (supabase as any)
        .from('appointments')
        .update({ ...patch, updated_at: nowIso })
        .eq('id', appointmentId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Couldn't save the outcome — your account may not have permission to update this visit.");
      }
      onSaved(patch);
      if (outcome === 'unsuccessful') {
        setSavedUnsuccessful(true);
        toast.success('Outcome saved. You can schedule a free redraw now.');
      } else {
        toast.success(`Draw done — ${DRAW_OUTCOME_LABELS[outcome]}`);
        onClose();
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save the draw outcome');
    } finally {
      setSaving(false);
    }
  };

  const scheduleRedraw = async () => {
    setSchedulingRedraw(true);
    try {
      const { data, error } = await (supabase as any).rpc('create_free_redraw', { p_original_id: appointmentId });
      if (error) throw error;
      setRedrawId(String(data));
      toast.success('Free redraw scheduled for tomorrow — the office will confirm the time with the patient.');
    } catch (e: any) {
      toast.error(e?.message || 'Could not schedule the redraw — ask the office to book it.');
    } finally {
      setSchedulingRedraw(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-sm mx-auto" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-[#B91C1C]" />
            Draw done
          </DialogTitle>
          <DialogDescription>
            {patientName} · how did the draw go? This stamps the collection time.
          </DialogDescription>
        </DialogHeader>

        {savedUnsuccessful ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-700">Unsuccessful draw recorded</p>
              <p className="text-sm text-red-800 mt-1">
                {reason ? DRAW_FAILURE_LABELS[reason] : 'No usable sample'}{note.trim() ? ` — ${note.trim()}` : ''}
              </p>
              <p className="text-xs text-red-700 mt-1">This visit does not count as a collection. No delivery is expected.</p>
            </div>
            {redrawId ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Free redraw booked ($0, same patient and address). It shows on tomorrow's schedule until the office confirms a time.</span>
              </div>
            ) : (
              <Button
                className="w-full h-14 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-2 text-base"
                disabled={schedulingRedraw}
                onClick={scheduleRedraw}
              >
                {schedulingRedraw ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarPlus className="h-5 w-5" />}
                Schedule a free redraw
              </Button>
            )}
            <Button variant="outline" className="w-full h-12" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {needsServiceType && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">Service type missing</p>
                <p className="text-xs text-amber-800">Pick what this visit was so we know whether a lab drop-off is expected.</p>
                <Select value={chosenService} onValueChange={setChosenService}>
                  <SelectTrigger className="h-12 bg-white"><SelectValue placeholder="Choose service type" /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_CHOICES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7C7E] mb-2">Outcome (required)</p>
              <div className="grid grid-cols-2 gap-2">
                {OUTCOMES.map(o => {
                  const active = outcome === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => { setOutcome(o.id); if (o.id !== 'unsuccessful') setReason(null); }}
                      className={cn(
                        'h-20 rounded-xl border-2 px-2 flex flex-col items-center justify-center gap-1 text-center transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                        active ? o.activeTone : o.tone,
                      )}
                    >
                      <o.icon className="h-5 w-5" />
                      <span className="text-xs font-semibold leading-tight">{DRAW_OUTCOME_LABELS[o.id]}</span>
                      <span className={cn('text-[10px] leading-tight', active ? 'opacity-90' : 'opacity-70')}>{o.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {outcome === 'unsuccessful' && (
              <div className="rounded-xl border border-[#EFE3E1] bg-[#FBF8F7] p-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7C7E]">Why? (required)</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(DRAW_FAILURE_LABELS) as DrawFailureReason[]).map(r => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={reason === r}
                      onClick={() => setReason(r)}
                      className={cn(
                        'h-12 rounded-lg border text-sm font-medium transition',
                        reason === r ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-800 border-gray-200',
                      )}
                    >
                      {DRAW_FAILURE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7C7E] mb-1">
                  Note {outcome === 'unsuccessful' && reason === 'other' ? '(required)' : '(optional)'}
                </p>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={outcome === 'unsuccessful' ? 'What happened?' : 'Anything the office should know'}
                  className="min-h-[48px] text-sm"
                  rows={2}
                />
              </div>
              <div className="w-24">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7C7E] mb-1">Tubes</p>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={60}
                  value={tubes}
                  onChange={(e) => setTubes(e.target.value)}
                  placeholder="—"
                  className="h-12 text-center text-base"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" className="h-12 flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button
                className="h-12 flex-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-2"
                disabled={!canSave || saving}
                onClick={save}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save outcome
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DrawOutcomeSheet;
