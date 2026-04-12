
import React from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
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
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { bookingFormSchema } from "@/types/appointmentTypes";

type DateTimeStepProps = {
  form: UseFormReturn<z.infer<typeof bookingFormSchema>>;
  onNext: () => void;
};

// Convelabs operating hours: Mon-Fri 6:00 AM - 1:30 PM
const timeSlots = [
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", 
  "11:00 AM", "12:00 PM", "1:00 PM"
];

const DateTimeStep: React.FC<DateTimeStepProps> = ({ form, onNext }) => {
  const selectedDate = form.watch("date");
  
  // Determine which time slots should be disabled based on Convelabs hours
  const isWeekend = selectedDate && (selectedDate.getDay() === 0 || selectedDate.getDay() === 6);
  const isSaturday = selectedDate && selectedDate.getDay() === 6;
  const isSunday = selectedDate && selectedDate.getDay() === 0;
  // Sunday: all disabled. Saturday: only 6-9 AM available
  const disabledTimeSlots = isSunday 
    ? timeSlots 
    : isSaturday 
      ? ["10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM"] 
      : [];
  
  // Get Current Date
  const today = new Date();
  
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
              control={form.control}
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
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
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
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Appointment Time</FormLabel>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {timeSlots.map((time) => {
                      const disabled = disabledTimeSlots.includes(time);
                      return (
                        <div key={time}>
                          <Button
                            type="button"
                            variant={field.value === time ? "default" : "outline"}
                            className={`w-full ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                            onClick={() => {
                              if (!disabled) {
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
                    {isSunday ? "Closed on Sundays" : isSaturday ? "Limited Saturday hours (6-9:45 AM)" : "Mon-Fri: 6:00 AM - 1:30 PM"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
        
        <div className="flex justify-end">
          <Button 
            type="button" 
            onClick={onNext}
            disabled={!selectedDate || !form.getValues("time")}
          >
            Continue <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DateTimeStep;
