
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { bookingFormSchema } from "@/types/appointmentTypes";
import { Form } from "@/components/ui/form";
import TenantDateTimeStep from "./TenantDateTimeStep";
import TenantServiceStep from "./TenantServiceStep";
import PatientInfoStep from "@/components/appointments/PatientInfoStep";
import TenantReviewStep from "./TenantReviewStep";
import { toast } from "@/components/ui/sonner";
import { useTenant } from "@/contexts/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ensureDate } from "@/services/appointments/appointmentMappers";

interface TenantBookingFlowProps {
  onAppointmentCreated?: () => void;
}

enum BookingStep {
  DateTime = 0,
  Service = 1,
  PatientInfo = 2,
  Review = 3,
  Confirmation = 4,
}

const steps = [
  "Date & Time",
  "Service",
  "Patient Info",
  "Review",
];

const TenantBookingFlow: React.FC<TenantBookingFlowProps> = ({ onAppointmentCreated }) => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<BookingStep>(BookingStep.DateTime);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof bookingFormSchema>>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      date: undefined,
      time: "",
      patientDetails: {
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
        email: user?.email || "",
        phone: "",
        dateOfBirth: undefined,
      },
      serviceDetails: {
        selectedService: "",
        fasting: false,
        additionalNotes: "",
      },
      locationDetails: {
        locationType: "home",
        address: "",
        city: "",
        state: "",
        zipCode: "",
        instructions: "",
      },
      termsAccepted: false,
    },
  });

  const handleNext = () => {
    setCurrentStep((prev) => (prev < BookingStep.Confirmation ? prev + 1 : prev));
  };

  const handleBack = () => {
    setCurrentStep((prev) => (prev > BookingStep.DateTime ? prev - 1 : prev));
  };

  const onSubmit = async (data: z.infer<typeof bookingFormSchema>) => {
    try {
      setIsSubmitting(true);

      // Format the appointment date and time
      const appointmentTime = data.time;
      const appointmentDate = ensureDate(data.date);
      
      if (!appointmentDate) {
        throw new Error("Invalid appointment date");
      }
      
      // Parse time (e.g., "1:00 PM")
      const [hours, minutes] = appointmentTime.replace(/\s(AM|PM)/, "").split(":");
      let hoursNum = parseInt(hours);
      
      // Convert 12-hour format to 24-hour format
      if (appointmentTime.includes("PM") && hoursNum < 12) {
        hoursNum += 12;
      } else if (appointmentTime.includes("AM") && hoursNum === 12) {
        hoursNum = 0;
      }
      
      // Set the hours and minutes on the appointment date
      appointmentDate.setHours(hoursNum);
      appointmentDate.setMinutes(parseInt(minutes || "0"));
      
      // Create appointment record in the database
      const { data: appointment, error } = await supabase
        .from("appointments")
        .insert({
          patient_id: user?.id,
          tenant_id: currentTenant?.id,
          appointment_date: appointmentDate.toISOString(),
          address: `${data.locationDetails.address}, ${data.locationDetails.city}, ${data.locationDetails.state} ${data.locationDetails.zipCode}`,
          zipcode: data.locationDetails.zipCode,
          status: "scheduled",
          notes: data.serviceDetails.additionalNotes,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Save the appointment ID
      setAppointmentId(appointment.id);
      
      // Send confirmation email
      try {
        const { data: notificationData, error: notificationError } = await supabase.functions.invoke(
          'send-tenant-appointment-notification',
          {
            body: {
              appointmentId: appointment.id,
              notificationType: 'confirmation'
            }
          }
        );
        
        if (notificationError) {
          console.error("Error sending appointment notification:", notificationError);
          // Continue anyway - don't block the booking process
        } else {
          console.log("Appointment notification sent successfully:", notificationData);
        }
      } catch (notificationErr) {
        console.error("Exception sending appointment notification:", notificationErr);
        // Continue anyway - don't block the booking process
      }
      
      setBookingComplete(true);
      
      // Move to confirmation step
      setCurrentStep(BookingStep.Confirmation);
      
      // Show success toast
      toast.success("Appointment booked successfully!");
      
      // Call the callback if provided
      if (onAppointmentCreated) {
        onAppointmentCreated();
      }
    } catch (error) {
      console.error("Error booking appointment:", error);
      toast.error("Failed to book appointment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          {steps.map((step, index) => (
            <div
              key={step}
              className={`flex items-center ${
                index < steps.length - 1 ? "flex-1" : ""
              }`}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  index <= currentStep
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {index + 1}
              </div>
              <div className="ml-2 text-sm font-medium">{step}</div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-px mx-4 ${
                    index < currentStep ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          {currentStep === BookingStep.DateTime && (
            <TenantDateTimeStep 
              tenant={currentTenant!} 
              form={form} 
              onNext={handleNext} 
            />
          )}

          {currentStep === BookingStep.Service && (
            <TenantServiceStep 
              tenant={currentTenant!} 
              form={form} 
              onNext={handleNext} 
            />
          )}

          {currentStep === BookingStep.PatientInfo && (
            <PatientInfoStep form={form} onNext={handleNext} onBack={handleBack} />
          )}

          {currentStep === BookingStep.Review && (
            <TenantReviewStep 
              tenant={currentTenant!} 
              form={form} 
              onPrevious={handleBack} 
              onSubmit={form.handleSubmit(onSubmit)}
              isSubmitting={isSubmitting}
            />
          )}

          {currentStep === BookingStep.Confirmation && bookingComplete && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <h2 className="text-2xl font-bold text-green-800 mb-4">Appointment Confirmed!</h2>
              <p className="mb-4">
                Your appointment with {currentTenant?.name} has been scheduled.
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Confirmation details have been sent to your email address.
              </p>
              {appointmentId && (
                <div className="text-sm bg-white p-3 rounded border mb-4">
                  Appointment Reference: <span className="font-mono">{appointmentId}</span>
                </div>
              )}
              <button
                type="button"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
                onClick={() => window.location.href = "/tenant-dashboard"}
              >
                Return to Dashboard
              </button>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
};

export default TenantBookingFlow;
