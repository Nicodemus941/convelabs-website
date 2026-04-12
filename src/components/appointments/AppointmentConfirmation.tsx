
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, CalendarCheck, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";

type AppointmentConfirmationProps = {
  formData: any;
  services: Array<{
    id: string;
    name: string;
    credits: string | number;
    description: string;
  }>;
  showUpsell?: boolean;
};

const AppointmentConfirmation = ({ formData, services, showUpsell = false }: AppointmentConfirmationProps) => {
  const selectedService = services.find(service => service.id === formData?.serviceDetails?.selectedService);
  
  // Helper to format date from ISO string or Date object
  const formatDate = (date: string | Date | undefined) => {
    if (!date) return "Not specified";
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return format(dateObj, "EEEE, MMMM d, yyyy");
  };
  
  return (
    <div className="space-y-6">
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-green-100 p-3 mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Appointment Confirmed!</h2>
            <p className="text-green-700">
              Your appointment has been successfully scheduled.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appointment Details</CardTitle>
          <CardDescription>Your upcoming appointment information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
            <CalendarCheck className="h-5 w-5 text-gray-500" />
            <div>
              <p className="font-medium">
                {formatDate(formData?.appointmentDateISO || formData?.date)}
              </p>
              <p className="text-sm text-muted-foreground">
                {formData?.time || "Time not specified"}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-1">Patient</h3>
              <p className="text-sm">
                {formData?.patientDetails?.firstName} {formData?.patientDetails?.lastName}
              </p>
              <p className="text-sm text-muted-foreground">
                {formData?.patientDetails?.email}
              </p>
              <p className="text-sm text-muted-foreground">
                {formData?.patientDetails?.phone}
              </p>
            </div>
            
            <div>
              <h3 className="font-medium mb-1">Service</h3>
              <p className="text-sm">
                {selectedService?.name || formData?.serviceDetails?.selectedService || "Standard service"}
              </p>
              {formData?.serviceDetails?.fasting && (
                <p className="text-sm text-amber-600">Fasting Required</p>
              )}
              {formData?.serviceDetails?.additionalNotes && (
                <p className="text-sm text-muted-foreground">
                  Note: {formData.serviceDetails.additionalNotes}
                </p>
              )}
            </div>
          </div>
          
          <div>
            <h3 className="font-medium mb-1">Location</h3>
            <p className="text-sm">
              {formData?.locationDetails?.locationType === "home" ? "Home Visit" : 
               formData?.locationDetails?.locationType === "office" ? "Office Visit" : "Other Location"}
            </p>
            <p className="text-sm">
              {formData?.locationDetails?.address}, {formData?.locationDetails?.city}, {formData?.locationDetails?.state} {formData?.locationDetails?.zipCode}
            </p>
            {formData?.locationDetails?.instructions && (
              <p className="text-sm text-muted-foreground mt-1">
                Instructions: {formData.locationDetails.instructions}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      
      {showUpsell && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6 pb-6">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-center">Enjoyed your experience?</h3>
              <p className="text-blue-700 text-center">
                Upgrade to a membership within 48 hours, and we'll apply this visit toward your first month's fee!
              </p>
              <div className="flex justify-center mt-4">
                <Button asChild className="bg-conve-red hover:bg-conve-red/90">
                  <Link to="/pricing">
                    Apply Today & Save <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="flex justify-center">
        <Button asChild variant="outline">
          <Link to="/">
            Return to Home
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default AppointmentConfirmation;
