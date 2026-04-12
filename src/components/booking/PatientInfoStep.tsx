
import React from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ArrowLeft, ArrowRight, UserPlus, X } from 'lucide-react';
import { useFormContext, useFieldArray } from 'react-hook-form';
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

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'additionalPatients',
  });
  
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
          
          {/* Additional Patients */}
          <div className="border-t pt-5 mt-2 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-sm">Additional Patients at Same Location</h3>
                <p className="text-xs text-muted-foreground">$75 per additional patient</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '' })}
              >
                <UserPlus className="h-4 w-4 mr-1" /> Add Patient
              </Button>
            </div>

            {fields.map((field, index) => (
              <Card key={field.id} className="p-4 bg-muted/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Patient {index + 2}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => remove(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.firstName`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...f} placeholder="First Name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.lastName`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...f} placeholder="Last Name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.email`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...f} placeholder="Email (optional)" type="email" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.phone`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...f} placeholder="Phone (optional)" type="tel" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </Card>
            ))}
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
