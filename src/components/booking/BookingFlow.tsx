
import React, { useState, useEffect, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { bookingFormSchema, BookingFormValues } from '@/types/appointmentTypes';
import { useAvailableServices } from '@/hooks/useAvailableServices';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { calculateTotal, getServiceById } from '@/services/pricing/pricingService';
import { createAppointmentCheckoutSession } from '@/services/stripe/appointmentCheckout';
import { supabase } from '@/integrations/supabase/client';

// Import step components
import ServiceSelectionStep from './ServiceSelectionStep';
import DateTimeSelectionStep from './DateTimeSelectionStep';
import PatientInfoStep from './PatientInfoStep';
import LocationSelectionStep from './LocationSelectionStep';
import BookingReviewStep from './BookingReviewStep';
import CheckoutStep from './CheckoutStep';
import LabOrderUploadStep from './LabOrderUploadStep';
import BookingConfirmation from './BookingConfirmation';
import BookingChatAssistant from './BookingChatAssistant';

interface BookingFlowProps {
  tenantId?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

enum BookingStep {
  Service = 0,
  DateTime = 1,
  PatientInfo = 2,
  LabOrder = 3,
  Location = 4,
  Review = 5,
  Checkout = 6,
  Confirmation = 7
}

const BookingFlow: React.FC<BookingFlowProps> = ({
  tenantId,
  onComplete,
  onCancel
}) => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { getAllServiceOptions } = useAvailableServices();

  const [currentStep, setCurrentStep] = useState(BookingStep.Service);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [availableServices, setAvailableServices] = useState([]);
  const [isServicesLoading, setIsServicesLoading] = useState(true);
  const [labOrderFile, setLabOrderFile] = useState<File | null>(null);

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
        duration: 10,
        additionalNotes: ''
      },
      locationDetails: {
        locationType: 'home',
        address: '',
        city: '',
        state: 'FL',
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

  const handleCheckout = async (tipAmount: number) => {
    try {
      setIsProcessing(true);
      const data = methods.getValues();

      const serviceId = data.serviceDetails.selectedService;
      const service = getServiceById(serviceId);
      const breakdown = calculateTotal(serviceId, {
        sameDay: data.serviceDetails.sameDay,
        weekend: data.serviceDetails.weekend,
      }, tipAmount);

      // Upload lab order file if present
      let labOrderFilePath: string | undefined;
      if (labOrderFile) {
        const fileName = `${Date.now()}_${labOrderFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('lab-orders')
          .upload(fileName, labOrderFile);
        if (uploadError) {
          console.error('Lab order upload failed:', uploadError);
          // Non-blocking — continue without lab order
        } else {
          labOrderFilePath = fileName;
        }
      }

      // Build the appointment date string
      const appointmentDate = data.date instanceof Date
        ? data.date.toISOString()
        : new Date(data.date).toISOString();

      const result = await createAppointmentCheckoutSession({
        serviceType: serviceId,
        serviceName: service?.name || 'Blood Draw Service',
        amount: Math.round(breakdown.subtotal * 100), // convert to cents
        tipAmount: Math.round(tipAmount * 100), // convert to cents
        appointmentDate,
        appointmentTime: data.time,
        patientDetails: {
          firstName: data.patientDetails.firstName,
          lastName: data.patientDetails.lastName,
          email: data.patientDetails.email,
          phone: data.patientDetails.phone,
        },
        locationDetails: {
          address: data.locationDetails.address,
          city: data.locationDetails.city,
          state: data.locationDetails.state,
          zipCode: data.locationDetails.zipCode,
          locationType: data.locationDetails.locationType,
          instructions: data.locationDetails.instructions,
        },
        serviceDetails: {
          sameDay: data.serviceDetails.sameDay,
          weekend: data.serviceDetails.weekend,
          additionalNotes: data.serviceDetails.additionalNotes,
        },
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.url;
      } else {
        toast.error('Failed to create checkout session');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(`Checkout failed: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Define the steps for the progress indicator
  const steps = ['Service', 'Date & Time', 'Patient Info', 'Lab Order', 'Location', 'Review', 'Checkout'];

  return (
    <div className="w-full max-w-4xl mx-auto">
      {!bookingComplete && currentStep < BookingStep.Confirmation && (
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            {steps.map((step, index) => (
              <div
                key={step}
                className={`flex items-center ${
                  index < steps.length - 1 ? 'flex-1' : ''
                }`}
              >
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    index <= currentStep
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {index + 1}
                </div>
                <div className="ml-2 text-sm font-medium hidden md:block">{step}</div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-4 hidden md:block ${
                      index < currentStep ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <FormProvider {...methods}>
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
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

          {currentStep === BookingStep.LabOrder && (
            <LabOrderUploadStep
              onNext={handleNext}
              onBack={handleBack}
              onFileSelected={setLabOrderFile}
              selectedFile={labOrderFile}
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
              onSubmit={handleNext}
              isProcessing={false}
              showEstimatedArrival={true}
            />
          )}

          {currentStep === BookingStep.Checkout && (
            <CheckoutStep
              onBack={handleBack}
              onCheckout={handleCheckout}
              isProcessing={isProcessing}
            />
          )}

          {currentStep === BookingStep.Confirmation && bookingComplete && (
            <BookingConfirmation
              appointmentId={appointmentId}
              formData={methods.getValues()}
              services={availableServices}
              tenantName={currentTenant?.name || 'ConveLabs'}
            />
          )}
        </form>
      </FormProvider>
      {/* Floating AI chat assistant */}
      {currentStep < BookingStep.Confirmation && (
        <BookingChatAssistant currentStep={currentStep} />
      )}
    </div>
  );
};

export default BookingFlow;
