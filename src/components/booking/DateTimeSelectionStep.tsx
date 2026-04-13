
import React, { useState, useEffect } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { CalendarIcon, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { 
  FormField, 
  FormItem, 
  FormLabel, 
  FormControl, 
  FormDescription, 
  FormMessage 
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingFormValues } from '@/types/appointmentTypes';
import AvailabilityMap from './AvailabilityMap';
import { supabase } from '@/integrations/supabase/client';

// US Government holidays - ConveLabs is closed on these dates
function getBlockedHolidays(year: number): Date[] {
  const holidays: Date[] = [];

  // Fixed-date holidays
  holidays.push(new Date(year, 0, 1));   // New Year's Day
  holidays.push(new Date(year, 5, 19));  // Juneteenth
  holidays.push(new Date(year, 6, 4));   // Fourth of July
  holidays.push(new Date(year, 11, 24)); // Christmas Eve
  holidays.push(new Date(year, 11, 25)); // Christmas Day
  holidays.push(new Date(year, 11, 31)); // New Year's Eve

  // MLK Day: 3rd Monday of January
  const mlk = new Date(year, 0, 1);
  let mondays = 0;
  while (mondays < 3) { mlk.setDate(mlk.getDate() + 1); if (mlk.getDay() === 1) mondays++; }
  holidays.push(new Date(mlk));

  // Presidents' Day: 3rd Monday of February
  const pres = new Date(year, 1, 1);
  mondays = 0;
  while (mondays < 3) { pres.setDate(pres.getDate() + 1); if (pres.getDay() === 1) mondays++; }
  holidays.push(new Date(pres));

  // Memorial Day: Last Monday of May
  const mem = new Date(year, 5, 0); // May 31
  while (mem.getDay() !== 1) mem.setDate(mem.getDate() - 1);
  holidays.push(new Date(mem));

  // Labor Day: 1st Monday of September
  const labor = new Date(year, 8, 1);
  while (labor.getDay() !== 1) labor.setDate(labor.getDate() + 1);
  holidays.push(new Date(labor));

  // Columbus Day: 2nd Monday of October
  const col = new Date(year, 9, 1);
  mondays = 0;
  while (mondays < 2) { col.setDate(col.getDate() + 1); if (col.getDay() === 1) mondays++; }
  holidays.push(new Date(col));

  // Veterans Day: Nov 11
  holidays.push(new Date(year, 10, 11));

  // Thanksgiving: 4th Thursday of November
  const tg = new Date(year, 10, 1);
  let thursdays = 0;
  while (thursdays < 4) { tg.setDate(tg.getDate() + 1); if (tg.getDay() === 4) thursdays++; }
  holidays.push(new Date(tg));
  // Thanksgiving Eve (day before)
  holidays.push(new Date(year, tg.getMonth(), tg.getDate() - 1));

  return holidays;
}

function isHoliday(date: Date): boolean {
  const holidays = getBlockedHolidays(date.getFullYear());
  return holidays.some(h =>
    h.getFullYear() === date.getFullYear() &&
    h.getMonth() === date.getMonth() &&
    h.getDate() === date.getDate()
  );
}

// Check if a date falls within any admin-created time block
function isBlockedByAdmin(date: Date, blockedRanges: { start: string; end: string }[]): boolean {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return blockedRanges.some(r => dateStr >= r.start && dateStr <= r.end);
}

interface DateTimeSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
  considerDistance?: boolean;
}

// All windows (fasting + general — 6:00 AM - 1:30 PM)
const allDayWindows = [
  { time: "6:00 AM", label: "6:00 - 6:30 AM" },
  { time: "6:30 AM", label: "6:30 - 7:00 AM" },
  { time: "7:00 AM", label: "7:00 - 7:30 AM" },
  { time: "7:30 AM", label: "7:30 - 8:00 AM" },
  { time: "8:00 AM", label: "8:00 - 8:30 AM" },
  { time: "8:30 AM", label: "8:30 - 9:00 AM" },
  { time: "9:00 AM", label: "9:00 - 9:30 AM" },
  { time: "9:30 AM", label: "9:30 - 10:00 AM" },
  { time: "10:00 AM", label: "10:00 - 10:30 AM" },
  { time: "10:30 AM", label: "10:30 - 11:00 AM" },
  { time: "11:00 AM", label: "11:00 - 11:30 AM" },
  { time: "11:30 AM", label: "11:30 AM - 12:00 PM" },
  { time: "12:00 PM", label: "12:00 - 12:30 PM" },
  { time: "12:30 PM", label: "12:30 - 1:00 PM" },
  { time: "1:00 PM", label: "1:00 - 1:30 PM" },
];

// Routine blood draws — 9:00 AM - 1:30 PM only
const routineWindows = allDayWindows.filter(w => {
  const hour = parseInt(w.time);
  const isPM = w.time.includes('PM');
  const hour24 = isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour);
  return hour24 >= 9;
});

const weekendWindows = [
  { time: "6:00 AM", label: "6:00 - 6:30 AM" },
  { time: "6:30 AM", label: "6:30 - 7:00 AM" },
  { time: "7:00 AM", label: "7:00 - 7:30 AM" },
  { time: "7:30 AM", label: "7:30 - 8:00 AM" },
  { time: "8:00 AM", label: "8:00 - 8:30 AM" },
  { time: "8:30 AM", label: "8:30 - 9:00 AM" },
  { time: "9:00 AM", label: "9:00 - 9:30 AM" },
];

// Services that use routine hours (9am-1:30pm)
const ROUTINE_SERVICES = ['routine-blood-draw'];
// Services that skip time selection (STAT/same-day)
const STAT_SERVICES = ['stat-blood-draw'];

const DateTimeSelectionStep: React.FC<DateTimeSelectionStepProps> = ({ onNext, onBack, considerDistance }) => {
  const methods = useFormContext<BookingFormValues>();
  const selectedDate = methods.watch("date");
  const selectedTime = methods.watch("time");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [blockedDates, setBlockedDates] = useState<{ start: string; end: string }[]>([]);

  // Fetch admin-blocked dates on mount
  useEffect(() => {
    supabase.from('time_blocks' as any).select('start_date, end_date').then(({ data }) => {
      if (data) setBlockedDates(data.map((d: any) => ({ start: d.start_date, end: d.end_date })));
    });
  }, []);

  // Duration map by service type (in minutes)
  const DURATION_MAP: Record<string, number> = {
    'mobile': 60, 'in-office': 60, 'senior': 60, 'routine': 60, 'fasting': 60, 'stat': 60,
    'therapeutic': 75, 'specialty-kit': 75, 'specialty-kit-genova': 80,
  };

  // Convert hour:min to a slot key like "9:00 AM"
  const toSlotKey = (h: number, m: number): string => {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const minStr = m < 30 ? '00' : '30';
    return `${hour12}:${minStr} ${period}`;
  };

  // Fetch booked slots when date changes — accounts for duration
  useEffect(() => {
    if (!selectedDate) return;
    const fetchBookedSlots = async () => {
      setLoadingSlots(true);
      try {
        // Use local date formatting to avoid timezone issues
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        console.log('Fetching booked slots for:', dateStr);

        const { data, error: fetchError } = await supabase
          .from('appointments')
          .select('appointment_date, appointment_time, service_type, duration_minutes, address, zipcode')
          .gte('appointment_date', `${dateStr}T00:00:00`)
          .lte('appointment_date', `${dateStr}T23:59:59`)
          .in('status', ['scheduled', 'confirmed', 'en_route', 'in_progress']);

        if (fetchError) {
          console.error('Slot fetch error:', fetchError);
        }

        console.log('Booked appointments for', dateStr, ':', data?.length || 0, data);

        if (!data || data.length === 0) {
          console.log('No appointments found — all slots available');
          setBookedSlots(new Set());
          setLoadingSlots(false);
          return;
        }

        const { count: staffCount } = await supabase
          .from('staff_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('specialty', 'phlebotomy');

        const maxPerSlot = staffCount || 1;
        const slotCounts = new Map<string, number>();

        data?.forEach((appt: any) => {
          // Use appointment_time (local time like "6:30 AM" or "10:30:00") instead of UTC timestamp
          let startHour = 0;
          let startMin = 0;

          if (appt.appointment_time) {
            const timeStr = String(appt.appointment_time);
            // Handle "6:30 AM" format
            if (timeStr.includes('AM') || timeStr.includes('PM')) {
              const [timePart, period] = timeStr.split(' ');
              const [h, m] = timePart.split(':').map(Number);
              startHour = period === 'PM' && h !== 12 ? h + 12 : (period === 'AM' && h === 12 ? 0 : h);
              startMin = m || 0;
            }
            // Handle "10:30:00" 24h format
            else if (timeStr.includes(':')) {
              const parts = timeStr.split(':').map(Number);
              startHour = parts[0] || 0;
              startMin = parts[1] || 0;
            }
          } else {
            // Fallback to timestamp (less reliable due to timezone)
            const dt = new Date(appt.appointment_date);
            startHour = dt.getUTCHours();
            startMin = dt.getUTCMinutes();
          }

          // Get duration for this appointment type — prefer DURATION_MAP over DB default of 30
          const mappedDuration = DURATION_MAP[appt.service_type || 'mobile'] || 60;
          const duration = (appt.duration_minutes && appt.duration_minutes > 30) ? appt.duration_minutes : mappedDuration;
          // Travel buffer ONLY for extended area cities (30min)
          // No travel buffer for standard Orlando metro area
          const EXTENDED_AREA_CITIES = ['eustis', 'sanford', 'celebration', 'kissimmee', 'lake nona', 'clermont', 'montverde', 'geneva'];
          const apptCity = (appt.address || '').toLowerCase();
          const isExtendedArea = EXTENDED_AREA_CITIES.some(city => apptCity.includes(city));
          const travelBuffer = isExtendedArea ? 30 : 0;

          // Block FORWARD: service duration + travel buffer (if extended area)
          const forwardBlockedMinutes = duration + travelBuffer;
          const forwardSlots = Math.ceil(forwardBlockedMinutes / 30);
          let fwdMin = startMin < 30 ? 0 : 30;
          let fwdHour = startHour;

          for (let i = 0; i < forwardSlots; i++) {
            const key = toSlotKey(fwdHour, fwdMin);
            slotCounts.set(key, (slotCounts.get(key) || 0) + 1);
            fwdMin += 30;
            if (fwdMin >= 60) { fwdMin = 0; fwdHour += 1; }
          }

          // Block BACKWARD: earlier slots where a new 60-min booking would overlap this appointment
          // 8:30 AM booking (60min) runs to 9:30, overlaps 9:00 → block 8:30
          // 8:00 AM booking (60min) runs to 9:00, ends at start → OK, not blocked
          const newBookingDuration = 60; // standard service duration
          const backwardSlots = Math.ceil(newBookingDuration / 30) - 1; // 60/30 - 1 = 1 slot back
          let bwdMin = (startMin < 30 ? 0 : 30);
          let bwdHour = startHour;

          for (let i = 0; i < backwardSlots; i++) {
            bwdMin -= 30;
            if (bwdMin < 0) { bwdMin = 30; bwdHour -= 1; }
            if (bwdHour < 6) break; // don't block before operating hours (6 AM)
            const key = toSlotKey(bwdHour, bwdMin);
            slotCounts.set(key, (slotCounts.get(key) || 0) + 1);
          }
        });

        const booked = new Set<string>();
        slotCounts.forEach((count, key) => {
          if (count >= maxPerSlot) booked.add(key);
        });

        console.log('Slot blocking results:', {
          maxPerSlot,
          slotCounts: Object.fromEntries(slotCounts),
          blockedSlots: Array.from(booked),
        });

        setBookedSlots(booked);
      } catch (err) {
        console.error('Failed to check availability:', err);
      } finally {
        setLoadingSlots(false);
      }
    };
    fetchBookedSlots();
  }, [selectedDate]);
  
  // Debug logs
  useEffect(() => {
    console.log('DateTimeSelectionStep rendered', { 
      selectedDate, 
      selectedTime, 
      considerDistance,
      formValues: methods.getValues()
    });
  }, [selectedDate, selectedTime, considerDistance, methods]);
  
  const selectedService = methods.watch('serviceDetails.selectedService');
  const isWeekend = selectedDate && (selectedDate.getDay() === 0 || selectedDate.getDay() === 6);
  const isSunday = selectedDate && selectedDate.getDay() === 0;
  const isStat = STAT_SERVICES.includes(selectedService || '');
  const isRoutine = ROUTINE_SERVICES.includes(selectedService || '');

  // Choose windows based on service type
  const activeWindows = isWeekend
    ? weekendWindows
    : isRoutine
    ? routineWindows
    : allDayWindows;
  
  // Get Current Date
  const today = new Date();
  
  // Check if both date and time are selected (STAT auto-selects "Next Available")
  const canContinue = selectedDate && (selectedTime || isStat);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Date & Time</CardTitle>
        <CardDescription>Choose when you'd like our phlebotomist to visit</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Availability indicator removed — was showing "X phlebotomists in your area" */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <FormField
              control={methods.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Appointment Date</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 flex-shrink-0"
                        onClick={() => {
                          if (field.value) {
                            let prev = subDays(field.value, 1);
                            while (prev >= today && (isHoliday(prev) || prev.getDay() === 0 || isBlockedByAdmin(prev, blockedDates))) prev = subDays(prev, 1);
                            if (prev >= today) field.onChange(prev);
                          }
                        }}
                        disabled={!field.value || subDays(field.value, 1) < today}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>

                      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className={`flex-1 pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                          >
                            {field.value ? (
                              format(field.value, "MMMM d, yyyy")
                            ) : (
                              <span>Select a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-50" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date) => {
                          if (date) {
                            field.onChange(date);
                            setCalendarOpen(false);
                          }
                        }}
                        disabled={(date) =>
                          date < today ||
                          date > new Date(today.getFullYear(), today.getMonth() + 2, 0) ||
                          isHoliday(date) ||
                          isBlockedByAdmin(date, blockedDates)
                        }
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                      </Popover>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 flex-shrink-0"
                        onClick={() => {
                          if (field.value) {
                            let next = addDays(field.value, 1);
                            while (isHoliday(next) || next.getDay() === 0 || isBlockedByAdmin(next, blockedDates)) next = addDays(next, 1);
                            const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
                            if (next <= maxDate) field.onChange(next);
                          }
                        }}
                        disabled={!field.value}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </FormControl>
                  <FormDescription>
                    Available up to 2 months in advance
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div>
            <FormField
              control={methods.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Appointment Time</FormLabel>
                  {isStat ? (
                    <div className="py-4 space-y-2">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                        <p className="font-medium text-amber-900">STAT / Same-Day Appointment</p>
                        <p className="text-sm text-amber-700 mt-1">
                          We'll schedule you for the next available window during operating hours. An additional $100 surcharge applies.
                        </p>
                      </div>
                      {(() => {
                        // Auto-set time to "Next Available" for STAT
                        if (!field.value) field.onChange('Next Available');
                        return null;
                      })()}
                    </div>
                  ) : isSunday ? (
                    <p className="text-sm text-muted-foreground py-4">No appointments available on Sundays.</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {activeWindows.map((window) => {
                        const isSelected = field.value === window.time;
                        const isBooked = bookedSlots.has(window.time);

                        return (
                          <button
                            key={window.time}
                            type="button"
                            className={`rounded-lg border text-center py-3 px-1 text-sm font-medium transition-all ${
                              isBooked
                                ? 'bg-gray-50 text-gray-300 line-through cursor-not-allowed border-gray-100'
                                : isSelected
                                ? 'bg-[#B91C1C] text-white border-[#B91C1C] shadow-md scale-[1.02]'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-[#B91C1C]/50 hover:shadow-sm'
                            }`}
                            onClick={() => {
                              if (!isBooked) field.onChange(window.time);
                            }}
                            disabled={isBooked}
                          >
                            {window.time}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {loadingSlots && (
                    <p className="text-xs text-muted-foreground mt-1">Checking availability...</p>
                  )}
                  <FormDescription>
                    {isStat
                      ? "Next available within operating hours (+$100)"
                      : isSunday
                      ? "We are closed on Sundays"
                      : isWeekend
                      ? "Limited Saturday hours (6 AM - 9:30 AM)"
                      : isRoutine
                      ? "Routine draw hours: 9 AM - 1:30 PM"
                      : "Available: Mon-Fri 6 AM - 1:30 PM"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
        
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button 
            type="button" 
            onClick={() => {
              console.log('Continue button clicked, canContinue:', canContinue);
              if (canContinue) {
                onNext();
              }
            }}
            disabled={!canContinue}
          >
            Continue <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DateTimeSelectionStep;
