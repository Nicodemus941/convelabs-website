import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, CalendarClock } from 'lucide-react';

/**
 * ServiceAutoSwitchModal
 *
 * Fires when OCR of the uploaded lab order contradicts the service the
 * patient selected (Layer 2 of the fasting-gaming gap fix, per the
 * master plan):
 *   - selected Fasting, OCR says no fasting required → switch to Routine
 *   - selected Routine, OCR says fasting required    → switch to Fasting
 *
 * The modal explains the switch in warm language ("our OCR read your
 * order — here's what it found"), tells the patient we adjusted their
 * service, and sends them back to re-pick a time slot that fits the
 * new service's scheduling window.
 *
 * We ALWAYS clear the previously-picked date + slot on switch — cleanest
 * path, avoids "wait, was my 7 AM still valid?" ambiguity.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onGoBackToSchedule: () => void;
  fromService: string;          // display name of old service
  toService: string;            // display name of new service
  fastingDetected: boolean;     // what OCR concluded
  panels: string[];             // lab panels OCR found (for evidence)
  patientFirstName?: string;
}

const prettyService = (slug: string): string => {
  const map: Record<string, string> = {
    'fasting-blood-draw': 'Fasting Blood Draw',
    'routine-blood-draw': 'Routine Blood Draw',
  };
  return map[slug] || slug;
};

const ServiceAutoSwitchModal: React.FC<Props> = ({
  open,
  onClose,
  onGoBackToSchedule,
  fromService,
  toService,
  fastingDetected,
  panels,
  patientFirstName,
}) => {
  const topPanels = panels.slice(0, 4);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            We updated your service
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-gray-700 leading-relaxed">
            {patientFirstName ? `Hi ${patientFirstName} — ` : ''}our OCR just read your lab order.
            Based on what your provider ordered, we{' '}
            <span className="font-semibold">
              {fastingDetected ? 'detected a fasting requirement' : 'did not detect any fasting requirement'}
            </span>
            , so we swapped your service to the right one.
          </p>

          {/* Switch visual */}
          <div className="flex items-center justify-center gap-3 bg-gradient-to-r from-gray-50 to-indigo-50 border border-gray-200 rounded-lg py-3 px-4">
            <div className="text-center flex-1">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">From</div>
              <div className="font-medium text-gray-700 text-sm mt-0.5 line-through">
                {prettyService(fromService)}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <div className="text-center flex-1">
              <div className="text-[10px] uppercase tracking-wider text-indigo-600 font-semibold">To</div>
              <div className="font-semibold text-indigo-700 text-sm mt-0.5">
                {prettyService(toService)}
              </div>
            </div>
          </div>

          {/* Evidence */}
          {topPanels.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">
                Panels detected on your order
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topPanels.map((p) => (
                  <span
                    key={p}
                    className="text-[11px] bg-white border border-gray-300 text-gray-700 px-2 py-0.5 rounded-full"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* What to do next */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2.5">
            <CalendarClock className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold">Please pick a new time slot.</span>{' '}
              {toService === 'fasting-blood-draw'
                ? 'Fasting draws have different windows (members unlock more). Click below to choose.'
                : 'Routine draws use the standard scheduling window. Click below to choose.'}
            </div>
          </div>

          <p className="text-[11px] text-gray-400 italic">
            Think our OCR read your order wrong? Email info@convelabs.com and we'll take a look.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-initial">
            Keep my original choice
          </Button>
          <Button
            onClick={onGoBackToSchedule}
            className="bg-conve-red hover:bg-conve-red-dark text-white flex-1 sm:flex-initial"
          >
            Pick new time slot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceAutoSwitchModal;
