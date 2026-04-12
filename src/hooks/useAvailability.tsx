
import { useState } from 'react';
import { addDays, getDay, format, isAfter } from 'date-fns';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { TimeSlot, AvailabilityDay } from '@/types/appointmentTypes';

export function useAvailability() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);

  const getAvailabilityForDateRange = async (
    startDate: Date,
    numberOfDays: number = 14
  ): Promise<AvailabilityDay[]> => {
    setIsLoading(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const availabilityDays: AvailabilityDay[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < numberOfDays; i++) {
        const date = addDays(startDate, i);
        const dayOfWeek = getDay(date);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (!isAfter(date, today)) continue;

        const slots: TimeSlot[] = [];

        if (!isWeekend) {
          // Weekday: 6:00 AM - 1:30 PM in 30-min windows
          const windowStarts = [
            { hour: 6, min: 0 }, { hour: 6, min: 30 },
            { hour: 7, min: 0 }, { hour: 7, min: 30 },
            { hour: 8, min: 0 }, { hour: 8, min: 30 },
            { hour: 9, min: 0 }, { hour: 9, min: 30 },
            { hour: 10, min: 0 }, { hour: 10, min: 30 },
            { hour: 11, min: 0 }, { hour: 11, min: 30 },
            { hour: 12, min: 0 }, { hour: 12, min: 30 },
            { hour: 13, min: 0 },
          ];
          for (const { hour, min } of windowStarts) {
            const startTime = format(new Date(2000, 0, 1, hour, min), 'h:mm a');
            const endMin = min + 30;
            const endHour = endMin >= 60 ? hour + 1 : hour;
            const endMinNorm = endMin >= 60 ? endMin - 60 : endMin;
            const endTime = format(new Date(2000, 0, 1, endHour, endMinNorm), 'h:mm a');
            const displayLabel = `${startTime} - ${endTime}`;

            slots.push({
              id: `weekday-${date.toISOString()}-${hour}-${min}`,
              time: startTime,
              start: startTime,
              end: endTime,
              displayLabel,
              available: Math.random() > 0.3,
              isAfterHours: false,
            });
          }
        } else if (dayOfWeek === 6 && currentTenant) {
          // Saturday: 6:00 AM - 9:45 AM in 30-min windows
          const windowStarts = [
            { hour: 6, min: 0 }, { hour: 6, min: 30 },
            { hour: 7, min: 0 }, { hour: 7, min: 30 },
            { hour: 8, min: 0 }, { hour: 8, min: 30 },
            { hour: 9, min: 0 },
          ];
          for (const { hour, min } of windowStarts) {
            const startTime = format(new Date(2000, 0, 1, hour, min), 'h:mm a');
            const endMin = min + 30;
            const endHour = endMin >= 60 ? hour + 1 : hour;
            const endMinNorm = endMin >= 60 ? endMin - 60 : endMin;
            // Cap Saturday end at 9:45 AM
            const isLastSlot = hour === 9 && min === 0;
            const endTime = isLastSlot
              ? '9:30 AM'
              : format(new Date(2000, 0, 1, endHour, endMinNorm), 'h:mm a');
            const displayLabel = `${startTime} - ${endTime}`;

            slots.push({
              id: `weekend-${date.toISOString()}-${hour}-${min}`,
              time: startTime,
              start: startTime,
              end: endTime,
              displayLabel,
              available: Math.random() > 0.5,
              isWeekend: true,
            });
          }
        }

        const hasAvailableSlots = slots.some(slot => slot.available);

        availabilityDays.push({
          date: date.toISOString(),
          slots,
          fullyBooked: !hasAvailableSlots,
          available: hasAvailableSlots,
        });
      }

      setIsLoading(false);
      return availabilityDays;
    } catch (error) {
      console.error('Error fetching availability:', error);
      setIsLoading(false);
      return [];
    }
  };

  const checkTimeSlotAvailability = async (
    date: Date,
    timeSlot: string
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const isAvailable = Math.random() > 0.2;
      setIsLoading(false);
      return isAvailable;
    } catch (error) {
      console.error('Error checking time slot availability:', error);
      setIsLoading(false);
      return false;
    }
  };

  return {
    isLoading,
    getAvailabilityForDateRange,
    checkTimeSlotAvailability,
  };
}
