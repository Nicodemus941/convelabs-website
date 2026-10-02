import { useFormContext } from 'react-hook-form';
import { BookingFormValues } from '@/types/appointmentTypes';
import { FastingIntent, resolveFastingIntent } from '@/lib/slotGuidance';
import { getVisitReason } from '@/lib/visitReason';

/**
 * Fasting intent for the current booking, from (in priority order) the
 * selected service, the explicit fasting flag, and the landing-page reason.
 * Safe outside a FormProvider (falls back to the reason alone).
 */
export function useFastingIntent(): FastingIntent {
  const ctx = useFormContext<BookingFormValues>();
  const selectedService = ctx ? ctx.watch('serviceDetails.selectedService') : null;
  const fastingField = ctx ? ctx.watch('serviceDetails.fasting') : null;
  return resolveFastingIntent({ selectedService, fastingField, reason: getVisitReason() });
}
