import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { BookingFormValues } from '@/types/appointmentTypes';
import { FlaskConical, AlertTriangle } from 'lucide-react';

const LAB_DESTINATIONS = [
  { value: 'labcorp', label: 'LabCorp' },
  { value: 'quest', label: 'Quest Diagnostics' },
  { value: 'adventhealth', label: 'AdventHealth' },
  { value: 'orlando-health', label: 'Orlando Health' },
  { value: 'genova', label: 'Genova Diagnostics (ships)' },
];

const SHIPPING_DESTINATIONS = [
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
];

// Safety-valve value — admin follow-up, doesn't block checkout
const PENDING_VALUE = 'pending-doctor-confirmation';

interface LabDestinationSelectorProps {
  visitType: string;
}

/**
 * LAB DESTINATION SELECTOR — now required on mobile visits.
 *
 * Hormozi principle: "Friction at intake is paid once. Friction at fulfillment
 * is paid every time you deliver." Before today, this field was silently
 * dropped at checkout — 57/57 recent bookings had no destination, so every
 * phleb visit required an admin phone call or a guess.
 *
 * After today: required for mobile visits, with a 3rd-option safety valve
 * ("I'll confirm with my doctor — please call me") that flags an admin task
 * instead of blocking the checkout.
 */
const LabDestinationSelector: React.FC<LabDestinationSelectorProps> = ({ visitType }) => {
  const { control, watch } = useFormContext<BookingFormValues>();

  const isSpecialtyKit = visitType === 'specialty-kit' || visitType?.startsWith('specialty-kit');
  const destinations = isSpecialtyKit ? SHIPPING_DESTINATIONS : LAB_DESTINATIONS;
  const label = isSpecialtyKit ? 'Shipping Destination' : 'Where should we deliver your samples?';
  const placeholder = isSpecialtyKit ? 'Select shipping carrier' : 'Select a lab';

  const currentValue = watch('labOrder.labDestination' as any);
  const isPending = currentValue === PENDING_VALUE;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <label className="text-sm font-medium">
          {label} <span className="text-red-500" aria-hidden>*</span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {isSpecialtyKit
          ? 'Where should we ship your specialty kit samples?'
          : 'This tells your phlebotomist where to drop off your samples for processing. If you\'re not sure, pick the last option and we\'ll call you.'}
      </p>
      <FormField
        control={control}
        name={'labOrder.labDestination' as any}
        rules={{
          required: isSpecialtyKit
            ? 'Please pick a shipping carrier'
            : 'Please pick a lab — or the last option if you\'re not sure',
        }}
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Select value={field.value || ''} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((dest) => (
                    <SelectItem key={dest.value} value={dest.value}>
                      {dest.label}
                    </SelectItem>
                  ))}
                  {/* Safety-valve option — not available for specialty kits (carrier MUST be picked) */}
                  {!isSpecialtyKit && (
                    <SelectItem value={PENDING_VALUE}>
                      I'll confirm with my doctor — please call me
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {isPending && (
        <div className="flex items-start gap-2 text-xs p-2.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Got it — we'll call you within 1 business day to confirm which lab your doctor wants. Your appointment will be held.
          </span>
        </div>
      )}
    </div>
  );
};

export default LabDestinationSelector;
