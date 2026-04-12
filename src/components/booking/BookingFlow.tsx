
import React, { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { bookingFormSchema, BookingFormValues } from '@/types/appointmentTypes';
import { useAppointments } from '@/hooks/useAppointments';
import { useAvailableServices } from '@/hooks/useAvailableServices';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { geocodeAddress } from '@/services/geocodingService';
import { updateAppointmentChainUtil } from '@/services/phlebotomistAssignmentService';

// Import step components
import ServiceSelectionStep from './ServiceSelectionStep';
import DateTimeSelectionStep from './DateTimeSelectionStep';
import PatientInfoStep from './PatientInfoStep';
import LocationSelectionStep from './LocationSelectionStep';
import BookingReviewStep from './BookingReviewStep';
import BookingConfirmation from './BookingConfirmation';

interface BookingFlowProps {
  tenantId?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

enum BookingStep {
  Service = 0,
  DateTime = 1,
  PatientInfo = 2,
  Location = 3,
  Review = 4,
  Confirmation = 5
}

const BookingFlow: React.FC<BookingFlowProps> = ({ 
  tenantId, 
  onComplete, 
  onCancel 
}) => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { createAppointment } = useAppointments();
  const { getAllServiceOptions } = useAvailableServices();
  
  const [currentStep, setCurrentStep] = useState(BookingStep.Service);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [availableServices, setAvailableServices] = useState([]);
  const [isServicesLoading, setIsServicesLoading] = useState(true);
  
  // Initialize form
  const methods = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      date: new Date(),
      time: '',
      patientDetails: {
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        email: user?.email || '',
        phone: ''
      },
      serviceDetails: {
        selectedService: '',
        sameDay: false,
        weekend: false,
        fasting: false,
        duration: 10, // Default duration
        additionalNotes: ''
      },
      locationDetails: {
        locationType: 'home',
        address: '',
        city: '',
        state: 'FL', // Default to Florida
        zipCode: '',
        isHomeAddress: true,
        instructions: ''
      },
      termsAccepted: false
    }
  });
  
  // Fetch available services on component mount
  useEffect(() => {
    const fetchServices = async () => {
      setIsServicesLoading(true);
      const services = await getAllServiceOptions(true);
      setAvailableServices(services);
      setIsServicesLoading(false);
    };
    
    fetchServices();
  }, [getAllServiceOptions]);
  
  // Pre-fill user data if available
  useEffect(() => {
    if (user) {
      methods.setValue('patientDetails.firstName', user.firstName || '');
      methods.setValue('patientDetails.lastName', user.lastName || '');
      methods.setValue('patientDetails.email', user.email || '');
    }
  }, [user, methods]);
  
  const handleNext = () => {
    setCurrentStep(prev => prev + 1);
  };
  
  const handleBack = () => {
    setCurrentStep(prev => prev - 1);
  };
  
  const handleSubmit = async (data: BookingFormValues) => {
    try {
      setIsProcessing(true);
      
      // Ensure we're working with a proper Date object
      if (typeof data.date === 'string') {
        data.date = new Date(data.date);
      }
      
      // Geocode the address before saving
      const formattedAddress = `${data.locationDetails.address}, ${data.locationDetails.city}, ${data.locationDetails.state} ${data.locationDetails.zipCode}`;
      const coordinates = await geocodeAddress(formattedAddress, data.locationDetails.zipCode);
      
      // Add coordinates to the data
      let appointmentData = {
        ...data,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude
      };
      
      // Create the appointment
      const result = await createAppointment(appointmentData);
      
      if (result.success) {
        // If appointment created successfully, update the appointment chain
        if (result.appointmentId) {
          await updateAppointmentChainUtil(result.appointmentId);
        }
        
        setAppointmentId(result.appointmentId || null);
        setBookingComplete(true);
        setCurrentStep(BookingStep.Confirmation);
        toast.success(result.message || "Appointment booked successfully!");
        
        if (onComplete) {
          onComplete();
        }
      } else {
        toast.error(result.message || "Failed to book appointment. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting booking:", error);
      toast.error(`Failed to book appointment: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Define the steps for the progress indicator
  const steps = ["Service", "Date & Time", "Patient Info", "Location", "Review"];
  
  return (
    <div className="w-full max-w-4xl mx-auto">
      {!bookingComplete && (
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
                <div className="ml-2 text-sm font-medium hidden md:block">{step}</div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-4 hidden md:block ${
                      index < currentStep ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-6">
          {isServicesLoading && currentStep === BookingStep.Service && (
            <div className="flex justify-center items-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading services...</span>
            </div>
          )}
          
          {!isServicesLoading && currentStep === BookingStep.Service && (
            <ServiceSelectionStep 
              services={availableServices}
              onNext={handleNext}
              onCancel={onCancel}
            />
          )}
          
          {currentStep === BookingStep.DateTime && (
            <DateTimeSelectionStep 
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          
          {currentStep === BookingStep.PatientInfo && (
            <PatientInfoStep 
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          
          {currentStep === BookingStep.Location && (
            <LocationSelectionStep 
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          
          {currentStep === BookingStep.Review && (
            <BookingReviewStep 
              services={availableServices}
              onBack={handleBack}
              onSubmit={methods.handleSubmit(handleSubmit)} 
              isProcessing={isProcessing}
              showEstimatedArrival={true}
            />
          )}
          
          {currentStep === BookingStep.Confirmation && bookingComplete && (
            <BookingConfirmation 
              appointmentId={appointmentId}
              formData={methods.getValues()}
              services={availableServices}
              tenantName={currentTenant?.name || "ConveLabs"}
            />
          )}
        </form>
      </FormProvider>
    </div>
  );
};

export default BookingFlow;
