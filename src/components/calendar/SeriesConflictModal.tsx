import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Calendar, SkipForward, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Conflict } from '@/lib/seriesConflicts';

/**
 * SERIES CONFLICT MODAL
 *
 * Shown when the admin recurring scheduler detects one or more proposed
 * dates that can't be booked as-is (holiday, office closure, existing
 * appointment, or active slot hold). For each conflict, admin either:
 *
 *   - Picks an alternative time on the SAME date (if any are free)
 *   - Skips this date entirely (series goes 1-shorter)
 *
 * Only after every conflict has a resolution does the Continue button
 * activate. Hormozi's "show the problem + fix in one breath" principle.
 */

export type Resolution =
  | { type: 'keep'; dateIso: string; time: string; sequence: number }    // original slot (no conflict)
  | { type: 'reschedule'; dateIso: string; time: string; sequence: number }  // new time, same date
  | { type: 'skip'; dateIso: string; sequence: number };                 // skip this date entirely

interface Props {
  open: boolean;
  onClose: () => void;
  conflicts: Conflict[];
  originalSlots: { dateIso: string; time: string; sequence: number }[];
  onResolve: (resolutions: Resolution[]) => void;
}

const SeriesConflictModal: React.FC<Props> = ({ open, onClose, conflicts, originalSlots, onResolve }) => {
  // resolution state keyed by "sequence" number
  const [decisions, setDecisions] = useState<Record<number, { type: 'reschedule' | 'skip'; time?: string } | undefined>>({});

  const allResolved = conflicts.every(c => {
    const d = decisions[c.sequence];
    if (!d) return false;
    if (d.type === 'skip') return true;
    if (d.type === 'reschedule') return !!d.time;
    return false;
  });

  const handleContinue = () => {
    // Build resolutions for ALL original slots (conflicting + non-conflicting)
    const byDate = new Map(conflicts.map(c => [c.sequence, c]));
    const resolutions: Resolution[] = originalSlots.map(s => {
      if (!byDate.has(s.sequence)) {
        return { type: 'keep', dateIso: s.dateIso, time: s.time, sequence: s.sequence };
      }
      const d = decisions[s.sequence];
      if (!d) {
        // shouldn't happen if allResolved is true
        return { type: 'skip', dateIso: s.dateIso, sequence: s.sequence };
      }
      if (d.type === 'skip') {
        return { type: 'skip', dateIso: s.dateIso, sequence: s.sequence };
      }
      return { type: 'reschedule', dateIso: s.dateIso, time: d.time!, sequence: s.sequence };
    });
    onResolve(resolutions);
  };

  const prettyDate = (dateIso: string) => {
    try {
      return format(new Date(dateIso + 'T12:00:00'), 'EEE, MMM d, yyyy');
    } catch {
      return dateIso;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-[95vw] p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-4 flex-shrink-0">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              {conflicts.length} slot{conflicts.length !== 1 ? 's' : ''} need{conflicts.length === 1 ? 's' : ''} your attention
            </DialogTitle>
            <DialogDescription className="text-xs text-amber-900">
              Fix each one below — pick an alternative time OR skip that date. We'll create the rest as planned.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {conflicts.map(c => {
            const chosen = decisions[c.sequence];
            return (
              <div
                key={c.sequence}
                className={`border rounded-lg p-3 ${
                  chosen ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      Visit #{c.sequence} · {prettyDate(c.dateIso)}
                    </p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      <span className="line-through">{c.time}</span> · {c.reasonLabel}
                    </p>
                  </div>
                  {chosen && <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />}
                </div>

                {/* Alt slots or skip-only (holiday / office closure) */}
                {c.altSlots.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">Pick a different time for this date</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {c.altSlots.map(alt => {
                        const selected = chosen?.type === 'reschedule' && chosen.time === alt;
                        return (
                          <button
                            key={alt}
                            type="button"
                            onClick={() => setDecisions(d => ({ ...d, [c.sequence]: { type: 'reschedule', time: alt } }))}
                            className={`text-xs py-1.5 px-2 rounded border transition ${
                              selected
                                ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-[#B91C1C]'
                            }`}
                          >
                            {alt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {c.altSlots.length === 0 && (
                  <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2.5 py-1.5 mb-2">
                    No alternative times available on this date — skipping is the only option.
                  </p>
                )}

                {/* Skip button */}
                <button
                  type="button"
                  onClick={() => setDecisions(d => ({ ...d, [c.sequence]: { type: 'skip' } }))}
                  className={`w-full text-xs py-1.5 rounded border transition flex items-center justify-center gap-1.5 ${
                    chosen?.type === 'skip'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <SkipForward className="h-3 w-3" />
                  Skip this date — don't book it
                </button>
              </div>
            );
          })}
        </div>

        <div className="border-t px-5 py-3 bg-white flex-shrink-0 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel series</Button>
          <Button
            className="flex-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white h-10"
            disabled={!allResolved}
            onClick={handleContinue}
          >
            {allResolved
              ? `Create series with these changes`
              : `Resolve ${conflicts.length - Object.keys(decisions).filter(k => decisions[parseInt(k)]).length} more`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SeriesConflictModal;
