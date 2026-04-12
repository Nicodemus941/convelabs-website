
import React from 'react';
import { Tenant } from '@/types/tenant';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { UseFormReturn } from 'react-hook-form';

interface TenantDateTimeStepProps {
  tenant: Tenant;
  onPrevious?: () => void;
  onNext: () => void;
  form?: UseFormReturn<any>;
}

const TenantDateTimeStep: React.FC<TenantDateTimeStepProps> = ({ tenant, onPrevious, onNext, form }) => {
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const [time, setTime] = React.useState<string | null>(null);
  
  const times = [
    '9:00 AM',
    '10:00 AM',
    '11:00 AM',
    '1:00 PM',
    '2:00 PM',
    '3:00 PM',
    '4:00 PM',
  ];
  
  const handleDateSelect = (newDate: Date | undefined) => {
    setDate(newDate);
    // If form is provided, update the form values
    if (form) {
      form.setValue('date', newDate);
    }
  };

  const handleTimeSelect = (newTime: string) => {
    setTime(newTime);
    // If form is provided, update the form values
    if (form) {
      form.setValue('time', newTime);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex-1">
          <h3 className="font-medium mb-2">Select Date</h3>
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            className="border rounded-md p-3"
            disabled={(date) => date < new Date() || date > new Date(new Date().setMonth(new Date().getMonth() + 2))}
          />
        </div>
        
        <div className="flex-1">
          <h3 className="font-medium mb-2">Select Time</h3>
          <div className="grid grid-cols-2 gap-2">
            {times.map((t) => (
              <Button
                key={t}
                variant={time === t ? 'default' : 'outline'}
                className="justify-center"
                onClick={() => handleTimeSelect(t)}
                disabled={!date}
              >
                {t}
              </Button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="flex justify-between pt-4">
        {onPrevious && (
          <Button variant="outline" onClick={onPrevious}>
            Back
          </Button>
        )}
        <Button onClick={onNext} disabled={!date || !time} className={onPrevious ? "" : "ml-auto"}>
          Continue
        </Button>
      </div>
    </div>
  );
};

export default TenantDateTimeStep;
