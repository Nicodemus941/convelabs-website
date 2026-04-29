
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
import { calculateTotal, getServiceById, isExtendedArea } from '@/services/pricing/pricingService';
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
import SlotConflictModal from './SlotConflictModal';

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

// 7 markers, one per actual on-screen surface. Two of the BookingStep enum
// values map to two display markers each:
//   ServiceAndDate (1) → 'Service' (1) when !showDatePicker, 'Date & Time' (2) when showDatePicker
//   LocationAndLabOrder (3) → 'Address' (4) when !showLabOrder, 'Lab Order' (5) when showLabOrder
// Visit types that skip ServiceSelectionStep (specialty-kit / in-office /
// therapeutic) jump from display 0 to display 2 directly.
const STEP_LABELS = ['Visit Type', 'Service', 'Date & Time', 'Patient Info', 'Address', 'Lab Order', 'Checkout'];

/**
 * Compute the display marker index (0..6) from the internal step state.
 * Keeps progress UI honest with the actual screen the patient is looking at.
 */
function computeDisplayStep(
  step: number,
  showDatePicker: boolean,
  showLabOrder: boolean,
  visitType: string | undefined,
): number {
  if (step === 0) return 0; // Visit Type
  if (step === 1) {
    // Skipped service selection? Always at "Date & Time"
    const skipsService = ['specialty-kit', 'in-office', 'therapeutic'].includes(visitType || '');
    if (skipsService) return 2;
    return showDatePicker ? 2 : 1; // Service vs Date & Time
  }
  if (step === 2) return 3; // Patient Info
  if (step === 3) return showLabOrder ? 5 : 4; // Address vs Lab Order
  if (step === 4) return 6; // Checkout
  return 6;
}

const BookingFlow: React.FC<BookingFlowProps> = ({ tenantId, onComplete, onCancel }) => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { getAllServiceOptions } = useAvailableServices();

  // Patient lands at the beginning of the wizard (VisitTypeSelector).
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
  // Bundled membership subscription (if patient picked "Add VIP" at checkout).
  // When present, BookingFlow forwards it to create-appointment-checkout so
  // Stripe creates a subscription session that combines the visit + annual fee.
  const [bundledSubscription, setBundledSubscription] = useState<{
    planName: 'Regular' | 'VIP' | 'Concierge';
    annualPriceCents: number;
    agreementId: string;
    memberTierAfter: 'member' | 'vip' | 'concierge';
  } | null>(null);
  // Sub-step within combined steps
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showLabOrder, setShowLabOrder] = useState(false);

  // Slot-conflict modal state. Fires when create-appointment-checkout returns
  // 409 slot_unavailable. Hormozi: never let a buyer leave empty-handed —
  // surface 3 closest open times, allow inline retry, fall back to waitlist.
  const [conflictModal, setConflictModal] = useState<{
    open: boolean;
    originalDate: string;
    originalTime: string;
    suggestedSlots: { time: string }[];
    retrying: boolean;
  }>({ open: false, originalDate: '', originalTime: '', suggestedSlots: [], retrying: false });

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

  // EXCEPTION: admin-initiated "book for this patient" flow stores a prefill
  // blob in sessionStorage ('convelabs_admin_prefill_patient') that we DO
  // want to consume on mount — because the whole point is to save the admin
  // from retyping the patient's info. Consumed once, then cleared to avoid
  // leaking to a subsequent booking session.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('convelabs_admin_prefill_patient');
      if (!raw) return;
      const p = JSON.parse(raw);
      methods.reset({
        ...methods.getValues(),
        patientDetails: {
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          email: p.email || '',
          phone: p.phone || '',
        },
        locationDetails: {
          ...methods.getValues().locationDetails,
          address: p.address || '',
          city: p.city || '',
          state: p.state || 'FL',
          zipCode: p.zipCode || '',
          gateCode: p.gateCode || '',
        },
      });
      sessionStorage.removeItem('convelabs_admin_prefill_patient');
    } catch (e) {
      console.warn('[admin prefill] failed to consume:', e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = () => {
    prevStepRef.current = currentStep;

    // Smart skip logic based on visit type
    if (currentStep === BookingStep.VisitType) {
      const vt = methods.getValues('serviceDetails.visitType') || '';
      // BUG FIX 2026-04-20: provider-partner visits used to skip the date
      // picker entirely (jumping straight to PatientInfo) — under the
      // assumption that the provider pre-scheduled the visit. But regular
      // web patients picking a provider-partner on the public booking page
      // still need to pick a date + time like any other visit type. The
      // truly pre-scheduled flow uses /lab-request/:token, not this page.
      //
      // So: partner visits now auto-set service to the partner and continue
      // to ServiceAndDate, just like every other visit type.
      if (vt.startsWith('partner-')) {
        methods.setValue('serviceDetails.selectedService', vt);
      }
      // Therapeutic and specialty-kit skip service selection (not date picker)
      if (['therapeutic', 'specialty-kit', 'in-office'].includes(vt)) {
        methods.setValue('serviceDetails.selectedService', vt);
      }
    }

    setCurrentStep(prev => prev + 1);
    setShowDatePicker(false);
    setShowLabOrder(false);
  };

  // Service types that don't need a patient-uploaded lab order. The
  // doctor's office service is already in-clinic. Partner-org services
  // route the order through the partnered practice, not the patient.
  const NO_LAB_ORDER_SERVICES = [
    'in-office',
    'partner-nd-wellness',
    'partner-naturamed',
    'partner-aristotle-education',
  ];
  const skipsLabOrder = (visitType: string | undefined) =>
    NO_LAB_ORDER_SERVICES.includes(visitType || '');

  const handleBack = () => {
    prevStepRef.current = currentStep;
    const target = currentStep - 1;
    // Restore the SECOND sub-screen of any combined step we're walking back
    // into — the patient was last on the date picker (not the service tile)
    // and was last on the lab-order step (not the address step). Without this,
    // hitting Back from PatientInfo dumps them on Service, not Date & Time,
    // which feels like the back button is broken.
    if (target === BookingStep.ServiceAndDate) setShowDatePicker(true);
    if (target === BookingStep.LocationAndLabOrder) {
      // Don't restore showLabOrder if the service type doesn't need one
      const vt = methods.getValues('serviceDetails.visitType') || '';
      setShowLabOrder(!skipsLabOrder(vt));
    }
    setCurrentStep(target);
  };

  // Remember the last checkout args so the SlotConflictModal can replay
  // them with a different time without losing tip + promo state.
  const lastCheckoutArgsRef = useRef<{ tipAmount: number; promoCode: string | null }>({ tipAmount: 0, promoCode: null });

  const handleCheckout = async (tipAmount: number, promoCode?: string | null) => {
    lastCheckoutArgsRef.current = { tipAmount, promoCode: promoCode || null };
    try {
      setIsProcessing(true);
      const data = methods.getValues();

      // Hard-fail if date or time is missing/invalid. Caused the "NaN-NaN-NaN"
      // date that patients saw on the checkout summary after the OCR
      // fasting→routine auto-switch cleared the date. Better to push them
      // back to the date picker than send a bogus appointment to Stripe.
      const rawDate = (data as any).date;
      const dateObj = rawDate instanceof Date ? rawDate : (rawDate ? new Date(rawDate) : null);
      const dateValid = dateObj && !isNaN(dateObj.getTime());
      if (!dateValid || !data.time || String(data.time).trim().length === 0) {
        setIsProcessing(false);
        toast.error('Please pick a date and time before continuing.');
        // Send the patient back to the date/time step
        setShowDatePicker(true);
        setShowLabOrder(false);
        prevStepRef.current = currentStep;
        setCurrentStep(BookingStep.ServiceAndDate);
        return;
      }

      const visitType = data.serviceDetails.visitType || 'mobile';
      const service = getServiceById(visitType);
      const additionalPatientCount = (data.additionalPatients || []).length;
      // CRITICAL: extendedArea was missing here — CheckoutStep displayed
      // the surcharge in the patient-visible breakdown but BookingFlow's
      // checkout-time recalc didn't include it, so the amount we sent to
      // Stripe was internally inconsistent with what the patient saw.
      // Pricing-drift smoke caught Mary Rienzi (Clermont, $250 charged
      // vs $175 expected, refunded $75 via pyr_1TRaRvAPnMg8iHarG6WoO5pt).
      const locationCity = data.locationDetails?.city || '';
      const breakdown = calculateTotal(visitType, {
        sameDay: data.serviceDetails.sameDay,
        weekend: data.serviceDetails.weekend,
        extendedArea: isExtendedArea(locationCity),
      }, tipAmount, additionalPatientCount, memberTier);

      // Lab orders + insurance — trust the upload-on-drop in
      // LabOrderUploadStep / InsuranceUploadStep entirely. Re-uploading
      // here used the Supabase Storage SDK, which acquires the same auth
      // lock that hangs on mobile Safari / iOS PWAs — leaving the pay
      // button spinning before our direct-fetch checkout call ever runs.
      // If a file genuinely slipped through, the patient sees a "no lab
      // order on file" hint; the appointment still books and the phleb
      // can collect it on-site. Better than a stuck pay button.
      const labOrderPaths: string[] = [
        ...(((data as any)?.labOrder?.uploadedPaths || []) as string[]),
      ];
      const insurancePath: string | null =
        ((data as any)?.insurance?.uploadedPath as string | null) || null;

      // CRITICAL: store the LOCAL calendar date, not a UTC ISO string.
      //
      // Prior bug: .toISOString() converted a Date representing "Wed midnight ET"
      // into "2026-04-17T04:00:00Z" (UTC). When the calendar re-parsed this,
      // FullCalendar interpreted the UTC timestamp and shifted it to the previous
      // day (Tuesday) because 4 AM UTC = Tuesday 11 PM ET. Every booking was
      // showing on the admin/phleb calendar on the wrong day.
      //
      // Fix: serialize the date using local Y-M-D components so the string
      // represents the patient's intended calendar day regardless of timezone.
      const d = data.date instanceof Date ? data.date : new Date(data.date);
      const appointmentDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // Apply referral discount if present (stored in additionalNotes by CheckoutStep)
      const notes = data.serviceDetails.additionalNotes || '';
      const referralMatch = notes.match(/Referral:.*-\$(\d+)/);
      const referralDiscount = referralMatch ? parseFloat(referralMatch[1]) : 0;
      // Bundle: patient prepays for additional future visits at a discount
      const bundleExtra = parseFloat(String((data as any).bundleExtra || 0)) || 0;
      const bundleCount = parseInt(String((data as any).bundleCount || 0), 10) || 0;
      // Family-member add-on(s) — same tier-aware price CheckoutStep computed.
      // CRITICAL: include in finalSubtotal so Stripe charges the patient the
      // full amount. Prior bug (2026-04-21 admin-side analog: Ben Tov Ofer /
      // Cheryl Hanin case) had this number in the UI total but not in the
      // Stripe session → primary invoice missing the companion fee.
      const familyMemberExtra = parseFloat(String((data as any).familyMemberExtra || 0)) || 0;

      // DOUBLE-COUNT GUARD: the booking flow has TWO entry points for adding
      // companions to a visit:
      //   1. additionalPatients[] — legacy multi-patient form (PatientInfoStep)
      //   2. familyMembers[] — saved-family-member shortcut (CheckoutStep modal)
      // Both add $75 per companion via different paths. If a patient enters
      // the SAME companion through both UIs (or the form copies between them),
      // they get double-charged. Pricing-drift smoke caught Mary Rienzi at
      // $250 (vs $175 expected) — refunded $75 via pyr_1TRaRvAPnMg8iHarG6WoO5pt.
      //
      // Fix: companion fee already lives inside breakdown.subtotal via the
      // additionalPatientCount param to calculateTotal. familyMemberExtra is
      // a SEPARATE add-on. To prevent double-counting, only add
      // familyMemberExtra IF additionalPatientCount === 0. Otherwise treat
      // them as the same population (admin can audit notes for which UI fed in).
      const safeFamilyMemberExtra = additionalPatientCount > 0 ? 0 : familyMemberExtra;
      if (additionalPatientCount > 0 && familyMemberExtra > 0) {
        console.warn(
          `[booking] companion double-count detected: additionalPatients=${additionalPatientCount} + familyMemberExtra=$${familyMemberExtra}. ` +
          `Charging only the additionalPatients tier (already in breakdown.subtotal). ` +
          `If patient legitimately wanted multiple companions through both UIs, this is a known limitation — admin can add via manual scheduling.`
        );
      }
      const finalSubtotal = Math.max(
        breakdown.subtotal - referralDiscount + bundleExtra + safeFamilyMemberExtra,
        0
      );

      // Lab destination — where the specimen gets delivered after draw.
      // Collected by LabDestinationSelector into form data.labOrder.labDestination
      // but previously NEVER forwarded to the backend. Fixing that data leak now.
      //
      // Normalize the raw form value (machine-friendly slug like 'labcorp') into
      // a human-readable label ('LabCorp') so the phleb dashboard renders
      // something meaningful instead of 'labcorp'.
      const rawDest = (data as any)?.labOrder?.labDestination || null;
      const labDestinationPending = rawDest === 'pending-doctor-confirmation';
      const labDestination = labDestinationPending ? null : ({
        'labcorp': 'LabCorp',
        'quest': 'Quest Diagnostics',
        'adventhealth': 'AdventHealth',
        'orlando-health': 'Orlando Health',
        'genova': 'Genova Diagnostics',
        'ups': 'UPS',
        'fedex': 'FedEx',
      } as Record<string, string>)[rawDest] || rawDest || null;

      const result = await createAppointmentCheckoutSession({
        serviceType: visitType,
        serviceName: service?.name || 'Blood Draw Service',
        amount: Math.round(finalSubtotal * 100),
        tipAmount: Math.round(tipAmount * 100),
        promoCode: promoCode || null,
        // Referral code from URL ?ref=CODE (set in BookNow.tsx → sessionStorage)
        // OR manually entered in CheckoutStep. Server re-validates against
        // referral_codes table and applies the discount before Stripe charge.
        referralCode: (typeof window !== 'undefined' ? sessionStorage.getItem('convelabs_referral') : null) || null,
        appointmentDate,
        appointmentTime: data.time,
        memberTier, // server re-verifies and re-prices if mismatched
        patientDetails: {
          firstName: data.patientDetails.firstName,
          lastName: data.patientDetails.lastName,
          email: data.patientDetails.email,
          phone: data.patientDetails.phone,
          // Family-member booking: when the account holder is booking a
          // visit for a saved family member, this id points at the
          // family_members row. Stored on appointments.family_member_id.
          familyMemberId: (data.patientDetails as any).familyMemberId || null,
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
            // Keep lab-order/insurance in notes as a legacy breadcrumb so the
            // regex path in stripe-webhook still works for older clients.
            // But the real source of truth is the first-class fields below.
            labOrderPaths.length > 0 ? `Lab orders: ${labOrderPaths.join(', ')}` : '',
            insurancePath ? `Insurance: ${insurancePath}` : '',
            bundleCount > 0 ? `BundleCount: ${bundleCount}` : '',
          ].filter(Boolean).join(' | '),
        },
        // First-class attachment fields (new — bypass the notes-stuffing pattern)
        labOrderFilePaths: labOrderPaths,
        insuranceCardPath: insurancePath,
        labDestination,
        labDestinationPending,
        // Bundled membership subscription (Hormozi anchor-flip upsell — one
        // Stripe session for visit + annual fee)
        subscribeToMembership: bundledSubscription ? {
          planName: bundledSubscription.planName,
          annualPriceCents: bundledSubscription.annualPriceCents,
          agreementId: bundledSubscription.agreementId,
        } : null,
      } as any);

      if (result.error) {
        // Hormozi rule: never let a buyer leave empty-handed. Every error
        // gets a clear plain-English message + a specific recovery action.
        const code = (result as any).errorCode || '';
        const goToDateTime = () => {
          setShowLabOrder(false);
          setShowDatePicker(true);
          prevStepRef.current = currentStep;
          setCurrentStep(BookingStep.ServiceAndDate);
        };

        if (code === 'slot_unavailable') {
          // Smart-suggestion modal with 3 alternatives + waitlist fallback
          setConflictModal({
            open: true,
            originalDate: (result as any).original_date || appointmentDate,
            originalTime: (result as any).original_time || data.time,
            suggestedSlots: (result as any).suggested_slots || [],
            retrying: false,
          });
          return;
        }

        if (code === 'destination_required') {
          toast.error('Pick where you want your specimen delivered (LabCorp, Quest, AdventHealth, etc.) before checkout.', {
            duration: 8000,
            action: { label: 'Pick lab', onClick: goToDateTime },
          });
          goToDateTime();
          return;
        }

        if (code === 'fasting_not_required') {
          toast.warning("Your lab order doesn't require fasting — we'll switch you to a routine draw and reopen the slot picker.", {
            duration: 8000,
          });
          goToDateTime();
          return;
        }

        if (code === 'date_blocked') {
          toast.error('That day isn\'t available (holiday or office closure). Please pick a different date.', {
            duration: 7000,
            action: { label: 'Pick another date', onClick: goToDateTime },
          });
          goToDateTime();
          return;
        }

        if (code === 'outside_partner_window' || code === 'outside_booking_window') {
          // Server-supplied message contains the actual hours
          toast.error(result.error || 'That time is outside our booking hours. Please pick a different time.', {
            duration: 9000,
            action: { label: 'Pick another time', onClick: goToDateTime },
          });
          goToDateTime();
          return;
        }

        if (code === 'invalid_promo_code') {
          toast.error(result.error || "We couldn't apply that promo code. Please remove it and try again, or use a different code.", {
            duration: 8000,
          });
          return; // stay on checkout — patient can edit/remove the promo code inline
        }

        if (code === 'total_too_low') {
          toast.error("Something's off with the total. Please refresh the page and try again — if it keeps happening, call (941) 527-9169 and we'll book you over the phone.", {
            duration: 10000,
          });
          return;
        }

        if (code === 'auth_error' || code === 'no_staff_profile') {
          toast.error(result.error || 'Account issue — please sign out and back in, or call (941) 527-9169.', {
            duration: 8000,
          });
          return;
        }

        // Unknown server error — friendly fallback. Never show raw
        // 'Edge Function returned a non-2xx status code' to a patient.
        const msg = result.error && !result.error.includes('non-2xx')
          ? result.error
          : "We hit a hiccup creating your booking. Please try again in a moment, or call (941) 527-9169 to book by phone.";
        toast.error(msg, {
          duration: 9000,
          action: { label: 'Call (941) 527-9169', onClick: () => { window.location.href = 'tel:+19415279169'; } },
        });
        return;
      }

      if (result.url) {
        window.location.href = result.url;
      } else {
        toast.error("We couldn't reach Stripe. Please try again — or call (941) 527-9169 to book by phone.", {
          duration: 9000,
          action: { label: 'Call', onClick: () => { window.location.href = 'tel:+19415279169'; } },
        });
      }
    } catch (error) {
      console.error('Checkout error:', error);
      const msg = (error as Error).message || 'unknown error';
      toast.error(`Checkout failed: ${msg}. Please try again — or call (941) 527-9169 if it keeps happening.`, {
        duration: 10000,
        action: { label: 'Call', onClick: () => { window.location.href = 'tel:+19415279169'; } },
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // When the patient picks an alternative time inside the conflict modal,
  // update the form's `time` field and re-fire handleCheckout. The modal
  // shows a per-button spinner via the `retrying` flag.
  const handlePickAlternativeSlot = async (newTime: string, tipAmount: number, promoCode: string | null) => {
    setConflictModal(prev => ({ ...prev, retrying: true }));
    methods.setValue('time', newTime);
    // Give React one tick to commit the form change before retrying
    await new Promise(res => setTimeout(res, 50));
    setConflictModal({ open: false, originalDate: '', originalTime: '', suggestedSlots: [], retrying: false });
    handleCheckout(tipAmount, promoCode);
  };

  // Animation variants
  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  const totalSteps = STEP_LABELS.length;
  const displayStep = computeDisplayStep(
    currentStep,
    showDatePicker,
    showLabOrder,
    methods.getValues('serviceDetails.visitType') || '',
  );
  const progressPercent = Math.min((displayStep / (totalSteps - 1)) * 100, 100);

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 md:px-0">
      <FormProvider {...methods}>
        {/* Progress indicator — desktop */}
        {currentStep < BookingStep.Confirmation && (
          <>
            {/* Desktop progress bar — labels hidden on tablet (md), shown
                from lg up. Numbered circles visible at all desktop sizes
                so the patient still sees position. */}
            <div className="hidden md:flex justify-between items-center mb-6 gap-1">
              {STEP_LABELS.map((step, index) => (
                <div key={step} className={`flex items-center ${index < STEP_LABELS.length - 1 ? 'flex-1' : ''}`}>
                  <div className={`flex items-center justify-center w-7 h-7 lg:w-8 lg:h-8 rounded-full text-xs lg:text-sm font-medium transition-colors flex-shrink-0 ${
                    index <= displayStep
                      ? 'bg-conve-red text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {index + 1}
                  </div>
                  <div className={`hidden lg:block ml-2 text-xs lg:text-sm font-medium truncate ${
                    index <= displayStep ? 'text-foreground' : 'text-muted-foreground'
                  }`}>{step}</div>
                  {index < STEP_LABELS.length - 1 && (
                    <div className={`flex-1 h-px mx-2 lg:mx-3 transition-colors min-w-[12px] ${
                      index < displayStep ? 'bg-conve-red' : 'bg-muted'
                    }`} />
                  )}
                </div>
              ))}
              <div className="ml-2 lg:ml-4 flex-shrink-0">
                <PriceEstimateBadge />
              </div>
            </div>

            {/* Progress indicator — mobile */}
            <div className="md:hidden mb-6 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Step {displayStep + 1} of {totalSteps}: {STEP_LABELS[displayStep]}
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

              {/* Step 4: Location & Lab Order (combined) — skip the lab
                  order half entirely for service types that don't need one
                  (in-office is in-clinic; partner-org services route the
                  order through the partner practice, not the patient). */}
              {currentStep === BookingStep.LocationAndLabOrder && !showLabOrder && (
                <LocationSelectionStep
                  onNext={() => {
                    const vt = methods.getValues('serviceDetails.visitType') || '';
                    if (skipsLabOrder(vt)) {
                      handleNext();   // Jump straight to checkout
                    } else {
                      setShowLabOrder(true);
                    }
                  }}
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
                  onGoBackToSchedule={() => {
                    // Layer 2 OCR auto-switch: send patient back to re-pick
                    // a time slot that matches the auto-switched service.
                    setShowLabOrder(false);
                    setShowDatePicker(true);
                    prevStepRef.current = currentStep;
                    setCurrentStep(BookingStep.ServiceAndDate);
                  }}
                />
              )}

              {/* Step 5: Checkout */}
              {currentStep === BookingStep.Checkout && (
                <CheckoutStep
                  onBack={handleBack}
                  onCheckout={handleCheckout}
                  isProcessing={isProcessing}
                  onMemberTierDetected={setMemberTier}
                  onBundledSubscription={setBundledSubscription}
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

      {/* Slot-conflict modal — fired by handleCheckout on 409 slot_unavailable */}
      <SlotConflictModal
        open={conflictModal.open}
        originalDate={conflictModal.originalDate}
        originalTime={conflictModal.originalTime}
        suggestedSlots={conflictModal.suggestedSlots}
        retrying={conflictModal.retrying}
        isMember={memberTier !== 'none'}
        patientEmail={methods.getValues('patientDetails.email')}
        patientPhone={methods.getValues('patientDetails.phone')}
        patientName={`${methods.getValues('patientDetails.firstName') || ''} ${methods.getValues('patientDetails.lastName') || ''}`.trim()}
        onPickAlternative={(time) => {
          const args = lastCheckoutArgsRef.current;
          handlePickAlternativeSlot(time, args.tipAmount, args.promoCode);
        }}
        onClose={() => setConflictModal({ open: false, originalDate: '', originalTime: '', suggestedSlots: [], retrying: false })}
      />
    </div>
  );
};

export default BookingFlow;
