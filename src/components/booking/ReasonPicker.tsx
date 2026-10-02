import React, { useState } from 'react';
import { Check } from 'lucide-react';
import {
  VISIT_REASONS, VISIT_REASON_IDS, VisitReasonId, getVisitReason, setVisitReason,
} from '@/lib/visitReason';

interface ReasonPickerProps {
  /** Called after the reason is persisted. `null` when the patient deselects. */
  onSelect?: (reason: VisitReasonId | null) => void;
  /** Tighter spacing for the booking flow; the landing page uses the default. */
  compact?: boolean;
  className?: string;
}

/**
 * "What brings you here?" — 4–6 single-select chips. Optional: nothing is
 * gated on it. Shared by the Meta landing page and the booking flow's first
 * step so both write the same `cl_visit_reason` key.
 */
const ReasonPicker: React.FC<ReasonPickerProps> = ({ onSelect, compact = false, className = '' }) => {
  const [selected, setSelected] = useState<VisitReasonId | null>(() => getVisitReason());

  const choose = (id: VisitReasonId) => {
    const next = selected === id ? null : id;
    setSelected(next);
    setVisitReason(next);
    onSelect?.(next);
  };

  return (
    <div className={className}>
      <p className={`font-semibold text-conve-black ${compact ? 'text-sm' : 'text-base'}`}>
        What brings you here? <span className="font-normal text-brand-gray-warm">(optional)</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="What brings you here?">
        {VISIT_REASON_IDS.map((id) => {
          const active = selected === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => choose(id)}
              className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 min-h-[40px] text-sm font-medium transition-colors active:scale-[0.98] ${
                active
                  ? 'border-conve-red bg-conve-red text-white'
                  : 'border-brand-cream-warm bg-white text-conve-black hover:border-conve-red/50'
              }`}
            >
              {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              {VISIT_REASONS[id].label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReasonPicker;
