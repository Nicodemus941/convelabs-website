
import React from "react";
import { 
  FormField, 
  FormItem, 
  FormLabel, 
  FormControl, 
  FormMessage 
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { bookingFormSchema } from "@/types/appointmentTypes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup } from "@/components/ui/radio-group";
import AddOnOption from "./services/AddOnOption";
import ServiceCard from "./services/ServiceCard";
import { services, calculateTotalPrice } from "./services/PriceCalculator";

type ALaCarteServiceSelectionProps = {
  form: UseFormReturn<z.infer<typeof bookingFormSchema>>;
  onNext: () => void;
  onBack: () => void;
};

const ALaCarteServiceSelection: React.FC<ALaCarteServiceSelectionProps> = ({ form, onNext, onBack }) => {
  const selectedService = form.watch("serviceDetails.selectedService");
  const serviceDetails = form.watch("serviceDetails");
  const sameDay = serviceDetails?.sameDay;
  const weekend = serviceDetails?.weekend;
  
  // Calculate total price based on selections
  const totalPrice = calculateTotalPrice(selectedService, sameDay, weekend);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Services</CardTitle>
        <CardDescription>Choose the lab service you need</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="bg-yellow-50 border-yellow-200">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700">
            À la carte services are paid at time of booking. No insurance billing is available.
          </AlertDescription>
        </Alert>
        
        <FormField
          control={form.control}
          name="serviceDetails.selectedService"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Service Type</FormLabel>
              <div className="space-y-4">
                <RadioGroup 
                  value={field.value} 
                  onValueChange={field.onChange}
                  className="grid grid-cols-1 gap-4"
                >
                  {services.map((service) => (
                    <ServiceCard 
                      key={service.id}
                      id={service.id}
                      name={service.name}
                      price={service.price}
                      description={service.description}
                      isSelected={selectedService === service.id}
                    />
                  ))}
                </RadioGroup>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="space-y-4">
          <FormLabel>Add-ons (Optional)</FormLabel>
          
          <AddOnOption 
            form={form}
            name="serviceDetails.sameDay"
            label="Same-Day Appointment"
            description="Book an appointment for the same day (subject to availability)"
            price={50}
          />
          
          <AddOnOption 
            form={form}
            name="serviceDetails.weekend"
            label="Weekend / After-Hours"
            description="Service outside regular hours (not available for à la carte bookings)"
            price={75}
          />
        </div>
        
        <FormField
          control={form.control}
          name="serviceDetails.additionalNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Special Instructions (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Any special instructions for this lab test..."
                  className="resize-none"
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="border-t pt-4 mt-6">
          <div className="flex justify-between items-center text-lg font-semibold">
            <span>Total Price:</span>
            <span>${totalPrice}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Payment will be processed at checkout
          </p>
        </div>
        
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button type="button" onClick={onNext}>
            Continue <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ALaCarteServiceSelection;
