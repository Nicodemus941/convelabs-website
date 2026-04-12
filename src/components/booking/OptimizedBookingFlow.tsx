
import React, { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { bookingFormSchema, BookingFormValues } from '@/types/appointmentTypes';
import { useAppointments } from '@/hooks/useAppointments';
import { Button } from '@/components/ui/button';
import { Loader2, Smartphone, Tablet } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

// Import step components - these will be lazy loaded
const ServiceSelectionStep = React.lazy(() => import('./ServiceSelectionStep'));
const DateTimeSelectionStep = React.lazy(() => import('./DateTimeSelectionStep'));
const PatientInfoStep = React.lazy(() => import('./PatientInfoStep'));
const LocationSelectionStep = React.lazy(() => import('./LocationSelectionStep'));
const BookingReviewStep = React.lazy(() => import('./BookingReviewStep'));
const BookingConfirmation = React.lazy(() => import('./BookingConfirmation'));

interface OptimizedBookingFlowProps {
  tenantId?: string;
}

enum BookingStep {
  Service = 0,
  DateTime = 1,
  PatientInfo = 2,
  Location = 3,
  Review = 4,
  Confirmation = 5
}

const OptimizedBookingFlow: React.FC<OptimizedBookingFlowProps> = ({ tenantId }) => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { createAppointment } = useAppointments();
  
  const [currentStep, setCurrentStep] = useState(BookingStep.Service);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [availableServices, setAvailableServices] = useState([]);
  const [isServicesLoading, setIsServicesLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Initialize form with default date
  const methods = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      date: undefined, // Important: Initialize as undefined so the calendar works correctly
      time: undefined,
      patientDetails: {
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        email: user?.email || '',
        phone: ''
      },
      serviceDetails: {
        selectedService: '',
        fasting: false,
        additionalNotes: ''
      },
      locationDetails: {
        locationType: 'home',
        address: '',
        city: '',
        state: 'FL', // Default to Florida
        zipCode: '',
        instructions: ''
      },
      termsAccepted: false
    }
  });
  
  // Add debugging logs
  React.useEffect(() => {
    console.log('OptimizedBookingFlow rendered', { 
      currentStep, 
      user, 
      formValues: methods.getValues() 
    });
  }, [currentStep, user]);
  
  // Check for mobile/tablet viewport
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch available services
  useEffect(() => {
    const fetchServices = async () => {
      setIsServicesLoading(true);
      try {
        // Simulate fetching services
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Example services - replace with actual API call
        const mockServices = [
          { id: 'basic', name: 'Basic Blood Panel', credits: 1, description: 'CBC, Basic Metabolic Panel' },
          { id: 'comprehensive', name: 'Comprehensive Panel', credits: 2, description: 'CBC, Comprehensive Metabolic Panel, Lipid Panel' },
          { id: 'hormone', name: 'Hormone Panel', credits: 3, description: 'Testosterone, Estrogen, Thyroid' },
        ];
        
        setAvailableServices(mockServices);
      } catch (error) {
        console.error('Failed to fetch services:', error);
        toast.error('Failed to load services. Please try again.');
      } finally {
        setIsServicesLoading(false);
      }
    };
    
    fetchServices();
  }, []);
  
  // Pre-fill user data if available
  useEffect(() => {
    if (user) {
      console.log('Setting user data in form:', user);
      methods.setValue('patientDetails.firstName', user.firstName || '');
      methods.setValue('patientDetails.lastName', user.lastName || '');
      methods.setValue('patientDetails.email', user.email || '');
    }
  }, [user, methods]);
  
  const handleNext = () => {
    console.log('Moving to next step from', currentStep);
    setCurrentStep(prev => prev + 1);
    // Scroll to top for mobile users
    window.scrollTo(0, 0);
  };
  
  const handleBack = () => {
    console.log('Moving to previous step from', currentStep);
    setCurrentStep(prev => prev - 1);
    // Scroll to top for mobile users
    window.scrollTo(0, 0);
  };
  
  const handleSubmit = async (data: BookingFormValues) => {
    try {
      console.log('Submitting booking form with data:', data);
      setIsProcessing(true);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Add mock appointment ID
      const mockAppointmentId = `APT-${Date.now()}`;
      setAppointmentId(mockAppointmentId);
      
      // Show success and move to confirmation
      setBookingComplete(true);
      setCurrentStep(BookingStep.Confirmation);
      toast.success('Appointment booked successfully!');
      
    } catch (error) {
      console.error('Error submitting booking:', error);
      toast.error(`Failed to book appointment: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Define the steps for the progress indicator
  const steps = ["Service", "Date & Time", "Patient Info", "Location", "Review"];
  
  if (!user) {
    return (
      <div className="w-full p-4 rounded-md border border-muted max-w-md mx-auto my-8">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Sign In Required</h3>
          <p className="text-muted-foreground mb-4">Please sign in to book an appointment</p>
          <Button asChild>
            <a href="/login?redirect=/book">Sign In</a>
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      {/* Device indicator - visible only in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-20 right-4 z-50 bg-primary text-white p-2 rounded-md opacity-50">
          <div className="md:hidden flex items-center">
            <Smartphone className="h-4 w-4 mr-1" /> Mobile
          </div>
          <div className="hidden md:flex lg:hidden items-center">
            <Tablet className="h-4 w-4 mr-1" /> Tablet
          </div>
          <div className="hidden lg:block">Desktop</div>
        </div>
      )}
      
      {!bookingComplete && (
        <div className="mb-6 mt-4">
          {isMobile ? (
            // Mobile step indicator
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                Step {currentStep + 1} of {steps.length}
              </div>
              <div className="text-sm font-medium">
                {steps[currentStep]}
              </div>
            </div>
          ) : (
            // Desktop progress steps
            <div className="flex justify-between items-center">
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
          )}
          
          <div className="h-2 bg-muted rounded-full mt-4 mb-6 overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300 ease-out rounded-full" 
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }} 
            />
          </div>
        </div>
      )}
      
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-6">
          {isServicesLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Loading booking system...</p>
            </div>
          ) : (
            <React.Suspense fallback={
              <div className="flex justify-center items-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            }>
              {/* Add debug logging here but not as JSX */}
              {(() => {
                console.log('Rendering step:', BookingStep[currentStep]);
                return null;
              })()}
              
              {currentStep === BookingStep.Service && (
                <ServiceSelectionStep 
                  services={availableServices}
                  onNext={handleNext}
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
            </React.Suspense>
          )}
        </form>
      </FormProvider>
    </div>
  );
};

export default OptimizedBookingFlow;
