
import React from 'react';
import { useFormContext } from 'react-hook-form';
import { ArrowLeft, ArrowRight, Home, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingFormValues } from '@/types/appointmentTypes';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';

interface LocationSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
}

const LocationSelectionStep: React.FC<LocationSelectionStepProps> = ({ 
  onNext, 
  onBack 
}) => {
  const { control, watch, setValue } = useFormContext<BookingFormValues>();
  const locationType = watch('locationDetails.locationType');
  
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="space-y-5">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold">Service Location</h2>
            <p className="text-muted-foreground text-sm md:text-base mt-1">
              Where should our phlebotomist meet you?
            </p>
          </div>
          
          <div className="space-y-5">
            <div className="space-y-3">
              <label className="text-sm font-medium">Location Type</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant={locationType === 'home' ? "default" : "outline"}
                  className="flex-1 justify-start gap-2"
                  onClick={() => setValue('locationDetails.locationType', 'home')}
                >
                  <Home className="h-4 w-4" />
                  Home
                </Button>
                <Button
                  type="button"
                  variant={locationType === 'office' ? "default" : "outline"}
                  className="flex-1 justify-start gap-2"
                  onClick={() => setValue('locationDetails.locationType', 'office')}
                >
                  <Building className="h-4 w-4" />
                  Office/Workplace
                </Button>
              </div>
            </div>
            
            <div className="space-y-4 mt-2">
              <FormField
                control={control}
                name="locationDetails.address"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-2">
                    <label className="text-sm font-medium">Street Address</label>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="123 Main St." 
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
              
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={control}
                  name="locationDetails.city"
                  render={({ field, fieldState }) => (
                    <FormItem className="space-y-2">
                      <label className="text-sm font-medium">City</label>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Orlando" 
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
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">State</label>
                    <Select
                      value={watch('locationDetails.state')}
                      onValueChange={(value) => setValue('locationDetails.state', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="FL" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FL">FL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <FormField
                    control={control}
                    name="locationDetails.zipCode"
                    render={({ field, fieldState }) => (
                      <FormItem className="space-y-2">
                        <label className="text-sm font-medium">ZIP</label>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="32801" 
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
              </div>
              
              <div className="space-y-2 mt-2">
                <label className="text-sm font-medium">Special Instructions (Optional)</label>
                <Textarea 
                  {...control.register('locationDetails.instructions')} 
                  placeholder="Building access instructions, apartment number, etc."
                  className="resize-none"
                  rows={3}
                />
              </div>
            </div>
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
              Review
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LocationSelectionStep;
