
import React from 'react';
import { format } from 'date-fns';
import { useFormContext } from 'react-hook-form';
import { 
  FormField, 
  FormItem, 
  FormControl, 
  FormLabel,
  FormMessage 
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, User, MapPin, Package } from 'lucide-react';
import { ChevronLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingFormValues } from "@/types/appointmentTypes";
import { toast } from "@/components/ui/sonner";

type BookingReviewStepProps = {
  onSubmit: () => void;
  onBack: () => void;
  isProcessing: boolean;
  showEstimatedArrival?: boolean;
  services: Array<{
    id: string;
    name: string;
    credits?: number | string;
    description: string;
  }>;
};

const BookingReviewStep: React.FC<BookingReviewStepProps> = ({ 
  onSubmit, 
  onBack,
  isProcessing,
  showEstimatedArrival = false,
  services 
}) => {
  const methods = useFormContext<BookingFormValues>();
  const { watch, setValue, getValues, formState: { errors } } = methods;
  
  const selectedDate = watch("date");
  const termsAccepted = watch("termsAccepted");
  
  const handleSubmit = () => {
    console.log("Form submission initiated");
    if (!termsAccepted) {
      toast.error("Please accept the terms and conditions");
      return;
    }
    
    // Call the onSubmit function passed from the parent
    onSubmit();
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
                {getValues("time") || "Not selected"}
              </p>
              {showEstimatedArrival && (
                <p>
                  <span className="text-gray-500">Phlebotomist:</span>{" "}
                  Will be assigned based on your location
                </p>
              )}
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-2 flex items-center">
              <User className="mr-2 h-4 w-4" /> Patient Information
            </h3>
            <div className="pl-6 space-y-1">
              <p>
                <span className="text-gray-500">Name:</span>{" "}
                {getValues("patientDetails.firstName") || ""}{" "}
                {getValues("patientDetails.lastName") || ""}
              </p>
              <p>
                <span className="text-gray-500">Phone:</span>{" "}
                {getValues("patientDetails.phone") || "Not provided"}
              </p>
              <p>
                <span className="text-gray-500">Email:</span>{" "}
                {getValues("patientDetails.email") || "Not provided"}
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
                {services.find(s => s.id === getValues("serviceDetails.selectedService"))?.name || "Not selected"}
              </p>
              {getValues("serviceDetails")?.fasting && (
                <p>
                  <span className="text-gray-500">Fasting Required:</span>{" "}
                  Yes
                </p>
              )}
              {getValues("serviceDetails.additionalNotes") && (
                <p>
                  <span className="text-gray-500">Notes:</span>{" "}
                  {getValues("serviceDetails.additionalNotes")}
                </p>
              )}
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-2 flex items-center">
              <MapPin className="mr-2 h-4 w-4" /> Location
            </h3>
            <div className="pl-6 space-y-1">
              <p>
                <span className="text-gray-500">Type:</span>{" "}
                {getValues("locationDetails")?.locationType === "home" ? "Home" : 
                 getValues("locationDetails")?.locationType === "office" ? "Office/Workplace" : "Other"}
              </p>
              <p>
                <span className="text-gray-500">Address:</span>{" "}
                {getValues("locationDetails.address")},{" "}
                {getValues("locationDetails.city")},{" "}
                {getValues("locationDetails.state")}{" "}
                {getValues("locationDetails.zipCode")}
              </p>
              {getValues("locationDetails.instructions") && (
                <p>
                  <span className="text-gray-500">Instructions:</span>{" "}
                  {getValues("locationDetails.instructions")}
                </p>
              )}
            </div>
          </div>
        </div>
        
        <FormField
          control={methods.control}
          name="termsAccepted"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value || false}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I agree to the <a href="/terms" className="text-primary hover:underline">terms and conditions</a> and <a href="/privacy" className="text-primary hover:underline">privacy policy</a>
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />
        
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isProcessing}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button 
            type="button" 
            onClick={handleSubmit}
            disabled={isProcessing || !termsAccepted}
            className="bg-primary hover:bg-primary-dark"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Confirm Appointment'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BookingReviewStep;
