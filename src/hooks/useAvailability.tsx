
import { useState } from 'react';
import { addDays, getDay, format, isAfter, parseISO } from 'date-fns';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { TimeSlot, AvailabilityDay } from '@/types/appointmentTypes';
import { supabase } from '@/integrations/supabase/client';

// Time windows by day type
const WEEKDAY_WINDOWS = [
  { time: "6:00 AM", label: "6:00 - 6:30 AM", hour: 6, min: 0 },
  { time: "6:30 AM", label: "6:30 - 7:00 AM", hour: 6, min: 30 },
  { time: "7:00 AM", label: "7:00 - 7:30 AM", hour: 7, min: 0 },
  { time: "7:30 AM", label: "7:30 - 8:00 AM", hour: 7, min: 30 },
  { time: "8:00 AM", label: "8:00 - 8:30 AM", hour: 8, min: 0 },
  { time: "8:30 AM", label: "8:30 - 9:00 AM", hour: 8, min: 30 },
  { time: "9:00 AM", label: "9:00 - 9:30 AM", hour: 9, min: 0 },
  { time: "9:30 AM", label: "9:30 - 10:00 AM", hour: 9, min: 30 },
  { time: "10:00 AM", label: "10:00 - 10:30 AM", hour: 10, min: 0 },
  { time: "10:30 AM", label: "10:30 - 11:00 AM", hour: 10, min: 30 },
  { time: "11:00 AM", label: "11:00 - 11:30 AM", hour: 11, min: 0 },
  { time: "11:30 AM", label: "11:30 AM - 12:00 PM", hour: 11, min: 30 },
  { time: "12:00 PM", label: "12:00 - 12:30 PM", hour: 12, min: 0 },
  { time: "12:30 PM", label: "12:30 - 1:00 PM", hour: 12, min: 30 },
  { time: "1:00 PM", label: "1:00 - 1:30 PM", hour: 13, min: 0 },
];

const WEEKEND_WINDOWS = WEEKDAY_WINDOWS.filter(w => w.hour < 9 || (w.hour === 9 && w.min === 0));

export function useAvailability() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);

  const getAvailabilityForDateRange = async (
    startDate: Date,
    numberOfDays: number = 14
  ): Promise<AvailabilityDay[]> => {
    setIsLoading(true);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const endDate = addDays(startDate, numberOfDays);

      // Fetch existing appointments in the date range
      const { data: existingAppointments } = await supabase
        .from('appointments')
        .select('appointment_date, status')
        .gte('appointment_date', startDate.toISOString())
        .lte('appointment_date', endDate.toISOString())
        .in('status', ['scheduled', 'confirmed', 'en_route', 'in_progress']);

      // Fetch staff time off blocks
      const { data: timeOffBlocks } = await supabase
        .from('staff_time_off')
        .select('start_date, end_date')
        .lte('start_date', endDate.toISOString().split('T')[0])
        .gte('end_date', startDate.toISOString().split('T')[0]);

      // Count appointments per time slot
      const bookedSlots = new Map<string, number>();
      existingAppointments?.forEach(appt => {
        if (appt.appointment_date) {
          const dt = new Date(appt.appointment_date);
          const key = `${format(dt, 'yyyy-MM-dd')}-${dt.getHours()}-${dt.getMinutes() < 30 ? 0 : 30}`;
          bookedSlots.set(key, (bookedSlots.get(key) || 0) + 1);
        }
      });

      // Get staff count for capacity
      const { count: staffCount } = await supabase
        .from('staff_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('specialty', 'phlebotomy');

      const maxPerSlot = staffCount || 1; // Number of phlebotomists available

      // Check if a date falls in any time off block
      const isDateBlocked = (date: Date): boolean => {
        if (!timeOffBlocks?.length) return false;
        const dateStr = format(date, 'yyyy-MM-dd');
        return timeOffBlocks.some(block =>
          dateStr >= block.start_date && dateStr <= block.end_date
        );
      };

      const availabilityDays: AvailabilityDay[] = [];

      for (let i = 0; i < numberOfDays; i++) {
        const date = addDays(startDate, i);
        const dayOfWeek = getDay(date);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isSaturday = dayOfWeek === 6;
        const dateStr = format(date, 'yyyy-MM-dd');

        if (!isAfter(date, today)) continue;

        // Sunday: closed
        if (dayOfWeek === 0) continue;

        // Check if entire day is blocked (time off)
        const dayBlocked = isDateBlocked(date);

        // Saturday: members only (show slots but note)
        const windows = isSaturday ? WEEKEND_WINDOWS : WEEKDAY_WINDOWS;

        const slots: TimeSlot[] = windows.map(window => {
          const slotKey = `${dateStr}-${window.hour}-${window.min}`;
          const bookedCount = bookedSlots.get(slotKey) || 0;
          const isAvailable = !dayBlocked && bookedCount < maxPerSlot;

          return {
            id: `${dateStr}-${window.hour}-${window.min}`,
            time: window.time,
            start: window.time,
            end: window.label.split(' - ')[1] || '',
            displayLabel: window.label,
            available: isAvailable,
            booked: bookedCount >= maxPerSlot,
            isWeekend: isSaturday,
            isAfterHours: false,
          };
        });

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
      // Check if this specific slot has available capacity
      const dateStr = format(date, 'yyyy-MM-dd');
      const startOfDay = `${dateStr}T00:00:00`;
      const endOfDay = `${dateStr}T23:59:59`;

      const { data: existingAppts } = await supabase
        .from('appointments')
        .select('appointment_date')
        .gte('appointment_date', startOfDay)
        .lte('appointment_date', endOfDay)
        .in('status', ['scheduled', 'confirmed', 'en_route', 'in_progress']);

      // Parse the time slot to check
      const match = timeSlot.match(/(\d+):(\d+)\s*(AM|PM)/);
      if (!match) { setIsLoading(false); return true; }

      let hour = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      if (match[3] === 'PM' && hour !== 12) hour += 12;
      if (match[3] === 'AM' && hour === 12) hour = 0;

      const halfHour = minutes < 30 ? 0 : 30;
      const slotAppts = existingAppts?.filter(a => {
        const dt = new Date(a.appointment_date);
        return dt.getHours() === hour && (dt.getMinutes() < 30 ? 0 : 30) === halfHour;
      }) || [];

      const { count: staffCount } = await supabase
        .from('staff_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('specialty', 'phlebotomy');

      setIsLoading(false);
      return slotAppts.length < (staffCount || 1);
    } catch (error) {
      console.error('Error checking time slot:', error);
      setIsLoading(false);
      return true; // Default to available on error
    }
  };

  return {
    isLoading,
    getAvailabilityForDateRange,
    checkTimeSlotAvailability,
  };
}
