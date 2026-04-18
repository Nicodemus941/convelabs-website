
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
import { isBookingAllowed, normalizeTime, type MemberTier } from '@/lib/bookingWindows';
import { getMemberTier } from '@/lib/memberBenefits';
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

// Operational hours (Hormozi tiered membership):
//   Non-member:      Mon-Fri 6-9am (fasting) + 9am-12pm (non-fasting). No Saturday.
//   Regular Member:  Mon-Fri 6am-12pm + Saturday 6-9am.
//   VIP:             Mon-Fri 6am-2pm + Saturday 6-11am.
//   Concierge:       any day 6am-8pm + Sunday by request.
// After-hours (5:30-8pm) is Concierge-only in-window. Non-Concierge requests
// go through the after-hours toggle with a $50 surcharge for VIP, rejected
// for lower tiers server-side.
//
// allDayWindows shows ALL possible slots the app renders; disallowed slots
// are visually greyed out per tier (see `disabledByTier` below).
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
  { time: "1:30 PM", label: "1:30 - 2:00 PM" },
];

// Routine blood draws — now match non-fasting member window (9am-12pm)
const routineWindows = allDayWindows.filter(w => {
  const hour = parseInt(w.time);
  const isPM = w.time.includes('PM');
  const hour24 = isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour);
  return hour24 >= 9 && hour24 < 12;
});

// Saturday — VIP gets 6am-11am, Regular gets 6-9am. Show up to 10:30 start
// (11am end) and the tier-disable logic handles the rest.
const weekendWindows = [
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
];

// After-hours windows (5:30 PM - 8:00 PM) — only shown when user requests it
const afterHoursWindows = [
  { time: "5:30 PM", label: "5:30 - 6:00 PM" },
  { time: "6:00 PM", label: "6:00 - 6:30 PM" },
  { time: "6:30 PM", label: "6:30 - 7:00 PM" },
  { time: "7:00 PM", label: "7:00 - 7:30 PM" },
  { time: "7:30 PM", label: "7:30 - 8:00 PM" },
];

// Services that use routine hours (9am-1:30pm)
const ROUTINE_SERVICES = ['routine-blood-draw'];
// Services that skip time selection (STAT/same-day)
const STAT_SERVICES = ['stat-blood-draw'];

const DateTimeSelectionStep: React.FC<DateTimeSelectionStepProps> = ({ onNext, onBack, considerDistance }) => {
  const methods = useFormContext<BookingFormValues>();
  const selectedDate = methods.watch("date");
  const selectedTime = methods.watch("time");
  const patientEmail = methods.watch("patientDetails.email");
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Tier detection — queries user_memberships when email changes.
  // Default 'none' (non-member rules) for unknown patients.
  const [patientTier, setPatientTier] = useState<MemberTier>('none');
  useEffect(() => {
    if (!patientEmail) { setPatientTier('none'); return; }
    let cancelled = false;
    getMemberTier(String(patientEmail)).then(({ tier }) => {
      if (!cancelled) setPatientTier(tier);
    });
    return () => { cancelled = true; };
  }, [patientEmail]);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [blockedDates, setBlockedDates] = useState<{ start: string; end: string }[]>([]);
  const [showAfterHours, setShowAfterHours] = useState(false);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [heldSlots, setHeldSlots] = useState<Set<string>>(new Set());

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
    'partner-nd-wellness': 65, 'partner-naturamed': 60, 'partner-restoration-place': 60,
    'partner-elite-medical-concierge': 60, 'partner-aristotle-education': 75,
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

        // Also check for active slot holds from other users
        const { data: holds } = await supabase
          .from('slot_holds' as any)
          .select('appointment_time')
          .eq('appointment_date', dateStr)
          .eq('released', false)
          .gt('expires_at', new Date().toISOString());

        const activeHolds = new Set((holds || []).map((h: any) => h.appointment_time));
        setHeldSlots(activeHolds);

        if ((!data || data.length === 0) && activeHolds.size === 0) {
          console.log('No appointments or holds found — all slots available');
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
          const EXTENDED_AREA_CITIES = ['eustis', 'sanford', 'celebration', 'kissimmee', 'lake nona', 'clermont', 'montverde', 'geneva', 'tavares', 'mount dora', 'leesburg', 'groveland', 'mascotte', 'minneola', 'daytona beach', 'deland', 'debary', 'orange city'];
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

  // Get Current Date
  const today = new Date();

  // Same-day detection: compare selected date to today (Eastern Time)
  const isSameDay = selectedDate
    ? selectedDate.getFullYear() === today.getFullYear()
      && selectedDate.getMonth() === today.getMonth()
      && selectedDate.getDate() === today.getDate()
    : false;

  // SAME-DAY LEAD TIME: 90 minutes minimum before appointment
  const SAME_DAY_LEAD_MINUTES = 90;
  // SAME-DAY CUTOFF: No same-day bookings after 3 PM (15:00)
  const SAME_DAY_CUTOFF_HOUR = 15; // 3 PM
  const isSameDayCutoff = isSameDay && today.getHours() >= SAME_DAY_CUTOFF_HOUR;

  // Convert a time string like "2:30 PM" to minutes since midnight
  const timeToMinutes = (t: string): number => {
    const [timePart, period] = t.split(' ');
    const [h, m] = timePart.split(':').map(Number);
    let hour24 = period === 'PM' && h !== 12 ? h + 12 : (period === 'AM' && h === 12 ? 0 : h);
    return hour24 * 60 + (m || 0);
  };

  // Current time in minutes since midnight (local)
  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  // Auto-set sameDay flag + weekend flag when date changes
  useEffect(() => {
    if (!selectedDate) return;
    const isToday = selectedDate.getFullYear() === today.getFullYear()
      && selectedDate.getMonth() === today.getMonth()
      && selectedDate.getDate() === today.getDate();
    const isWknd = selectedDate.getDay() === 0 || selectedDate.getDay() === 6;

    methods.setValue('serviceDetails.sameDay', isToday);
    methods.setValue('serviceDetails.weekend', isWknd);

    // If switching to today, clear time if it's now past the lead time
    if (isToday && selectedTime) {
      const slotMins = timeToMinutes(selectedTime);
      const currentMins = new Date().getHours() * 60 + new Date().getMinutes();
      if (slotMins < currentMins + SAME_DAY_LEAD_MINUTES) {
        methods.setValue('time', '');
      }
    }
  }, [selectedDate]);

  // Choose windows based on service type + after-hours toggle
  const baseWindows = isWeekend
    ? weekendWindows
    : isRoutine
    ? routineWindows
    : allDayWindows;

  const activeWindows = (!isWeekend && showAfterHours)
    ? [...baseWindows, ...afterHoursWindows]
    : baseWindows;
  
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
                        disabled={(date) => {
                          const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                          const isTooFar = date > new Date(today.getFullYear(), today.getMonth() + 2, 0);
                          const isTodayPastCutoff = date.getFullYear() === today.getFullYear()
                            && date.getMonth() === today.getMonth()
                            && date.getDate() === today.getDate()
                            && today.getHours() >= SAME_DAY_CUTOFF_HOUR;
                          return isPast || isTooFar || isHoliday(date) || isBlockedByAdmin(date, blockedDates) || isTodayPastCutoff;
                        }}
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

                  {/* Same-day booking notice */}
                  {isSameDay && !isStat && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
                      <p className="text-sm font-medium text-amber-900">Same-Day Booking</p>
                      <p className="text-xs text-amber-700 mt-1">
                        A $100 same-day surcharge applies. Slots within 90 minutes of the current time are unavailable to allow travel time.
                      </p>
                    </div>
                  )}

                  {isSameDayCutoff ? (
                    <div className="py-4 space-y-2">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                        <p className="font-medium text-red-900">Same-Day Booking Cutoff Reached</p>
                        <p className="text-sm text-red-700 mt-1">
                          Same-day appointments cannot be booked after 3:00 PM. Please select tomorrow or a future date.
                        </p>
                      </div>
                    </div>
                  ) : isStat ? (
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
                        const isHeldByOther = !isSelected && heldSlots.has(window.time);
                        const isAfterHours = afterHoursWindows.some(w => w.time === window.time);

                        // Same-day: disable past slots + enforce 90-min lead time
                        const slotMinutes = timeToMinutes(window.time);
                        const isPastOrTooSoon = isSameDay && slotMinutes < nowMinutes + SAME_DAY_LEAD_MINUTES;

                        // Tier-aware window enforcement: does this slot fit the
                        // patient's tier rules for the selected date? Uses the
                        // same server-side rules (bookingWindows.ts). Slots
                        // outside tier window are shown disabled with the reason
                        // on hover + an upgrade CTA surfaced below the grid.
                        let tierDisabled = false;
                        let tierReason: string | undefined;
                        if (selectedDate) {
                          const hhmm = normalizeTime(window.time);
                          if (hhmm) {
                            const dateIso = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
                            // Heuristic: slots before 9am assumed fasting
                            const isFasting = hhmm < '09:00';
                            const check = isBookingAllowed({ tier: patientTier, dateIso, time: window.time, isFasting });
                            if (!check.allowed) {
                              tierDisabled = true;
                              tierReason = check.upgradeCTA?.message || check.reason || 'Not available in your tier';
                            }
                          }
                        }
                        const isUnavailable = isBooked || isHeldByOther || isPastOrTooSoon || tierDisabled;

                        return (
                          <button
                            key={window.time}
                            type="button"
                            title={tierDisabled ? tierReason : isBooked ? 'Already booked' : isHeldByOther ? 'Being booked by someone else' : isPastOrTooSoon ? 'Too soon for same-day' : ''}
                            className={`rounded-lg border text-center py-3 px-1 text-sm font-medium transition-all ${
                              isUnavailable
                                ? 'bg-gray-50 text-gray-300 line-through cursor-not-allowed border-gray-100'
                                : isSelected
                                ? 'bg-[#B91C1C] text-white border-[#B91C1C] shadow-md scale-[1.02]'
                                : isAfterHours
                                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-400 hover:shadow-sm'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-[#B91C1C]/50 hover:shadow-sm'
                            }`}
                            onClick={async () => {
                              if (isUnavailable) return;

                              // Release previous hold if exists
                              if (holdId) {
                                await supabase.from('slot_holds' as any).update({ released: true }).eq('id', holdId);
                              }

                              field.onChange(window.time);

                              // Create a new slot hold (15 min expiry)
                              if (selectedDate) {
                                const year = selectedDate.getFullYear();
                                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                                const day = String(selectedDate.getDate()).padStart(2, '0');
                                const dateStr = `${year}-${month}-${day}`;

                                const { data: hold } = await supabase.from('slot_holds' as any).insert({
                                  appointment_date: dateStr,
                                  appointment_time: window.time,
                                  held_by: `session_${Date.now()}`,
                                  expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
                                }).select('id').single();

                                if (hold) setHoldId((hold as any).id);
                              }
                            }}
                            disabled={isUnavailable}
                          >
                            <span>{window.time}</span>
                            {isAfterHours && !isUnavailable && (
                              <span className="block text-[9px] opacity-70 mt-0.5">+$50</span>
                            )}
                            {isSameDay && !isAfterHours && !isUnavailable && (
                              <span className="block text-[9px] opacity-70 mt-0.5">+$100</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {loadingSlots && (
                    <p className="text-xs text-muted-foreground mt-1">Checking availability...</p>
                  )}

                  {/* After-hours toggle — weekdays only, not for STAT or weekend */}
                  {!isWeekend && !isSunday && !isStat && (
                    <div className="mt-3">
                      {!showAfterHours ? (
                        <button
                          type="button"
                          onClick={() => setShowAfterHours(true)}
                          className="text-sm text-[#B91C1C] hover:text-[#991B1B] font-medium hover:underline"
                        >
                          Need an after-hours appointment? →
                        </button>
                      ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-amber-900">After-Hours Slots Available</p>
                            <button
                              type="button"
                              onClick={() => {
                                setShowAfterHours(false);
                                // Clear selection if an after-hours slot was selected
                                const currentTime = field.value;
                                if (currentTime && afterHoursWindows.some(w => w.time === currentTime)) {
                                  field.onChange('');
                                }
                              }}
                              className="text-xs text-amber-600 hover:text-amber-800 underline"
                            >
                              Hide
                            </button>
                          </div>
                          <p className="text-xs text-amber-700">After-hours (5:30 PM – 8:00 PM) is <strong>Concierge-included</strong>. VIP members can request after-hours with a $50 surcharge. Regular + non-members: please pick a weekday morning slot.</p>
                        </div>
                      )}
                    </div>
                  )}

                  <FormDescription>
                    {isStat
                      ? "Next available within operating hours (+$100)"
                      : isSunday
                      ? "Sundays — Concierge members only (on request). Non-Concierge patients: pick a weekday."
                      : isWeekend
                      ? "Saturday — Regular members 6–9 AM · VIP 6–11 AM · Concierge full hours. Non-members: weekday booking only."
                      : isSameDay
                      ? "Same-day booking (+$100 surcharge) · 90-min lead time · Concierge only"
                      : isRoutine
                      ? "Routine non-fasting hours: 9 AM – 12 PM"
                      : showAfterHours
                      ? "After-hours (5:30 PM – 8 PM) — Concierge in-window, VIP on request (+$50)"
                      : "Mon–Fri 6 AM – 1:30 PM · fasting slots 6–9 AM · non-fasting 9 AM–12 PM for non-members"}
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
