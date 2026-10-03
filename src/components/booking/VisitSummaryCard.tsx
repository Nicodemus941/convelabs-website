import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Clock, Truck, BellRing, Sparkles, Sun } from 'lucide-react';
import { BookingFormValues } from '@/types/appointmentTypes';
import { getServiceById, getServicePrice, SURCHARGES } from '@/services/pricing/pricingService';
import { TRUST_CLAIMS } from '@/content/trustClaims';
import { VISIT_REASONS, getVisitReason } from '@/lib/visitReason';
import { SLOT_GUIDANCE_SUMMARY } from '@/lib/slotGuidance';
import { useFastingIntent } from '@/hooks/useFastingIntent';

/** Patient-facing names for the visit-type ids (mirrors VisitTypeSelector). */
const VISIT_NAMES: Record<string, string> = {
  mobile: 'Mobile blood draw — at your home or office',
  senior: 'Senior blood draw (65+) — at home',
  'in-office': 'Office visit — at our partner office',
  'specialty-kit': 'Specialty collection kit',
  'specialty-kit-genova': 'Genova Diagnostics kit',
  therapeutic: 'Therapeutic phlebotomy',
};

function visitName(id: string): string {
  if (VISIT_NAMES[id]) return VISIT_NAMES[id];
  if (id.startsWith('partner-')) {
    return 'Partner practice visit — ' + id.replace('partner-', '').split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
  }
  return getServiceById(id)?.name || 'Blood draw';
}

const LINES = [
  { icon: Clock,    text: TRUST_CLAIMS.drawTimeCard },
  { icon: Truck,    text: TRUST_CLAIMS.deliveredToShort },
  { icon: BellRing, text: TRUST_CLAIMS.notifiedCard },
];

/**
 * "Your visit" — stays with the patient through the booking steps.
 * Compact bar on mobile (visit + price + one claim), side card on desktop.
 * Reads the visit type from the form, the price from pricingService and the
 * reason echo from `cl_visit_reason`. Renders nothing until a visit type is set.
 */
const VisitSummaryCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { watch } = useFormContext<BookingFormValues>();
  const visitType = watch('serviceDetails.visitType') || '';
  // Premium-hours slot picked (set by DateTimeSelectionStep). The card prices
  // the non-member visit, so the fee line reads the same way: shown with its
  // member waiver. Same-day / after-hours slots never set this flag.
  const premiumHours = !!watch('serviceDetails.premiumHours');
  const afterHours = !!watch('serviceDetails.extendedHours');
  const fastingLine = SLOT_GUIDANCE_SUMMARY[useFastingIntent()];
  if (!visitType) return null;

  const price = getServicePrice(visitType, 'none');
  // One timing fee per visit: after-hours outranks premium (bookingWindows.ts).
  const premiumLine = afterHours
    ? `After hours +$${SURCHARGES.extendedHours.amount}`
    : premiumHours
    ? `Premium hours +$${SURCHARGES.premiumHours.amount} · Free for members`
    : null;
  const name = visitName(visitType);
  const reason = getVisitReason();
  const echo = reason ? VISIT_REASONS[reason].echo : null;

  return (
    <aside className={className} aria-label="Your visit">
      {/* Mobile: compact bar */}
      <div className="lg:hidden rounded-xl border border-brand-cream-warm bg-white px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-brand-gray-warm">Your visit</p>
            <p className="text-sm font-semibold text-conve-black truncate">{name}</p>
          </div>
          <p className="text-conve-red font-bold text-lg whitespace-nowrap">${price}</p>
        </div>
        <p className="mt-1 text-xs text-brand-gray-warm leading-snug">
          {TRUST_CLAIMS.drawTimeCard}{' · '}{TRUST_CLAIMS.deliveredToShort}
        </p>
        {fastingLine && <p className="mt-0.5 text-xs font-medium text-conve-black">{fastingLine}</p>}
        {premiumLine && <p className="mt-0.5 text-xs font-medium text-amber-800">{premiumLine}</p>}
        {echo && <p className="mt-0.5 text-xs text-conve-black leading-snug">{echo}</p>}
      </div>

      {/* Desktop: side card */}
      <div className="hidden lg:block rounded-2xl border border-brand-cream-warm bg-white p-5 shadow-sm">
        <p className="text-[10px] uppercase tracking-[0.18em] text-brand-gray-warm">Your visit</p>
        <p className="mt-1 font-semibold text-conve-black leading-snug">{name}</p>
        <p className="mt-1 text-conve-red font-bold text-2xl">${price}<span className="text-xs font-normal text-brand-gray-warm"> / visit</span></p>
        {fastingLine && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-cream px-2.5 py-1 text-xs font-medium text-conve-black">
            <Sun className="h-3.5 w-3.5 text-brand-gold-deep" aria-hidden="true" />{fastingLine}
          </p>
        )}
        {premiumLine && (
          <p className="mt-2 text-xs font-medium text-amber-800">{premiumLine}</p>
        )}
        <ul className="mt-4 space-y-2.5">
          {LINES.map(({ icon: I, text }) => (
            <li key={text} className="flex items-start gap-2 text-sm text-brand-charcoal">
              <I className="h-4 w-4 text-conve-red flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        {echo && (
          <p className="mt-4 pt-3 border-t border-brand-cream-warm flex items-start gap-2 text-sm text-conve-black">
            <Sparkles className="h-4 w-4 text-brand-gold-deep flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{echo}</span>
          </p>
        )}
      </div>
    </aside>
  );
};

export default VisitSummaryCard;
