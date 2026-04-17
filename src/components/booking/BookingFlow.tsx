
import React, { useState, useEffect, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { bookingFormSchema, BookingFormValues } from '@/types/appointmentTypes';
import { useAvailableServices } from '@/hooks/useAvailableServices';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { calculateTotal, getServiceById } from '@/services/pricing/pricingService';
import { createAppointmentCheckoutSession } from '@/services/stripe/appointmentCheckout';
import { supabase } from '@/integrations/supabase/client';

// Step components
import VisitTypeSelector from './VisitTypeSelector';
import ServiceSelectionStep from './ServiceSelectionStep';
import DateTimeSelectionStep from './DateTimeSelectionStep';
import PatientInfoStep from './PatientInfoStep';
import LocationSelectionStep from './LocationSelectionStep';
import LabOrderUploadStep from './LabOrderUploadStep';
import CheckoutStep from './CheckoutStep';
import BookingConfirmation from './BookingConfirmation';
import BookingChatAssistant from './BookingChatAssistant';
import PriceEstimateBadge from './PriceEstimateBadge';
import BookingTrustBadges from './BookingTrustBadges';

interface BookingFlowProps {
  tenantId?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

enum BookingStep {
  VisitType = 0,
  ServiceAndDate = 1,
  PatientInfo = 2,
  LocationAndLabOrder = 3,
  Checkout = 4,
  Confirmation = 5,
}

const STEP_LABELS = ['Visit Type', 'Service & Date', 'Patient Info', 'Location', 'Checkout'];

const BookingFlow: React.FC<BookingFlowProps> = ({ tenantId, onComplete, onCancel }) => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { getAllServiceOptions } = useAvailableServices();

  const [currentStep, setCurrentStep] = useState(BookingStep.VisitType);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [availableServices, setAvailableServices] = useState([]);
  const [isServicesLoading, setIsServicesLoading] = useState(true);
  const [labOrderFiles, setLabOrderFiles] = useState<File[]>([]);
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  // Membership tier — detected in CheckoutStep via callback. MUST be at
  // this level so calculateTotal() in handleCheckout applies member pricing.
  // Prior bug: memberTier was local to CheckoutStep only, so the Stripe
  // amount was charged at full price even though the UI showed discounted.
  const [memberTier, setMemberTier] = useState<'none' | 'member' | 'vip' | 'concierge'>('none');
  // Sub-step within combined steps
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showLabOrder, setShowLabOrder] = useState(false);

  // Animation direction
  const prevStepRef = useRef(0);
  const direction = currentStep > prevStepRef.current ? 1 : -1;

  const methods = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      date: new Date(),
      time: '',
      patientDetails: {
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        email: user?.email || '',
        phone: '',
      },
      serviceDetails: {
        visitType: '',
        selectedService: '',
        sameDay: false,
        weekend: false,
        fasting: false,
        duration: 10,
        additionalNotes: '',
      },
      locationDetails: {
        locationType: 'home',
        address: '',
        city: '',
        state: 'FL',
        zipCode: '',
        isHomeAddress: true,
        instructions: '',
      },
      termsAccepted: false,
    },
  });

  useEffect(() => {
    let mounted = true;
    const fetchServices = async () => {
      setIsServicesLoading(true);
      try {
        const services = await getAllServiceOptions(true);
        if (mounted) setAvailableServices(services);
      } catch (err) {
        console.error('Failed to load services:', err);
      } finally {
        if (mounted) setIsServicesLoading(false);
      }
    };
    fetchServices();
    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill is handled by defaultValues (line 72-76) and the
  // "Booking for myself / someone else" toggle in PatientInfoStep.
  // We intentionally do NOT overwrite form fields here — doing so caused
  // the logged-in user's email to persist even when booking for another patient,
  // which sent notifications to the wrong person (HIPAA violation).

  const handleNext = () => {
    prevStepRef.current = currentStep;

    // Smart skip logic based on visit type
    if (currentStep === BookingStep.VisitType) {
      const vt = methods.getValues('serviceDetails.visitType') || '';
      // Provider partners skip service+date — go straight to Patient Info
      if (vt.startsWith('partner-')) {
        methods.setValue('serviceDetails.selectedService', vt);
        setCurrentStep(BookingStep.PatientInfo);
        return;
      }
      // Therapeutic and specialty-kit skip service selection
      if (['therapeutic', 'specialty-kit', 'in-office'].includes(vt)) {
        methods.setValue('serviceDetails.selectedService', vt);
      }
    }

    setCurrentStep(prev => prev + 1);
    setShowDatePicker(false);
    setShowLabOrder(false);
  };

  const handleBack = () => {
    prevStepRef.current = currentStep;
    const vt = methods.getValues('serviceDetails.visitType') || '';

    // If on Patient Info and was a provider partner, go back to Visit Type
    if (currentStep === BookingStep.PatientInfo && vt.startsWith('partner-')) {
      setCurrentStep(BookingStep.VisitType);
      return;
    }

    setCurrentStep(prev => prev - 1);
  };

  const handleCheckout = async (tipAmount: number) => {
    try {
      setIsProcessing(true);
      const data = methods.getValues();

      const visitType = data.serviceDetails.visitType || 'mobile';
      const service = getServiceById(visitType);
      const additionalPatientCount = (data.additionalPatients || []).length;
      const breakdown = calculateTotal(visitType, {
        sameDay: data.serviceDetails.sameDay,
        weekend: data.serviceDetails.weekend,
      }, tipAmount, additionalPatientCount, memberTier);

      // Upload lab order files and track paths
      const labOrderPaths: string[] = [];
      for (const file of labOrderFiles) {
        const fileName = `laborder_${Date.now()}_${file.name}`;
        const { error: uploadErr } = await supabase.storage.from('lab-orders').upload(fileName, file);
        if (uploadErr) console.error('Lab order upload error:', uploadErr);
        else labOrderPaths.push(fileName);
      }

      // Upload insurance file and track path + save to patient profile
      let insurancePath: string | null = null;
      if (insuranceFile) {
        const fileName = `insurance_${Date.now()}_${insuranceFile.name}`;
        const { error: uploadErr } = await supabase.storage.from('lab-orders').upload(fileName, insuranceFile);
        if (uploadErr) console.error('Insurance upload error:', uploadErr);
        else {
          insurancePath = fileName;
          // Save insurance card path to patient's profile for future bookings
          const patientEmail = data.patientDetails.email;
          if (patientEmail) {
            supabase.from('tenant_patients')
              .update({ insurance_card_path: fileName })
              .ilike('email', patientEmail)
              .then(({ error }) => { if (error) console.error('Insurance path save error:', error); });
          }
        }
      }

      const appointmentDate = data.date instanceof Date
        ? data.date.toISOString()
        : new Date(data.date).toISOString();

      // Apply referral discount if present (stored in additionalNotes by CheckoutStep)
      const notes = data.serviceDetails.additionalNotes || '';
      const referralMatch = notes.match(/Referral:.*-\$(\d+)/);
      const referralDiscount = referralMatch ? parseFloat(referralMatch[1]) : 0;
      // Bundle: patient prepays for additional future visits at a discount
      const bundleExtra = parseFloat(String((data as any).bundleExtra || 0)) || 0;
      const bundleCount = parseInt(String((data as any).bundleCount || 0), 10) || 0;
      const finalSubtotal = Math.max(breakdown.subtotal - referralDiscount + bundleExtra, 0);

      const result = await createAppointmentCheckoutSession({
        serviceType: visitType,
        serviceName: service?.name || 'Blood Draw Service',
        amount: Math.round(finalSubtotal * 100),
        tipAmount: Math.round(tipAmount * 100),
        appointmentDate,
        appointmentTime: data.time,
        memberTier, // server re-verifies and re-prices if mismatched
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
          aptUnit: data.locationDetails.aptUnit,
          gateCode: data.locationDetails.gateCode,
        },
        serviceDetails: {
          sameDay: data.serviceDetails.sameDay,
          weekend: data.serviceDetails.weekend,
          additionalNotes: [
            data.serviceDetails.additionalNotes,
            labOrderPaths.length > 0 ? `Lab orders: ${labOrderPaths.join(', ')}` : '',
            insurancePath ? `Insurance: ${insurancePath}` : '',
            bundleCount > 0 ? `BundleCount: ${bundleCount}` : '',
          ].filter(Boolean).join(' | '),
        },
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.url) {
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

  // Animation variants
  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  const totalSteps = STEP_LABELS.length;
  const progressPercent = Math.min(((currentStep) / (totalSteps - 1)) * 100, 100);

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 md:px-0">
      <FormProvider {...methods}>
        {/* Progress indicator — desktop */}
        {currentStep < BookingStep.Confirmation && (
          <>
            <div className="hidden md:flex justify-between items-center mb-6">
              {STEP_LABELS.map((step, index) => (
                <div key={step} className={`flex items-center ${index < STEP_LABELS.length - 1 ? 'flex-1' : ''}`}>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                    index <= currentStep
                      ? 'bg-conve-red text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {index + 1}
                  </div>
                  <div className={`ml-2 text-sm font-medium ${
                    index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
                  }`}>{step}</div>
                  {index < STEP_LABELS.length - 1 && (
                    <div className={`flex-1 h-px mx-4 transition-colors ${
                      index < currentStep ? 'bg-conve-red' : 'bg-muted'
                    }`} />
                  )}
                </div>
              ))}
              <div className="ml-4">
                <PriceEstimateBadge />
              </div>
            </div>

            {/* Progress indicator — mobile */}
            <div className="md:hidden mb-6 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Step {currentStep + 1} of {totalSteps}: {STEP_LABELS[currentStep]}
                </span>
                <PriceEstimateBadge />
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-conve-red h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <BookingTrustBadges />
          </>
        )}
        <form onSubmit={(e) => e.preventDefault()} className="mt-4">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              {/* Step 1: Visit Type */}
              {currentStep === BookingStep.VisitType && (
                <VisitTypeSelector onNext={handleNext} />
              )}

              {/* Step 2: Service & Date (combined) */}
              {currentStep === BookingStep.ServiceAndDate && (() => {
                const vt = methods.getValues('serviceDetails.visitType') || '';
                // These visit types skip service selection (we know what they're booking)
                const skipServiceSelection = ['specialty-kit', 'in-office', 'therapeutic'].includes(vt);

                if (skipServiceSelection && !showDatePicker) {
                  // Auto-set service to match visit type and go to date picker
                  if (!methods.getValues('serviceDetails.selectedService')) {
                    methods.setValue('serviceDetails.selectedService', vt);
                  }
                  return (
                    <DateTimeSelectionStep
                      onNext={handleNext}
                      onBack={() => { prevStepRef.current = currentStep; setCurrentStep(BookingStep.VisitType); }}
                    />
                  );
                }

                if (!showDatePicker) {
                  return (
                    <div>
                      {isServicesLoading ? (
                        <div className="flex justify-center items-center p-12">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <span className="ml-2">Loading services...</span>
                        </div>
                      ) : (
                        <ServiceSelectionStep
                          services={availableServices}
                          onNext={() => setShowDatePicker(true)}
                          onCancel={() => { prevStepRef.current = currentStep; setCurrentStep(BookingStep.VisitType); }}
                        />
                      )}
                    </div>
                  );
                }

                return (
                  <DateTimeSelectionStep
                    onNext={handleNext}
                    onBack={() => setShowDatePicker(false)}
                  />
                );
              })()}

              {/* Step 3: Patient Info */}
              {currentStep === BookingStep.PatientInfo && (
                <PatientInfoStep onNext={handleNext} onBack={handleBack} />
              )}

              {/* Step 4: Location & Lab Order (combined) */}
              {currentStep === BookingStep.LocationAndLabOrder && !showLabOrder && (
                <LocationSelectionStep
                  onNext={() => setShowLabOrder(true)}
                  onBack={handleBack}
                />
              )}

              {currentStep === BookingStep.LocationAndLabOrder && showLabOrder && (
                <LabOrderUploadStep
                  onNext={handleNext}
                  onBack={() => setShowLabOrder(false)}
                  onFilesSelected={setLabOrderFiles}
                  selectedFiles={labOrderFiles}
                  onInsuranceFileSelected={setInsuranceFile}
                  selectedInsuranceFile={insuranceFile}
                />
              )}

              {/* Step 5: Checkout */}
              {currentStep === BookingStep.Checkout && (
                <CheckoutStep
                  onBack={handleBack}
                  onCheckout={handleCheckout}
                  isProcessing={isProcessing}
                  onMemberTierDetected={setMemberTier}
                />
              )}

              {/* Confirmation */}
              {currentStep === BookingStep.Confirmation && bookingComplete && (
                <BookingConfirmation
                  appointmentId={appointmentId}
                  formData={methods.getValues()}
                  services={availableServices}
                  tenantName={currentTenant?.name || 'ConveLabs'}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </form>
      </FormProvider>

      {/* Floating AI chat */}
      {currentStep < BookingStep.Confirmation && (
        <BookingChatAssistant currentStep={currentStep} />
      )}
    </div>
  );
};

export default BookingFlow;
