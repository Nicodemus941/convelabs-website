
import React from "react";
import { format } from "date-fns";
import { 
  FormField, 
  FormItem, 
  FormControl, 
  FormLabel,
  FormMessage 
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, User, Package, CreditCard, LoaderCircle } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { bookingFormSchema } from "@/types/appointmentTypes";

type ALaCarteReviewStepProps = {
  form: UseFormReturn<z.infer<typeof bookingFormSchema>>;
  onSubmit: () => void;
  onBack: () => void;
  isProcessing: boolean;
};

// Services map for display
const services = {
  "standard": { name: "Standard Blood Draw", price: 175 },
  "fasting": { name: "Fasting or STAT Draw", price: 195 },
  "specialty": { name: "Specialty Kit Processing", price: 225 },
  "therapeutic": { name: "Therapeutic Phlebotomy", price: 275 },
};

const ALaCarteReviewStep: React.FC<ALaCarteReviewStepProps> = ({ form, onSubmit, onBack, isProcessing }) => {
  const selectedDate = form.watch("date");
  const selectedService = form.watch("serviceDetails.selectedService");
  const serviceDetails = form.watch("serviceDetails");
  const sameDay = serviceDetails?.sameDay;
  const weekend = serviceDetails?.weekend;
  
  // Calculate total price
  const calculateTotalPrice = () => {
    let basePrice = 0;
    if (selectedService && services[selectedService as keyof typeof services]) {
      basePrice = services[selectedService as keyof typeof services].price;
    }
    
    if (sameDay) basePrice += 50;
    if (weekend) basePrice += 75;
    
    return basePrice;
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Confirm</CardTitle>
        <CardDescription>Please review your appointment details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-2 flex items-center">
              <CalendarIcon className="mr-2 h-4 w-4" /> Date & Time
            </h3>
            <div className="pl-6 space-y-1">
              <p>
                <span className="text-gray-500">Date:</span>{" "}
                {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Not selected"}
              </p>
              <p>
                <span className="text-gray-500">Time:</span>{" "}
                {form.getValues("time") || "Not selected"}
              </p>
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-2 flex items-center">
              <User className="mr-2 h-4 w-4" /> Patient Information
            </h3>
            <div className="pl-6 space-y-1">
              <p>
                <span className="text-gray-500">Name:</span>{" "}
                {form.getValues("patientDetails.firstName") || ""}{" "}
                {form.getValues("patientDetails.lastName") || ""}
              </p>
              <p>
                <span className="text-gray-500">Phone:</span>{" "}
                {form.getValues("patientDetails.phone") || "Not provided"}
              </p>
              <p>
                <span className="text-gray-500">Email:</span>{" "}
                {form.getValues("patientDetails.email") || "Not provided"}
              </p>
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-2 flex items-center">
              <Package className="mr-2 h-4 w-4" /> Service Details
            </h3>
            <div className="pl-6 space-y-1">
              <p>
                <span className="text-gray-500">Service:</span>{" "}
                {selectedService && services[selectedService as keyof typeof services]
                  ? services[selectedService as keyof typeof services].name
                  : "Not selected"}
              </p>
              <p>
                <span className="text-gray-500">Add-ons:</span>{" "}
                {sameDay || weekend ? (
                  <span>
                    {sameDay ? "Same-Day Appointment (+$50)" : ""}{sameDay && weekend ? ", " : ""}
                    {weekend ? "Weekend / After-Hours (+$75)" : ""}
                  </span>
                ) : (
                  "None"
                )}
              </p>
              {form.getValues("serviceDetails.additionalNotes") && (
                <p>
                  <span className="text-gray-500">Notes:</span>{" "}
                  {form.getValues("serviceDetails.additionalNotes")}
                </p>
              )}
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-2">Location</h3>
            <div className="pl-6 space-y-1">
              <p>
                <span className="text-gray-500">Type:</span>{" "}
                {form.getValues("locationDetails.locationType") === "home" ? "Home" : 
                 form.getValues("locationDetails.locationType") === "office" ? "Office/Workplace" : "Other"}
              </p>
              <p>
                <span className="text-gray-500">Address:</span>{" "}
                {form.getValues("locationDetails.address")},{" "}
                {form.getValues("locationDetails.city")},{" "}
                {form.getValues("locationDetails.state")}{" "}
                {form.getValues("locationDetails.zipCode")}
              </p>
              {form.getValues("locationDetails.instructions") && (
                <p>
                  <span className="text-gray-500">Instructions:</span>{" "}
                  {form.getValues("locationDetails.instructions")}
                </p>
              )}
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-2 flex items-center">
              <CreditCard className="mr-2 h-4 w-4" /> Payment
            </h3>
            <div className="pl-6 space-y-1">
              <p>
                <span className="text-gray-500">Total Amount:</span>{" "}
                <span className="font-semibold">${calculateTotalPrice()}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                You will be redirected to our secure payment processor to complete your booking.
              </p>
            </div>
          </div>
        </div>
        
        <FormField
          control={form.control}
          name="termsAccepted"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I agree to the <a href="/terms" className="text-conve-red hover:underline">terms and conditions</a> and <a href="/privacy" className="text-conve-red hover:underline">privacy policy</a>
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />
        
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button 
            type="button" 
            onClick={onSubmit}
            disabled={!form.getValues("termsAccepted") || isProcessing}
          >
            {isProcessing ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Proceed to Payment"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ALaCarteReviewStep;
