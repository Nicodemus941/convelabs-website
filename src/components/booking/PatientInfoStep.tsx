
import React from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ArrowLeft, ArrowRight } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { BookingFormValues } from '@/types/appointmentTypes';

interface PatientInfoStepProps {
  onNext: () => void;
  onBack: () => void;
}

const PatientInfoStep: React.FC<PatientInfoStepProps> = ({ 
  onNext, 
  onBack 
}) => {
  const { control, watch, setValue } = useFormContext<BookingFormValues>();
  const dateOfBirth = watch('patientDetails.dateOfBirth');
  
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="space-y-5">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold">Patient Information</h2>
            <p className="text-muted-foreground text-sm md:text-base mt-1">
              Please provide the patient's details
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={control}
                name="patientDetails.firstName"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-2">
                    <label className="text-sm font-medium">First Name</label>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="John"
                      />
                    </FormControl>
                    {fieldState.error && (
                      <FormMessage>
                        {fieldState.error.message}
                      </FormMessage>
                    )}
                  </FormItem>
                )}
              />
              
              <FormField
                control={control}
                name="patientDetails.lastName"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-2">
                    <label className="text-sm font-medium">Last Name</label>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Doe"
                      />
                    </FormControl>
                    {fieldState.error && (
                      <FormMessage>
                        {fieldState.error.message}
                      </FormMessage>
                    )}
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={control}
                name="patientDetails.dateOfBirth"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-2">
                    <label className="text-sm font-medium">Date of Birth</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(new Date(field.value), "MMMM d, yyyy")
                            ) : (
                              <span>Select date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date()}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    {fieldState.error && (
                      <FormMessage>
                        {fieldState.error.message}
                      </FormMessage>
                    )}
                  </FormItem>
                )}
              />
              
              <FormField
                control={control}
                name="patientDetails.phone"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-2">
                    <label className="text-sm font-medium">Phone Number</label>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="(555) 123-4567"
                        type="tel"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      We'll text you 30 minutes before arrival
                    </p>
                    {fieldState.error && (
                      <FormMessage>
                        {fieldState.error.message}
                      </FormMessage>
                    )}
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={control}
              name="patientDetails.email"
              render={({ field, fieldState }) => (
                <FormItem className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="john@example.com"
                      type="email"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    For appointment confirmation and results notification
                  </p>
                  {fieldState.error && (
                    <FormMessage>
                      {fieldState.error.message}
                    </FormMessage>
                  )}
                </FormItem>
              )}
            />
          </div>
          
          <div className="flex justify-between pt-6 mt-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onBack}
              className="flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            <Button 
              type="button" 
              onClick={onNext}
              className="flex items-center"
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PatientInfoStep;
