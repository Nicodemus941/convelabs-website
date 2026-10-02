/**
 * BookingDraftConsent — the one consent line on the Patient Info step.
 *
 * Ticking it is the explicit SMS opt-in for the abandoned-booking nudges
 * (TCPA: clear, unchecked by default, says who / how many / how to stop).
 * Email recovery is transactional and does not need it; the helper text
 * says so, so the patient knows what happens either way.
 *
 * Writes `draftSmsConsent` on the booking form (outside the zod schema, like
 * labOrder.uploadedPaths). useBookingDraft reads it on every save.
 */
import React from 'react';
import { useFormContext } from 'react-hook-form';
import { MessageSquareText } from 'lucide-react';
import { SMS_CONSENT_FIELD } from '@/lib/bookingDraft';

const BookingDraftConsent: React.FC = () => {
  const { watch, setValue } = useFormContext();
  const checked = !!watch(SMS_CONSENT_FIELD as any);
  const phone = String(watch('patientDetails.phone') || '').replace(/\D/g, '');
  const hasPhone = phone.length >= 10;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/70 px-3.5 py-3">
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-conve-red flex-shrink-0"
          checked={checked}
          onChange={(e) => setValue(SMS_CONSENT_FIELD as any, e.target.checked, { shouldDirty: true })}
          aria-describedby="booking-draft-consent-help"
        />
        <span className="min-w-0">
          <span className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
            <MessageSquareText className="h-3.5 w-3.5 text-conve-red" aria-hidden="true" />
            Text me a link to finish booking if I get interrupted
          </span>
          <span id="booking-draft-consent-help" className="block text-[11px] leading-relaxed text-muted-foreground mt-1">
            Up to 3 texts from ConveLabs. Msg &amp; data rates may apply. Reply STOP to opt out.
            {hasPhone ? '' : ' Needs a phone number above.'}
            {' '}Left unchecked, we only email a link to pick up where you left off.
          </span>
        </span>
      </label>
    </div>
  );
};

export default BookingDraftConsent;
