import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface RecurringBookingSetupProps {
  serviceType: string;
  preferredDay?: number;
  preferredTime?: string;
  preferredAddress?: string;
  preferredCity?: string;
  preferredState?: string;
  preferredZip?: string;
}

const FREQUENCY_OPTIONS = [
  { value: '1', label: 'Every week' },
  { value: '2', label: 'Every 2 weeks' },
  { value: '4', label: 'Every month' },
  { value: '8', label: 'Every 2 months' },
  { value: '12', label: 'Every 3 months' },
  { value: '26', label: 'Every 6 months' },
];

const RecurringBookingSetup: React.FC<RecurringBookingSetupProps> = ({
  serviceType,
  preferredDay,
  preferredTime,
  preferredAddress,
  preferredCity,
  preferredState,
  preferredZip,
}) => {
  const { user } = useAuth();
  const [frequency, setFrequency] = useState('4');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSetup, setIsSetup] = useState(false);

  if (!user || isSetup) {
    if (isSetup) {
      return (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4 flex items-center gap-3">
            <Check className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-900">Recurring booking set up!</p>
              <p className="text-sm text-green-700">We'll auto-schedule your next draw. You can manage this from your dashboard.</p>
            </div>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  const handleSetup = async () => {
    setIsSubmitting(true);

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + parseInt(frequency) * 7);

    const { error } = await supabase.from('recurring_bookings').insert([{
      patient_id: user.id,
      service_type: serviceType,
      frequency_weeks: parseInt(frequency),
      preferred_day_of_week: preferredDay,
      preferred_time: preferredTime,
      preferred_address: preferredAddress,
      preferred_city: preferredCity,
      preferred_state: preferredState || 'FL',
      preferred_zip: preferredZip,
      next_booking_date: nextDate.toISOString().split('T')[0],
      is_active: true,
    }]);

    if (error) {
      console.error('Error setting up recurring booking:', error);
      toast.error('Failed to set up recurring booking');
    } else {
      setIsSetup(true);
      toast.success('Recurring booking set up!');
    }
    setIsSubmitting(false);
  };

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-blue-900">
          <CalendarClock className="h-5 w-5" />
          Schedule Recurring Draws
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-blue-700">
          Need regular blood work? We'll auto-schedule your next appointment.
        </p>
        <div className="flex items-center gap-3">
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger className="w-[200px] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleSetup}
            disabled={isSubmitting}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? 'Setting up...' : 'Enable'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RecurringBookingSetup;
