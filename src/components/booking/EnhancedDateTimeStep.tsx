import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SmartDateTimePicker from '@/components/calendar/SmartDateTimePicker';
import { BookingFormValues } from '@/types/appointmentTypes';

interface EnhancedDateTimeStepProps {
  onNext: () => void;
  onBack: () => void;
  zipCode?: string;
  serviceDuration?: number;
  isMember?: boolean;
  isVipMember?: boolean;
}

const EnhancedDateTimeStep: React.FC<EnhancedDateTimeStepProps> = ({
  onNext,
  onBack,
  zipCode,
  serviceDuration = 30,
  isMember = true,
  isVipMember = false
}) => {
  const methods = useFormContext<BookingFormValues>();
  const selectedDate = methods.watch('date');
  const selectedTime = methods.watch('time');

  const handleDateSelect = (date: Date) => {
    methods.setValue('date', date);
    // Clear time when date changes
    methods.setValue('time', undefined);
  };

  const handleTimeSelect = (time: string) => {
    methods.setValue('time', time);
  };

  const canContinue = selectedDate && selectedTime;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Date & Time</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <SmartDateTimePicker
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          onDateSelect={handleDateSelect}
          onTimeSelect={handleTimeSelect}
          zipCode={zipCode}
          serviceDuration={serviceDuration}
          isMember={isMember}
          isVipMember={isVipMember}
        />
        
        <div className="flex justify-between pt-4">
          <Button type="button" variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button 
            type="button" 
            onClick={onNext}
            disabled={!canContinue}
          >
            Continue <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnhancedDateTimeStep;