
import React from "react";
import { format, getDay } from "date-fns";
import { CalendarIcon, Clock, Info } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";

type ALaCarteDateTimeStepProps = {
  form: UseFormReturn<z.infer<typeof bookingFormSchema>>;
  onNext: () => void;
};

// Time slots for à la carte bookings (10:30 AM - 1:00 PM)
const timeSlots = [
  "10:30 AM", "11:00 AM", "11:30 AM", 
  "12:00 PM", "12:30 PM", "1:00 PM"
];

const ALaCarteDateTimeStep: React.FC<ALaCarteDateTimeStepProps> = ({ form, onNext }) => {
  const selectedDate = form.watch("date");
  
  // Function to check if a date is a weekend (Saturday or Sunday)
  const isWeekend = (date: Date) => {
    const day = getDay(date);
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
  };
  
  // Function to check if a date is not Monday-Wednesday (1, 2, 3)
  const isNotMondayToWednesday = (date: Date) => {
    const day = getDay(date);
    return !(day >= 1 && day <= 3); // Not Monday (1), Tuesday (2), or Wednesday (3)
  };
  
  // Function to determine if a date should be disabled
  const disableDate = (date: Date) => {
    // Disable dates in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Disable dates more than 30 days in the future
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    
    return date < today || 
           date > thirtyDaysLater ||
           isNotMondayToWednesday(date);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Date & Time</CardTitle>
        <CardDescription>
          À la carte appointments are available Monday-Wednesday from 10:30 AM to 1:00 PM
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-blue-700">
            Available exclusively for non-members. Bookings are limited to Monday–Wednesday from 10:30 AM–1:00 PM.
          </AlertDescription>
        </Alert>
        
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
                        onSelect={(date) => {
                          if (date) {
                            field.onChange(date);
                            // Reset time when date changes
                            form.setValue("time", "");
                          }
                        }}
                        disabled={disableDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Available Monday-Wednesday only, up to 30 days in advance
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
                    {timeSlots.map((time) => (
                      <div key={time}>
                        <Button
                          type="button"
                          variant={field.value === time ? "default" : "outline"}
                          className="w-full"
                          onClick={() => field.onChange(time)}
                        >
                          <Clock className="mr-2 h-4 w-4" /> {time}
                        </Button>
                      </div>
                    ))}
                  </div>
                  <FormDescription>
                    Available times: 10:30 AM - 1:00 PM
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

export default ALaCarteDateTimeStep;
