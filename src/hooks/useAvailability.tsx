
import { useState } from 'react';
import { addDays, getDay, format, isAfter } from 'date-fns';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { TimeSlot, AvailabilityDay } from '@/types/appointmentTypes';

// This is a simple placeholder for now - in a real app we would fetch real availability data
export function useAvailability() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);
  
  // Mock function to generate availability for a given date range
  const getAvailabilityForDateRange = async (
    startDate: Date,
    numberOfDays: number = 14
  ): Promise<AvailabilityDay[]> => {
    setIsLoading(true);
    
    // In a real app, this would come from a backend service with real data
    try {
      // Simulated API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const availabilityDays: AvailabilityDay[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < numberOfDays; i++) {
        const date = addDays(startDate, i);
        const dayOfWeek = getDay(date);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        // Skip dates in the past
        if (!isAfter(date, today)) continue;
        
        // Generate time slots based on the day of week
        const slots: TimeSlot[] = [];
        
        // Convelabs business hours: Mon-Fri 6:00 AM - 1:30 PM, Sat 6:00 AM - 9:45 AM, Sun closed
        if (!isWeekend) {
          // Weekday hours: 6:00 AM - 1:30 PM (generate hourly slots)
          const weekdaySlotTimes = [
            { hour: 6, min: 0 }, { hour: 7, min: 0 }, { hour: 8, min: 0 },
            { hour: 9, min: 0 }, { hour: 10, min: 0 }, { hour: 11, min: 0 },
            { hour: 12, min: 0 }, { hour: 13, min: 0 }
          ];
          for (const { hour, min } of weekdaySlotTimes) {
            const hourTime = format(new Date(2000, 0, 1, hour, min), 'h:mm a');
            const endHour = hour + 1;
            const endTime = endHour <= 13 
              ? format(new Date(2000, 0, 1, endHour, min), 'h:mm a')
              : '1:30 PM';
            slots.push({
              id: `weekday-${date.toISOString()}-${hour}`,
              time: hourTime,
              start: hourTime,
              end: endTime,
              available: Math.random() > 0.3,
              isAfterHours: false
            });
          }
        } 
        // Saturday: 6:00 AM - 9:45 AM (members/tenants only)
        else if (dayOfWeek === 6 && currentTenant) {
          const saturdaySlotTimes = [
            { hour: 6, min: 0 }, { hour: 7, min: 0 }, { hour: 8, min: 0 }, { hour: 9, min: 0 }
          ];
          for (const { hour, min } of saturdaySlotTimes) {
            const hourTime = format(new Date(2000, 0, 1, hour, min), 'h:mm a');
            const endTime = hour === 9 
              ? '9:45 AM' 
              : format(new Date(2000, 0, 1, hour + 1, min), 'h:mm a');
            slots.push({
              id: `weekend-${date.toISOString()}-${hour}`,
              time: hourTime,
              start: hourTime,
              end: endTime,
              available: Math.random() > 0.5,
              isWeekend: true
            });
          }
        }
        // Sunday: closed
        
        const hasAvailableSlots = slots.some(slot => slot.available);
        
        availabilityDays.push({
          date: date.toISOString(), // Convert Date to string to match the interface
          slots,
          fullyBooked: !hasAvailableSlots,
          available: hasAvailableSlots
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

  // Check if a specific date and time slot is available
  const checkTimeSlotAvailability = async (
    date: Date,
    timeSlot: string
  ): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      // Simulated API call
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // In a real app, we would check against actual availability data
      // For now, return random availability with 80% chance of being available
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
    checkTimeSlotAvailability
  };
}
