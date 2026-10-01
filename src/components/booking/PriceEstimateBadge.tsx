import React from 'react';
import { useFormContext } from 'react-hook-form';
import { DollarSign, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BookingFormValues } from '@/types/appointmentTypes';
import { calculateTotal, isExtendedArea } from '@/services/pricing/pricingService';

/**
 * The running estimate in the step bar — and, on tap, what it is made of.
 *
 * It used to be a bare total. A patient who picked the $150 visit and then a
 * Saturday saw "Est. $225" with nothing to say why, which reads as an
 * overcharge (owner report, 2026-10-01). Every fee now shows by name.
 */
const PriceEstimateBadge: React.FC = () => {
  const { watch } = useFormContext<BookingFormValues>();
  const visitType = watch('serviceDetails.visitType');
  const sameDay = watch('serviceDetails.sameDay');
  const weekend = watch('serviceDetails.weekend');
  const extendedHours = watch('serviceDetails.extendedHours' as any) as boolean | undefined;
  const city = watch('locationDetails.city') || '';
  const zip = watch('locationDetails.zipCode') || '';
  const additionalPatients = watch('additionalPatients') || [];

  if (!visitType) return null;

  const breakdown = calculateTotal(
    visitType,
    { sameDay, weekend, extendedHours: !!extendedHours, extendedArea: isExtendedArea(city, zip) },
    0,
    additionalPatients.length,
  );
  const fees = breakdown.surcharges.filter((s) => s.amount !== 0 || /free/i.test(s.label));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-800 px-3 py-1 rounded-full text-sm font-medium hover:bg-green-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
          aria-label={`Estimated price $${breakdown.subtotal.toFixed(0)}. Show what's included.`}
        >
          <DollarSign className="h-3.5 w-3.5" />
          Est. ${breakdown.subtotal.toFixed(0)}
          {fees.length > 0 && <ChevronDown className="h-3.5 w-3.5 opacity-70" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your estimate</p>
        <div className="flex justify-between gap-3">
          <span>Visit</span>
          <span className="tabular-nums">${breakdown.servicePrice.toFixed(0)}</span>
        </div>
        {fees.map((f) => (
          <div key={f.label} className="mt-1 flex justify-between gap-3">
            <span className="text-muted-foreground">{f.label}</span>
            <span className="tabular-nums">{f.amount === 0 ? 'Free' : `+$${f.amount.toFixed(0)}`}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between gap-3 border-t pt-2 font-semibold">
          <span>Estimated total</span>
          <span className="tabular-nums">${breakdown.subtotal.toFixed(0)}</span>
        </div>
        {fees.length > 0 && (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Weekend and same-day fees don't apply on a weekday booked a day or more ahead.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default PriceEstimateBadge;
