
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
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
        <AvailabilityMap selectedDate={selectedDate} />
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <FormField
              control={methods.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Appointment Date</FormLabel>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                        >
                          {field.value ? (
                            format(field.value, "MMMM d, yyyy")
                          ) : (
                            <span>Select a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
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
                          date > new Date(today.getFullYear(), today.getMonth() + 2, 0)
                        }
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
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
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {activeWindows.map((window) => {
                        const isSelected = field.value === window.time;

                        return (
                          <Button
                            key={window.time}
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            className="w-full text-[11px] sm:text-xs px-2 py-2 h-auto whitespace-nowrap"
                            onClick={() => {
                              field.onChange(window.time);
                            }}
                          >
                            <Clock className="mr-1 h-3 w-3 flex-shrink-0" />
                            {window.label}
                          </Button>
                        );
                      })}
                    </div>
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
