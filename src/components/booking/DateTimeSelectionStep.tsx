
import React, { useState, useEffect } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { CalendarIcon, Clock, ChevronLeft, ChevronRight, Lock, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import MemberOtpUnlockButton from './MemberOtpUnlockButton';
import JoinWaitlistButton from './JoinWaitlistButton';
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
  /** Optional. When omitted, the Back button hides — used when the calendar
   *  is the entry point of the booking flow (Hormozi simplification). */
  onBack?: () => void;
  considerDistance?: boolean;
}

// Operational hours (simplified 2026-04-25):
//   ALL TIERS, ALL DAYS: 6 AM – 6 PM (Mon–Sun). Last slot start: 5:30 PM.
// Tier becomes a pricing/perks lever, not an access lever. Per-visit price
// drops as the tier rises — see TIER_VISIT_PRICE_CENTS in tier-gating.ts.
// Real constraint = phleb's actual calendar (live availability + buffers).
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
  { time: "2:00 PM", label: "2:00 - 2:30 PM" },
  { time: "2:30 PM", label: "2:30 - 3:00 PM" },
  { time: "3:00 PM", label: "3:00 - 3:30 PM" },
  { time: "3:30 PM", label: "3:30 - 4:00 PM" },
  { time: "4:00 PM", label: "4:00 - 4:30 PM" },
  { time: "4:30 PM", label: "4:30 - 5:00 PM" },
  { time: "5:00 PM", label: "5:00 - 5:30 PM" },
  { time: "5:30 PM", label: "5:30 - 6:00 PM" },
];

// Routine blood draws — now match non-fasting non-member window (9am-1:30pm)
const routineWindows = allDayWindows.filter(w => {
  const hour = parseInt(w.time);
  const isPM = w.time.includes('PM');
  const hour24 = isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour);
  // 9:00 .. 13:30 (last slot start 1:30 PM)
  if (hour24 < 9) return false;
  if (hour24 < 13) return true;
  if (hour24 === 13 && w.time.startsWith('1:30')) return true;
  return false;
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

// Services that use routine hours (9am-1:30pm) — FORCES isFasting=false at the slot level
const ROUTINE_SERVICES = ['routine-blood-draw'];
// Services that require fasting — FORCES isFasting=true at the slot level,
// so slot-gating uses fastingRanges instead of the pre-9am heuristic
const FASTING_SERVICES = ['fasting-blood-draw'];
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
  // Tier-unlock dialog state. Clicking a tier-locked slot opens this with
  // the required tier + upgrade CTA, instead of silently greying the slot out.
  // Hormozi: every "no" is a revenue conversation if framed right.
  const [unlockSlot, setUnlockSlot] = useState<{ time: string; requiredTier?: MemberTier; reason?: string } | null>(null);
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
  const isFastingService = FASTING_SERVICES.includes(selectedService || '');

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

  // Lab destination — synced bidirectionally with form's labOrder.labDestination
  // (the same field set on step 6's LabDestinationSelector). Pre-asking it here
  // lets the slot grid expose AdventHealth's afternoon hours immediately and
  // hide non-bookable post-cutoff slots for LabCorp / Quest.
  const labDestination = methods.watch('labOrder.labDestination' as any) as string | undefined;
  const isAdventHealth = labDestination === 'adventhealth';
  const isLabCorp = labDestination === 'labcorp' || labDestination === 'labcorp_extended';
  const isQuest = labDestination === 'quest' || labDestination === 'quest_diagnostics';
  const destinationPicked = !!labDestination && labDestination !== 'pending-doctor-confirmation';

  // Choose windows based on service type + after-hours toggle + destination.
  // AdventHealth → full grid (6 AM – 5:30 PM, 7 days). LabCorp/Quest → cap by cutoff.
  // Unspecified → only show the universal subset (6 AM – 1:30 PM) so we never
  // show a slot that won't actually work post-checkout.
  let baseWindows = isWeekend
    ? weekendWindows
    : isRoutine
    ? routineWindows
    : allDayWindows;

  // Filter to lab-cutoff for LabCorp / Quest
  if (isLabCorp || isQuest) {
    const cutoffMin = isLabCorp ? (12 * 60 + 30) : (13 * 60 + 30);
    baseWindows = baseWindows.filter(w => {
      const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(w.time);
      if (!m) return true;
      let h = parseInt(m[1], 10); const mm = parseInt(m[2], 10);
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
      return h * 60 + mm <= cutoffMin;
    });
  }
  // No destination picked yet → cap at 1:30 PM (universal — works for all labs).
  if (!destinationPicked) {
    baseWindows = baseWindows.filter(w => {
      const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(w.time);
      if (!m) return true;
      let h = parseInt(m[1], 10); const mm = parseInt(m[2], 10);
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
      return h * 60 + mm <= (13 * 60 + 30);
    });
  }

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
        {/* Lab destination picker — surfaced here so the slot grid can adjust
            in real time. AdventHealth opens the afternoon. LabCorp / Quest cap
            at their drop-off cutoff. "Not sure" shows the universal subset. */}
        <div className="bg-gradient-to-br from-gray-50 to-blue-50 border border-gray-200 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-gray-700">Where will your specimen go?</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'adventhealth', label: 'AdventHealth', sub: '24/7 — full hours' },
              { id: 'labcorp', label: 'LabCorp', sub: 'Closes 2:30 PM' },
              { id: 'quest', label: 'Quest', sub: 'Closes 3:30 PM' },
              { id: 'pending-doctor-confirmation', label: 'Not sure yet', sub: '6 AM – 1:30 PM' },
            ].map(opt => {
              const selected = labDestination === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => methods.setValue('labOrder.labDestination' as any, opt.id, { shouldDirty: true })}
                  className={`text-left rounded-lg border-2 p-3 min-h-[60px] active:scale-[0.98] transition ${
                    selected
                      ? 'bg-white border-[#B91C1C] shadow-sm'
                      : 'bg-white border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <div className={`text-sm font-semibold leading-tight ${selected ? 'text-[#B91C1C]' : 'text-gray-900'}`}>{opt.label}</div>
                  <div className="text-[11px] text-gray-500 mt-1 leading-tight">{opt.sub}</div>
                </button>
              );
            })}
          </div>
          {!destinationPicked && (
            <p className="text-xs text-gray-600 mt-2 leading-snug">
              Pick a lab so we can show all hours that work. AdventHealth deliveries unlock our afternoon slots up to 6 PM.
            </p>
          )}
          {isAdventHealth && (
            <p className="text-xs text-emerald-700 mt-2 font-medium leading-snug">
              ✓ AdventHealth — afternoon hours unlocked, 7 days a week.
            </p>
          )}
        </div>

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
                            while (prev >= today && (isHoliday(prev) || isBlockedByAdmin(prev, blockedDates))) prev = subDays(prev, 1);
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
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2">
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
                        // same server-side rules (bookingWindows.ts).
                        // Tier-locked slots render differently from "booked" or
                        // "past" — they're CLICKABLE and open an unlock dialog,
                        // because they represent revenue upside (membership upsell).
                        let tierLocked = false;
                        let tierReason: string | undefined;
                        let tierUnlockTier: MemberTier | undefined;
                        // AdventHealth bypasses tier gating — the lab is 24/7
                        // and the destination handles operational routing.
                        if (selectedDate && !isAdventHealth) {
                          const hhmm = normalizeTime(window.time);
                          if (hhmm) {
                            const dateIso = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
                            const isFasting = isFastingService
                              ? true
                              : isRoutine
                              ? false
                              : hhmm < '09:00';
                            const check = isBookingAllowed({ tier: patientTier, dateIso, time: window.time, isFasting });
                            if (!check.allowed) {
                              tierLocked = true;
                              tierReason = check.upgradeCTA?.message || check.reason || 'Not available in your tier';
                              tierUnlockTier = check.upgradeCTA?.toTier;
                            }
                          }
                        }
                        // isUnavailable = truly disabled (booked/held/past). Tier-locked is a SEPARATE state.
                        const isUnavailable = isBooked || isHeldByOther || isPastOrTooSoon;

                        // Tier-locked tier-specific styling
                        const lockColor = tierUnlockTier === 'concierge' ? 'purple' : tierUnlockTier === 'vip' ? 'red' : 'amber';
                        const lockClasses = lockColor === 'purple'
                          ? 'bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100 hover:border-purple-400'
                          : lockColor === 'red'
                          ? 'bg-red-50 text-red-900 border-red-300 hover:bg-red-100 hover:border-red-400'
                          : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 hover:border-amber-400';

                        return (
                          <button
                            key={window.time}
                            type="button"
                            title={tierLocked ? (tierReason || `Unlock with ${(tierUnlockTier || '').toUpperCase()}`) : isBooked ? 'Already booked' : isHeldByOther ? 'Being booked by someone else' : isPastOrTooSoon ? 'Too soon for same-day' : ''}
                            className={`rounded-lg border text-center py-3 px-1 text-sm font-medium transition-all min-h-[48px] active:scale-95 ${
                              isUnavailable
                                ? 'bg-gray-50 text-gray-300 line-through cursor-not-allowed border-gray-100'
                                : tierLocked
                                ? `${lockClasses} cursor-pointer`
                                : isSelected
                                ? 'bg-[#B91C1C] text-white border-[#B91C1C] shadow-md scale-[1.02]'
                                : isAfterHours
                                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-400 hover:shadow-sm'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-[#B91C1C]/50 hover:shadow-sm'
                            }`}
                            onClick={async () => {
                              if (isUnavailable) return;
                              if (tierLocked) {
                                setUnlockSlot({ time: window.time, requiredTier: tierUnlockTier, reason: tierReason });
                                return;
                              }

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
                            {tierLocked && (
                              <Lock className="inline h-3 w-3 mr-1 mb-0.5" />
                            )}
                            <span>{window.time}</span>
                            {tierLocked && tierUnlockTier && (
                              <span className="block text-[9px] font-semibold uppercase tracking-wider mt-0.5">
                                {tierUnlockTier === 'vip' ? 'VIP' : tierUnlockTier === 'concierge' ? 'Concierge' : 'Member'} only
                              </span>
                            )}
                            {isAfterHours && !isUnavailable && !tierLocked && (
                              <span className="block text-[9px] opacity-70 mt-0.5">+$50</span>
                            )}
                            {isSameDay && !isAfterHours && !isUnavailable && !tierLocked && (
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

                  {/* After-hours toggle removed 2026-04-25 — business hours
                      simplified to 6 AM – 6 PM Mon–Sun for all tiers. */}

                  {/* Persistent waitlist escape — surfaced on every date so
                      patients who can't find a time can still leave a lead.
                      Without this, the JoinWaitlistButton only appeared
                      inside the tier-unlock modal which (post-uniform-hours)
                      almost never opens. */}
                  {selectedDate && (
                    <div className="mt-3 text-center">
                      <JoinWaitlistButton
                        dateIso={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`}
                        desiredTime={field.value || undefined}
                        variant="subtle"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">
                        Don't see a time that works? We'll text you when one opens up.
                      </p>
                    </div>
                  )}

                  <FormDescription>
                    {isStat
                      ? "Next available within operating hours (+$100)"
                      : isSameDay
                      ? "Same-day booking (+$100 surcharge) · 90-min lead time"
                      : isRoutine
                      ? "Routine non-fasting hours: 9 AM – 1:30 PM (extended to 6 PM if AdventHealth is your destination)"
                      : "Open Mon–Sun · 6 AM – 1:30 PM (everyone) · 1:30–2:30 PM (VIP) · 1:30 PM – 6 PM (anyone, AdventHealth deliveries)"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
        
        <div className={`flex ${onBack ? 'justify-between' : 'justify-end'}`}>
          {onBack && (
            <Button type="button" variant="outline" onClick={onBack}>
              <ChevronLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          )}
          <Button
            type="button"
            onClick={() => {
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

      {/* Tier-unlock dialog — shown when a patient clicks a locked slot.
          Reuses ConveLabs's 3-tier structure + the Hormozi savings math.
          Primary CTA routes to /pricing?tier=X for upgrade flow. */}
      {unlockSlot && (() => {
        const tier = unlockSlot.requiredTier;
        const tierName = tier === 'concierge' ? 'Concierge' : tier === 'vip' ? 'VIP' : 'Member';
        const tierPrice = tier === 'concierge' ? 399 : tier === 'vip' ? 199 : 99;
        const tierPerVisit = tier === 'concierge' ? 99 : tier === 'vip' ? 115 : 130;
        const standardVisit = 150;
        const perVisitSavings = standardVisit - tierPerVisit;
        const color = tier === 'concierge' ? 'purple' : tier === 'vip' ? 'red' : 'amber';
        const colorBg = color === 'purple' ? 'bg-purple-50 border-purple-300'
          : color === 'red' ? 'bg-red-50 border-red-300'
          : 'bg-amber-50 border-amber-300';
        const colorAccent = color === 'purple' ? 'text-purple-700'
          : color === 'red' ? 'text-red-700'
          : 'text-amber-700';
        const colorBtn = color === 'purple' ? 'bg-purple-600 hover:bg-purple-700'
          : color === 'red' ? 'bg-red-600 hover:bg-red-700'
          : 'bg-amber-600 hover:bg-amber-700';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setUnlockSlot(null)}>
            <div className={`relative max-w-md w-full ${colorBg} border-2 rounded-xl p-6 shadow-xl`} onClick={e => e.stopPropagation()}>
              <button onClick={() => setUnlockSlot(null)} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
              <div className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${colorAccent} mb-2`}>
                <Sparkles className="h-4 w-4" /> {tierName} tier unlock
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                The <span className={colorAccent}>{unlockSlot.time}</span> slot opens up as a {tierName}
              </h3>
              <p className="text-sm text-gray-700 mb-4">
                {unlockSlot.reason || `${tierName} members book times outside the standard non-member window.`}
              </p>

              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">The math</p>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm text-gray-700">{tierName} membership</span>
                  <span className="text-lg font-bold text-gray-900">${tierPrice}<span className="text-xs font-normal text-gray-500">/yr</span></span>
                </div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm text-gray-700">Per-visit price</span>
                  <span className={`text-sm font-semibold ${colorAccent}`}>${tierPerVisit} <span className="text-xs text-gray-500">(save ${perVisitSavings} vs ${standardVisit})</span></span>
                </div>
                <div className="flex items-baseline justify-between pt-2 mt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-600">Break-even</span>
                  <span className="text-xs text-gray-700">after {Math.ceil(tierPrice / perVisitSavings)} visits</span>
                </div>
              </div>

              <div className="space-y-2">
                <a
                  href={`/pricing?tier=${tier || 'member'}`}
                  className={`${colorBtn} text-white font-semibold rounded-lg py-3 text-center text-sm block transition`}
                >
                  Become {tierName} for ${tierPrice}/yr — unlock now →
                </a>
                {/* Hormozi: every "no" is a conversation — but if they're ALREADY
                    a member they just need to prove it. Two proof paths:
                    (A) full login (slower but robust), (B) SMS OTP (faster,
                    matches dental-office UX — most members forgot password). */}
                <MemberOtpUnlockButton
                  tierName={tierName}
                  onVerified={(tier, email) => {
                    try {
                      sessionStorage.setItem('convelabs_member_verified', JSON.stringify({
                        tier, email, verified_at: Date.now(),
                      }));
                    } catch { /* noop */ }
                    setPatientTier(tier);
                    setUnlockSlot(null);
                    toast.success(`Welcome back! ${tier.toUpperCase()} slots unlocked.`);
                  }}
                />
                <a
                  href={`/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '/book-now')}`}
                  className="w-full block text-center text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg py-2 transition hover:bg-gray-50"
                >
                  Or sign in with password →
                </a>

                {/* Hormozi: don't lose the lead just because they won't upgrade.
                    The waitlist captures them for the 5 PM next-day unlock. */}
                {selectedDate && (
                  <JoinWaitlistButton
                    dateIso={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`}
                    desiredTime={unlockSlot.time}
                    requiredTier={tier}
                    variant="inline"
                  />
                )}

                <button
                  onClick={() => setUnlockSlot(null)}
                  className="w-full text-xs text-gray-600 hover:text-gray-800 py-2"
                >
                  Not now — pick a different time
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </Card>
  );
};

export default DateTimeSelectionStep;
