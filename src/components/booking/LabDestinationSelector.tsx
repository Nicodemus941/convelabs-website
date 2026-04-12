import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { BookingFormValues } from '@/types/appointmentTypes';
import { FlaskConical } from 'lucide-react';

const LAB_DESTINATIONS = [
  { value: 'labcorp', label: 'LabCorp' },
  { value: 'quest', label: 'Quest Diagnostics' },
  { value: 'adventhealth', label: 'AdventHealth' },
  { value: 'orlando-health', label: 'Orlando Health' },
];

const SHIPPING_DESTINATIONS = [
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
];

interface LabDestinationSelectorProps {
  visitType: string;
}

const LabDestinationSelector: React.FC<LabDestinationSelectorProps> = ({ visitType }) => {
  const { control } = useFormContext<BookingFormValues>();

  const isSpecialtyKit = visitType === 'specialty-kit';
  const destinations = isSpecialtyKit ? SHIPPING_DESTINATIONS : LAB_DESTINATIONS;
  const label = isSpecialtyKit ? 'Shipping Destination' : 'Lab Destination';
  const placeholder = isSpecialtyKit ? 'Select shipping carrier' : 'Select a lab';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <label className="text-sm font-medium">{label}</label>
      </div>
      <p className="text-xs text-muted-foreground">
        {isSpecialtyKit
          ? 'Where should we ship your specialty kit samples?'
          : 'Where should we deliver your samples for processing?'}
      </p>
      <FormField
        control={control}
        name="labOrder.labDestination"
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
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

export default LabDestinationSelector;
