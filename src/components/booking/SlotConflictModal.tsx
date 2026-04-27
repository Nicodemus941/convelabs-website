/**
 * SlotConflictModal
 *
 * Surfaces when create-appointment-checkout returns 409 slot_unavailable.
 * Hormozi UX:
 *   - Apology owns the moment ("Sorry — that slot was claimed in the last minute")
 *   - Shows the patient's data is preserved (address, lab order, total)
 *   - Three closest-time alternatives in a tap-friendly grid (not a forced pick)
 *   - "Lock this in" CTA copy on each alternative (urgency, not bureaucracy)
 *   - Waitlist fallback for the EXACT slot they originally wanted
 *   - VIP nudge ONLY for non-members (priority-booking value prop)
 */

import React, { useState } from 'react';
import { AlertCircle, Crown, CheckCircle2, Loader2, X } from 'lucide-react';
import JoinWaitlistButton from './JoinWaitlistButton';

interface Props {
  open: boolean;
  originalDate: string;          // "2026-04-27"
  originalTime: string;          // "11:30 AM"
  suggestedSlots: { time: string }[];
  isMember: boolean;             // hide VIP nudge for existing members
  retrying: boolean;             // true while the new-time checkout is in flight
  patientEmail?: string;
  patientPhone?: string;
  patientName?: string;
  onPickAlternative: (time: string) => void; // updates form + retries checkout
  onClose: () => void;
}

const SlotConflictModal: React.FC<Props> = ({
  open, originalDate, originalTime, suggestedSlots,
  isMember, retrying, patientEmail, patientPhone, patientName,
  onPickAlternative, onClose,
}) => {
  const [picked, setPicked] = useState<string | null>(null);
  if (!open) return null;

  const niceDate = (() => {
    try { return new Date(originalDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
    catch { return originalDate; }
  })();

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 sm:px-4" onClick={() => !retrying && onClose()}>
      <div className="relative max-w-lg w-full bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-4 rounded-t-2xl sm:rounded-t-2xl flex items-start gap-3">
          <AlertCircle className="h-6 w-6 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg leading-tight">That slot was just claimed</h2>
            <p className="text-amber-50 text-sm leading-snug mt-0.5">
              Sorry — someone booked <strong>{originalTime}</strong> on {niceDate} in the last minute.
            </p>
          </div>
          {!retrying && (
            <button onClick={onClose} className="text-white/80 hover:text-white flex-shrink-0" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Reassurance — preserved data */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-900 leading-snug">
              <strong>Your address, lab order, and total are saved.</strong> Just pick a new time below — we'll get you booked in 30 seconds.
            </p>
          </div>

          {/* Suggestions */}
          {suggestedSlots.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">Closest open times that day:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {suggestedSlots.map(s => {
                  const isPicked = picked === s.time;
                  const showSpinner = retrying && isPicked;
                  return (
                    <button
                      key={s.time}
                      type="button"
                      disabled={retrying}
                      onClick={() => { setPicked(s.time); onPickAlternative(s.time); }}
                      className={`relative rounded-lg border-2 px-3 py-3 text-center min-h-[60px] transition active:scale-[0.98] ${
                        isPicked
                          ? 'bg-conve-red border-conve-red text-white shadow-md'
                          : 'bg-white border-gray-300 hover:border-conve-red hover:bg-rose-50 text-gray-900'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className="text-base font-bold">{s.time}</div>
                      <div className={`text-[10px] mt-0.5 ${isPicked ? 'text-rose-100' : 'text-gray-500'}`}>
                        {showSpinner ? 'Locking in…' : 'Lock this in'}
                      </div>
                      {showSpinner && (
                        <Loader2 className="absolute top-2 right-2 h-3.5 w-3.5 animate-spin" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700 leading-snug">
              No other times are open on {niceDate}. Pick a different day, or join the waitlist below — we'll text you the moment a slot opens.
            </p>
          )}

          {/* VIP nudge — only for non-members. Contextual upsell at peak emotional moment. */}
          {!isMember && (
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-lg p-3">
              <div className="flex items-start gap-2.5">
                <Crown className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-900">VIP members get priority booking — never get bumped.</p>
                  <p className="text-xs text-amber-800 leading-snug mt-1">
                    $199/yr locks $115 per visit (vs. $150) and gives you the after-hours slots first. <a href="/pricing" className="underline font-semibold">See VIP →</a>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Waitlist fallback — for the EXACT slot they originally wanted */}
          <div className="border-t pt-3">
            <p className="text-sm font-medium text-gray-900 mb-1">Want your original time, {originalTime}?</p>
            <p className="text-xs text-gray-600 mb-2 leading-snug">
              We'll text + email you if it opens up — at 5 PM the day before, before the public sees it.
            </p>
            <JoinWaitlistButton
              dateIso={originalDate}
              desiredTime={originalTime}
              defaultEmail={patientEmail}
              defaultPhone={patientPhone}
              defaultName={patientName}
              variant="subtle"
            />
          </div>

          {/* Plain dismiss */}
          {!retrying && (
            <button
              onClick={onClose}
              className="w-full text-xs text-gray-500 hover:text-gray-800 py-2"
            >
              Or close this — pick a different day above
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SlotConflictModal;
