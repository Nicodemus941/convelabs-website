import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Utensils, Droplet, Clock, Heart, FileText, Sparkles } from 'lucide-react';
import type { PrepAnalysis, PrepRequirement } from '@/lib/phlebHelpers';

/**
 * LAB ORDER PREP MODAL — the "we read your lab order" moment.
 *
 * Fires immediately after a patient uploads their lab order during booking.
 * The upload triggers OCR, and if fasting / urine / glucose-tolerance panels
 * are detected, this modal congratulates them, shows that we actually read
 * the order, and tells them EXACTLY what to do to prepare.
 *
 * Hormozi principle: "Show your work. Don't do the value silently." A patient
 * who sees the AI read their order + give personalized instructions feels the
 * concierge service — that's the moment that justifies the $150 price tag
 * vs $30 at LabCorp.
 *
 * Also serves as the legal paper-trail that the patient was notified of
 * fasting requirements in writing.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  analysis: PrepAnalysis | null;
  patientFirstName?: string;
}

function iconFor(type: PrepRequirement['icon']) {
  switch (type) {
    case 'fasting':  return <Utensils className="h-4 w-4 text-amber-600" />;
    case 'urine':    return <Droplet className="h-4 w-4 text-blue-600" />;
    case 'glucose':  return <Clock className="h-4 w-4 text-purple-600" />;
    case 'hydrate':  return <Heart className="h-4 w-4 text-emerald-600" />;
    case 'timing':   return <Clock className="h-4 w-4 text-gray-600" />;
    default:         return <FileText className="h-4 w-4 text-gray-600" />;
  }
}

function bgFor(type: PrepRequirement['icon']) {
  switch (type) {
    case 'fasting':  return 'bg-amber-50 border-amber-200';
    case 'urine':    return 'bg-blue-50 border-blue-200';
    case 'glucose':  return 'bg-purple-50 border-purple-200';
    case 'hydrate':  return 'bg-emerald-50 border-emerald-200';
    default:         return 'bg-gray-50 border-gray-200';
  }
}

const LabOrderPrepModal: React.FC<Props> = ({ open, onClose, analysis, patientFirstName }) => {
  if (!analysis) return null;
  const first = patientFirstName?.split(' ')[0] || 'there';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-[95vw] p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Hero */}
        <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white px-6 py-6 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs uppercase tracking-wider font-semibold opacity-90">AI-Powered Prep</span>
          </div>
          <DialogTitle className="text-xl font-bold leading-tight">
            Thanks, {first} — we read your lab order.
          </DialogTitle>
          <DialogDescription className="text-sm text-white/85 mt-2 leading-relaxed">
            Your phlebotomist already knows what tests your doctor ordered. Here's
            exactly how to prepare for a smooth visit.
          </DialogDescription>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-3 overflow-y-auto flex-1">
          {analysis.detectedPanels.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-gray-700 pb-3 border-b">
              <FileText className="h-3.5 w-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 mb-1">We detected these tests:</p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.detectedPanels.map((p) => (
                    <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 border">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {analysis.requirements.map((req) => (
            <div key={req.key} className={`border rounded-lg p-3 ${bgFor(req.icon)}`}>
              <div className="flex items-start gap-2.5 mb-1.5">
                <div className="flex-shrink-0 mt-0.5">{iconFor(req.icon)}</div>
                <h3 className="text-sm font-bold text-gray-900 leading-tight">{req.title}</h3>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed pl-6">{req.body}</p>
            </div>
          ))}

          <div className="text-xs text-gray-500 leading-relaxed pt-1">
            💡 <strong>You'll also get an email</strong> with this same prep checklist so you can reference it closer to your visit.
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 bg-gray-50 flex-shrink-0">
          <Button
            className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-10"
            onClick={onClose}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Got it — continue booking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LabOrderPrepModal;
