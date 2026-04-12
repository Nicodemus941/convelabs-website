import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, addDays, startOfDay, isBefore, isAfter } from 'date-fns';
import { CalendarIcon, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { getAvailability, TimeSlot } from '@/services/ghsBookingService';

interface SmartDateTimePickerProps {
  selectedDate?: Date;
  selectedTime?: string;
  onDateSelect: (date: Date) => void;
  onTimeSelect: (time: string) => void;
  onSlotSelect?: (slot: TimeSlot) => void;
  zipCode?: string;
  serviceDuration?: number;
  isMember?: boolean;
  isVipMember?: boolean;
  className?: string;
}

const SmartDateTimePicker: React.FC<SmartDateTimePickerProps> = ({
  selectedDate,
  selectedTime,
  onDateSelect,
  onTimeSelect,
  onSlotSelect,
  zipCode,
  serviceDuration = 60,
  isMember = true,
  isVipMember = false,
  className
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const today = startOfDay(new Date());
  const maxDate = addDays(today, 60);

  // Fetch availability for the selected date from GHS API
  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;

  // Parse "H:MM AM" or "HH:MM AM" to minutes since midnight for sorting
  const parseTimeToMinutes = (time: string): number => {
    const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return 0;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === 'AM' && hours === 12) hours = 0;
    if (period === 'PM' && hours !== 12) hours += 12;
    return hours * 60 + minutes;
  };

  const [isEstimatedAvailability, setIsEstimatedAvailability] = useState(false);

  const { data: slotsForSelectedDate = [], isLoading: slotsLoading } = useQuery({
    queryKey: ['ghs-availability', zipCode, serviceDuration, selectedDateStr],
    queryFn: async () => {
      if (!zipCode || !selectedDateStr) return [];
      const response = await getAvailability(zipCode, 'blood_draw', selectedDateStr, selectedDateStr, serviceDuration);
      setIsEstimatedAvailability(!!(response as any)?.isEstimatedAvailability);
      const allSlots = response?.slots || [];
      // Filter to selected date and sort chronologically
      return allSlots
        .filter(slot => slot.date === selectedDateStr)
        .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
    },
    enabled: !!zipCode && !!selectedDateStr,
    staleTime: 30000,
  });

  // Check if a date should be disabled
  const isDateDisabled = (date: Date): boolean => {
    if (isBefore(date, today)) return true;
    if (isAfter(date, maxDate)) return true;
    
    // For non-members, only allow Monday-Wednesday
    if (!isMember) {
      const dayOfWeek = date.getDay();
      if (dayOfWeek < 1 || dayOfWeek > 3) return true;
    }
    
    return false;
  };

  const handleDateSelect = (date: Date) => {
    onDateSelect(date);
    if (selectedTime) {
      onTimeSelect('');
    }
  };

  const handleTimeSlotSelect = (slot: TimeSlot) => {
    onTimeSelect(slot.startTime);
    onSlotSelect?.(slot);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Date Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Select Date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && handleDateSelect(date)}
            disabled={isDateDisabled}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            className="rounded-md border pointer-events-auto"
          />
          
          {!isMember && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">Non-Member Scheduling</p>
                  <p className="text-amber-700">
                    À la carte appointments are available Monday–Wednesday only, from 10:30 AM–1:00 PM.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Time Selection */}
      {selectedDate && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Select Time — {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </CardTitle>
            {slotsLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking Nico's schedule...
              </div>
            )}
            {isEstimatedAvailability && !slotsLoading && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800">Estimated Availability</p>
                    <p className="text-amber-700">
                      These times are estimated. Please call <a href="tel:+19415279169" className="underline font-medium">(941) 527-9169</a> to confirm availability.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {slotsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : slotsForSelectedDate.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {slotsForSelectedDate.map((slot) => {
                  const isSelected = selectedTime === slot.startTime;
                  return (
                    <Button
                      key={slot.id}
                      variant={isSelected ? 'default' : 'outline'}
                      onClick={() => handleTimeSlotSelect(slot)}
                      className={cn("h-auto p-3 flex flex-col items-center gap-1")}
                    >
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span className="font-medium">{slot.startTime}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {slot.arrivalWindow}
                      </div>
                      {slot.tag === 'soonest' && (
                        <Badge variant="secondary" className="text-xs">
                          Soonest
                        </Badge>
                      )}
                      {slot.providerName && (
                        <div className="text-xs opacity-70 truncate max-w-full">
                          w/ {(() => {
                            const name = slot.providerName;
                            // Extract nickname from quotes if present (e.g., 'Nicodemme "Nico" Jean-Baptiste' → 'Nico')
                            const nicknameMatch = name.match(/"([^"]+)"/);
                            if (nicknameMatch) return nicknameMatch[1];
                            // Otherwise use first name
                            return name.split(' ')[0];
                          })()}
                        </div>
                      )}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p className="font-medium">No available times on this date</p>
                <p className="text-sm">Please select a different date or call <a href="tel:+19415279169" className="underline">(941) 527-9169</a></p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SmartDateTimePicker;
