import React from 'react';
import { useFormContext } from 'react-hook-form';
import { DollarSign } from 'lucide-react';
import { BookingFormValues } from '@/types/appointmentTypes';
import { calculateTotal, isExtendedArea } from '@/services/pricing/pricingService';

const PriceEstimateBadge: React.FC = () => {
  const { watch } = useFormContext<BookingFormValues>();
  const visitType = watch('serviceDetails.visitType');
  const sameDay = watch('serviceDetails.sameDay');
  const weekend = watch('serviceDetails.weekend');
  const city = watch('locationDetails.city') || '';
  const additionalPatients = watch('additionalPatients') || [];

  if (!visitType) return null;

  const breakdown = calculateTotal(visitType, { sameDay, weekend, extendedArea: isExtendedArea(city) }, 0, additionalPatients.length);

  return (
    <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
      <DollarSign className="h-3.5 w-3.5" />
      Est. ${breakdown.subtotal.toFixed(0)}
    </div>
  );
};

export default PriceEstimateBadge;
