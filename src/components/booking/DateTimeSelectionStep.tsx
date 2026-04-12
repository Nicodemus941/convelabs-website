
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

interface DateTimeSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
  considerDistance?: boolean;
}

// Time slots
const timeSlots = [
  "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", 
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", 
  "4:00 PM", "5:00 PM"
];

const DateTimeSelectionStep: React.FC<DateTimeSelectionStepProps> = ({ onNext, onBack, considerDistance }) => {
  const methods = useFormContext<BookingFormValues>();
  const selectedDate = methods.watch("date");
  const selectedTime = methods.watch("time");
  
  // Debug logs
  useEffect(() => {
    console.log('DateTimeSelectionStep rendered', { 
      selectedDate, 
      selectedTime, 
      considerDistance,
      formValues: methods.getValues()
    });
  }, [selectedDate, selectedTime, considerDistance, methods]);
  
  // Determine which time slots should be disabled
  // For this example, we'll disable some slots on weekends
  const isWeekend = selectedDate && (selectedDate.getDay() === 0 || selectedDate.getDay() === 6);
  const disabledTimeSlots = isWeekend ? ["8:00 AM", "9:00 AM", "5:00 PM"] : [];
  
  // Get Current Date
  const today = new Date();
  
  // Check if both date and time are selected
  const canContinue = selectedDate && selectedTime;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Date & Time</CardTitle>
        <CardDescription>Choose when you'd like our phlebotomist to visit</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <FormField
              control={methods.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Appointment Date</FormLabel>
                  <Popover>
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
                            console.log('Date selected:', date);
                            field.onChange(date);
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
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {timeSlots.map((time) => {
                      const disabled = disabledTimeSlots.includes(time);
                      const isSelected = field.value === time;
                      
                      return (
                        <div key={time}>
                          <Button
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            className={`w-full ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                            onClick={() => {
                              if (!disabled) {
                                console.log('Time selected:', time);
                                field.onChange(time);
                              }
                            }}
                            disabled={disabled}
                          >
                            <Clock className="mr-2 h-4 w-4" /> {time}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <FormDescription>
                    {isWeekend ? "Limited weekend hours available" : "Full weekday availability"}
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
