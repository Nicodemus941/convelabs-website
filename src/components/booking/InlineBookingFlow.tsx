import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  MapPin, Clock, ArrowRight, ArrowLeft, CheckCircle, Shield, 
  Phone, Calendar, Loader2, AlertCircle, User, Lock, Upload, FileText
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import { analytics } from '@/utils/analytics';
import {
  getAvailability, createBookingHold, createGHSCheckoutSession,
  type CoverageResponse, type TimeSlot, type PatientDetails, 
  type GHSServiceCatalogItem, type GHSAddOn
} from '@/services/ghsBookingService';
import { SERVICE_ZIP_CODES } from '@/data/serviceZipCodes';
import HoldCountdownTimer from './HoldCountdownTimer';
import ServiceCatalogStep from './ServiceCatalogStep';
import SmartDateTimePicker from '@/components/calendar/SmartDateTimePicker';

// ─── Validation ──────────────────────────────────────

const patientSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  dob: z.string().min(1, 'Date of birth is required'),
  phone: z.string().regex(/^\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/, 'Enter a valid phone number'),
  email: z.string().email('Enter a valid email'),
  address: z.string().trim().min(1, 'Address is required').max(200),
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(2),
  zip: z.string().regex(/^\d{5}$/, 'Enter a valid ZIP code'),
  notes: z.string().max(500).optional(),
});

type Step = 'coverage' | 'availability' | 'service' | 'details' | 'review';

const STEPS: { key: Step; label: string }[] = [
  { key: 'coverage', label: 'Location' },
  { key: 'availability', label: 'Time' },
  { key: 'service', label: 'Service' },
  { key: 'details', label: 'Details' },
  { key: 'review', label: 'Payment' },
];

interface InlineBookingFlowProps {
  initialZip?: string;
  initialService?: string;
  resumeFromCancel?: boolean;
  partnerCode?: string;
}

const InlineBookingFlow: React.FC<InlineBookingFlowProps> = ({ initialZip, initialService, resumeFromCancel, partnerCode }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('coverage');

  // Coverage state
  const [zip, setZip] = useState(initialZip || '');
  const [serviceType, setServiceType] = useState(initialService || '');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<GHSServiceCatalogItem | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<GHSAddOn[]>([]);
  const [coverageResult, setCoverageResult] = useState<CoverageResponse | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState('');

  // Availability state
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [nextAvailableDate, setNextAvailableDate] = useState<string | null>(null);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarSelectedTime, setCalendarSelectedTime] = useState<string>('');
  

  // Patient details state
  const [patient, setPatient] = useState<PatientDetails>({
    firstName: '', lastName: '', dob: '', phone: '', email: '',
    address: '', city: '', state: 'FL', zip: initialZip || '', notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Payment handoff state
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffError, setHandoffError] = useState('');
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [holdExpired, setHoldExpired] = useState(false);

  // Lab order upload state
  const [labOrderFile, setLabOrderFile] = useState<File | null>(null);
  const [labOrderUploading, setLabOrderUploading] = useState(false);

  // Services that do NOT require insurance/lab order
  const EXEMPT_SERVICES = ['new_dimensions_wellness', 'specialty_collection', 'doctor_office_blood_draw'];
  const requiresInsurance = serviceType ? !EXEMPT_SERVICES.includes(serviceType) : false;

  // Auto-trigger availability if ZIP was passed from homepage
  const [autoTriggered, setAutoTriggered] = useState(false);
  
  useEffect(() => {
    if (initialZip && /^\d{5}$/.test(initialZip) && !autoTriggered && !resumeFromCancel) {
      const isCovered = SERVICE_ZIP_CODES.includes(initialZip);
      if (isCovered) {
        setAutoTriggered(true);
        setPatient(prev => ({ ...prev, zip: initialZip }));
        setCoverageResult({ covered: true, message: 'Great news! We service your area.' });
        analytics.trackFunnelStage('zip_entered', 1, { zip: initialZip, source: 'url_param' });
        analytics.trackFunnelStage('coverage_success', 2, { zip: initialZip });
        setStep('availability');
        fetchAvailability(initialZip);
      }
    }
  }, [initialZip, autoTriggered, resumeFromCancel]);

  // Restore session on cancel-retry
  useEffect(() => {
    if (resumeFromCancel) {
      try {
        const saved = sessionStorage.getItem('convelabs_booking_summary');
        if (saved) {
          const data = JSON.parse(saved);
          if (data.patient) setPatient(data.patient);
          if (data.zip) setZip(data.zip);
          if (data.serviceType) setServiceType(data.serviceType);
          if (data.selectedSlot) setSelectedSlot(data.selectedSlot);
          if (data.holdId) setHoldId(data.holdId);
          if (data.holdExpiresAt) {
            const expires = new Date(data.holdExpiresAt);
            if (expires > new Date()) {
              setHoldExpiresAt(data.holdExpiresAt);
              setStep('review');
            } else {
              setHoldExpired(true);
              setStep('availability');
            }
          } else {
            setStep('review');
          }
        }
      } catch {
        // Ignore corrupted session data
      }
    }
  }, [resumeFromCancel]);

  // ─── Step 1: Coverage → Immediately fetch availability ──

  const handleCoverageCheck = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = zip.trim();
    if (!/^\d{5}$/.test(trimmed)) {
      setCoverageError('Please enter a valid 5-digit ZIP code');
      return;
    }

    setCoverageLoading(true);
    setCoverageError('');
    analytics.trackFunnelStage('zip_entered', 1, { zip: trimmed });

    const isCovered = SERVICE_ZIP_CODES.includes(trimmed);
    
    const result: CoverageResponse = {
      covered: isCovered,
      message: isCovered 
        ? 'Great news! We service your area.' 
        : 'This ZIP code is not currently in our service area.',
    };
    setCoverageResult(result);

    if (isCovered) {
      analytics.trackFunnelStage('coverage_success', 2, { zip: trimmed });
      setPatient(prev => ({ ...prev, zip: trimmed }));
      // Immediately fetch availability and go to time selection
      setStep('availability');
      await fetchAvailability(trimmed);
    } else {
      analytics.trackFunnelStage('coverage_failure', 2, { zip: trimmed });
    }

    setCoverageLoading(false);
  }, [zip]);

  // ─── Step 2: Availability ──────────────────────────

  const toMinutesFromStartOfDay = (time: string) => {
    const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!match) return Number.MAX_SAFE_INTEGER;

    const [, hourStr, minuteStr, period] = match;
    let hour = Number(hourStr) % 12;
    if (period.toUpperCase() === 'PM') hour += 12;

    return hour * 60 + Number(minuteStr);
  };

  const sortSlotsChronologically = (slotList: TimeSlot[]) => {
    return [...slotList].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return toMinutesFromStartOfDay(a.startTime) - toMinutesFromStartOfDay(b.startTime);
    });
  };

  const fetchAvailability = async (zipCode: string, dateFrom?: string, serviceDuration?: number) => {

    setAvailabilityLoading(true);
    setAvailabilityError('');
    setNextAvailableDate(null);
    try {
      // Single call covers 14 days server-side — no need for a second fallback call
      const result = await getAvailability(zipCode, undefined, dateFrom, undefined, serviceDuration);
      const foundSlots = sortSlotsChronologically(result.slots || []);
      
      if (foundSlots.length === 0) {
        setSlots([]);
        setNextAvailableDate(result.nextAvailableDate || null);
      } else {
        setSlots(foundSlots);
      }

      analytics.trackFunnelStage('availability_viewed', 3, { slotCount: foundSlots.length });
    } catch (err: any) {
      const rawMsg = err.message || '';
      const isTechnical = rawMsg.toLowerCase().includes('edge function') || rawMsg.toLowerCase().includes('failed to fetch') || rawMsg.toLowerCase().includes('failed to connect');
      setAvailabilityError(isTechnical ? 'Failed to load available appointments. Please try again or call us.' : (rawMsg || 'Unable to load available times.'));
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleSlotSelect = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setHoldId(null);
    setHoldExpiresAt(null);
    setHoldExpired(false);
    analytics.trackFunnelStage('slot_selected', 4, { slotId: slot.id, date: slot.date, time: slot.startTime });
    // Go to service selection after time
    setStep('service');
  };

  // ─── Step 3: Service Selection ─────────────────────

  const handleServiceSelect = async (service: GHSServiceCatalogItem, addOns: GHSAddOn[]) => {
    setSelectedCatalogItem(service);
    setSelectedAddOns(addOns);
    setServiceType(service.id);
    analytics.trackFunnelStage('service_selected', 5, { 
      serviceId: service.id, 
      serviceName: service.public_name,
      addOnCount: addOns.length 
    });
    setStep('details');
  };

  const handleRequestConcierge = () => {
    window.location.href = 'tel:+19415279169';
  };

  // ─── Step 4: Patient Details ───────────────────────

  const handlePatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    analytics.trackFunnelStage('form_started', 6);

    const result = patientSchema.safeParse(patient);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        errors[issue.path[0] as string] = issue.message;
      });
      setFormErrors(errors);
      return;
    }

    // Validate insurance fields if required
    if (requiresInsurance) {
      const errors: Record<string, string> = {};
      if (!patient.insuranceCarrier?.trim()) errors.insuranceCarrier = 'Insurance carrier is required';
      if (!patient.insuranceMemberId?.trim()) errors.insuranceMemberId = 'Member ID is required';
      if (Object.keys(errors).length > 0) {
        setFormErrors(prev => ({ ...prev, ...errors }));
        return;
      }
    }

    // Upload lab order if provided
    if (labOrderFile) {
      setLabOrderUploading(true);
      try {
        const fileExt = labOrderFile.name.split('.').pop();
        const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('lab-orders')
          .upload(filePath, labOrderFile);
        if (uploadError) throw uploadError;
        setPatient(prev => ({ ...prev, labOrderPath: filePath }));
      } catch (err: any) {
        setFormErrors(prev => ({ ...prev, labOrder: 'Failed to upload lab order. Please try again.' }));
        setLabOrderUploading(false);
        return;
      }
      setLabOrderUploading(false);
    }

    setFormErrors({});
    setStep('review');
  };

  const updatePatient = (field: keyof PatientDetails, value: string) => {
    setPatient(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  // ─── Step 5: Review & Pay ──────────────────────────

  const handleContinueToPayment = async () => {
    if (handoffLoading || !selectedSlot) return;
    setHandoffLoading(true);
    setHandoffError('');
    analytics.trackFunnelStage('booking_submitted', 7);

    try {
      const hold = await createBookingHold(
        selectedSlot.id, serviceType, patient,
        totalPrice * 100,
        selectedAddOns.map(a => a.id),
        partnerCode
      );
      setHoldId(hold.holdId);
      setHoldExpiresAt(hold.expiresAt);
      analytics.trackFunnelStage('hold_created', 8, { holdId: hold.holdId });

      const returnUrl = `${window.location.origin}/book-now?session_id={CHECKOUT_SESSION_ID}&status=success`;
      const cancelUrl = `${window.location.origin}/book-now?status=cancel`;

      const checkout = await createGHSCheckoutSession(
        hold.holdId, serviceType, patient, returnUrl, cancelUrl, isSameDayBooking
      );
      analytics.trackFunnelStage('checkout_session_created', 9, { sessionId: checkout.sessionId });

      sessionStorage.setItem('convelabs_booking_summary', JSON.stringify({
        holdId: hold.holdId,
        holdExpiresAt: hold.expiresAt,
        sessionId: checkout.sessionId,
        zip,
        serviceType,
        selectedSlot,
        patient,
        selectedServiceLabel,
        selectedServicePrice: totalPrice,
      }));

      analytics.trackFunnelStage('redirect_to_stripe', 10);
      window.location.href = checkout.checkoutUrl;
    } catch (err: any) {
      if (err.message?.includes('no longer available') || err.message?.includes('409')) {
        setHandoffError('This time slot was just taken. Please choose another.');
        setStep('availability');
        await fetchAvailability(zip);
      } else {
        setHandoffError(err.message || 'Unable to proceed to payment. Please try again or call us.');
      }
    } finally {
      setHandoffLoading(false);
    }
  };

  const handleHoldExpired = useCallback(() => {
    setHoldExpired(true);
    setHoldId(null);
    setHoldExpiresAt(null);
    analytics.trackFunnelStage('hold_expired', 8);
  }, []);

  // ─── Helpers ───────────────────────────────────────

  const currentStepIndex = STEPS.findIndex(s => s.key === step);
  const selectedServiceLabel = selectedCatalogItem?.public_name || serviceType;
  const addOnTotal = selectedAddOns.reduce((sum, a) => sum + a.price, 0);
  
  // Detect same-day booking
  const today = new Date().toISOString().split('T')[0];
  const isSameDayBooking = selectedSlot ? selectedSlot.date === today : false;
  const sameDaySurcharge = isSameDayBooking ? 35 : 0;
  
  const totalPrice = (selectedCatalogItem?.starting_price || 0) + addOnTotal + sameDaySurcharge;

  const goBack = () => {
    const prevSteps: Record<Step, Step> = {
      coverage: 'coverage',
      availability: 'coverage',
      service: 'availability',
      details: 'service',
      review: 'details',
    };
    setStep(prevSteps[step]);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // ─── Render ────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 overflow-x-hidden">
      {/* Progress Bar */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-semibold transition-colors flex-shrink-0 ${
                i <= currentStepIndex 
                  ? 'bg-conve-red text-white' 
                  : 'bg-muted text-muted-foreground'
              }`}>
                {i < currentStepIndex ? <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : i + 1}
              </div>
              <span className={`ml-1.5 sm:ml-2 text-xs sm:text-sm hidden sm:inline ${
                i <= currentStepIndex ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}>{s.label}</span>
              {i < STEPS.length - 1 && (
                <div className={`w-6 sm:w-16 h-0.5 mx-1 sm:mx-2 ${
                  i < currentStepIndex ? 'bg-conve-red' : 'bg-muted'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Back Button */}
      {step !== 'coverage' && (
        <button onClick={goBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 sm:mb-4 min-h-[44px] active:opacity-70">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}

      <AnimatePresence mode="wait">
        {/* ── STEP 1: ZIP Code ─────────────────────── */}
        {step === 'coverage' && (
          <motion.div key="coverage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Book Your Appointment</h2>
              <p className="text-muted-foreground">Enter your ZIP code to see available times</p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" /> Book in under 2 minutes
              </p>
            </div>

            <form onSubmit={handleCoverageCheck} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Your ZIP Code</label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="e.g. 32801"
                      value={zip}
                      onChange={e => { setZip(e.target.value.replace(/\D/g, '').slice(0, 5)); setCoverageError(''); }}
                      className="pl-10 h-14 text-base border-2 rounded-xl"
                    />
                  </div>
                  <Button type="submit" disabled={coverageLoading} className="h-14 px-6 bg-conve-red hover:bg-conve-red-dark text-white font-semibold rounded-xl min-h-[44px]">
                    {coverageLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Check <ArrowRight className="h-4 w-4 ml-1" /></>}
                  </Button>
                </div>
              </div>

              {coverageError && <p className="text-destructive text-sm flex items-center gap-1"><AlertCircle className="h-4 w-4" />{coverageError}</p>}

              {coverageResult && !coverageResult.covered && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-muted/50 rounded-xl p-5 text-center">
                  <p className="text-foreground font-medium mb-2">We're not currently servicing this area online yet.</p>
                  <p className="text-muted-foreground text-sm mb-4">Our team may still be able to help you.</p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <a href="tel:+19415279169" className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-conve-red text-white rounded-xl font-semibold min-h-[44px]">
                      <Phone className="h-4 w-4" /> Call (941) 527-9169
                    </a>
                    <Button variant="outline" className="rounded-xl min-h-[44px]">Join Waitlist</Button>
                  </div>
                </motion.div>
              )}
            </form>

            <div className="flex flex-wrap justify-center gap-4 mt-8 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-conve-red" />HIPAA Compliant</span>
              <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-conve-red" />Licensed Phlebotomists</span>
              <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-conve-red" />Your info is secure</span>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2: Time Selection ───────────────── */}
        {step === 'availability' && (
          <motion.div key="availability" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="text-center mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-1 sm:mb-2">
                Showing appointments near {zip}
              </h2>
              <button
                onClick={() => { setStep('coverage'); setCoverageResult(null); setZip(''); setSlots([]); setSelectedSlot(null); setAutoTriggered(false); setAvailabilityError(''); }}
                className="text-sm text-conve-red hover:underline font-medium min-h-[44px] inline-flex items-center"
              >
                Change ZIP
              </button>
            </div>

            {holdExpired && (
              <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm p-3 rounded-xl mb-4 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Your previous hold has expired. Please select a new time slot.</span>
              </div>
            )}

            {availabilityLoading && (
              <div className="flex flex-col items-center py-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-conve-red" />
                <p className="text-foreground font-medium">Checking availability for {zip}...</p>
                <p className="text-muted-foreground text-sm">Finding open appointments with our providers</p>
                <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-conve-red rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            )}

            {availabilityError && (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
                <p className="text-foreground font-medium mb-2">{availabilityError}</p>
                <div className="flex gap-3 justify-center mt-4">
                  <Button onClick={() => fetchAvailability(zip)} className="bg-conve-red hover:bg-conve-red-dark text-white rounded-xl">Try Again</Button>
                  <a href="tel:+19415279169" className="inline-flex items-center gap-2 px-5 py-2.5 border border-border rounded-xl font-medium text-foreground">
                    <Phone className="h-4 w-4" /> Call Us
                  </a>
                </div>
              </div>
            )}

            {!availabilityLoading && !availabilityError && (
              <SmartDateTimePicker
                selectedDate={calendarSelectedDate}
                selectedTime={calendarSelectedTime}
                onDateSelect={(date) => {
                  setCalendarSelectedDate(date);
                  setCalendarSelectedTime('');
                }}
                onTimeSelect={(time) => setCalendarSelectedTime(time)}
                onSlotSelect={(slot) => handleSlotSelect(slot)}
                zipCode={zip}
                serviceDuration={60}
                isMember={true}
                className="max-w-lg mx-auto"
              />
            )}
          </motion.div>
        )}

        {/* ── STEP 3: Service Selection ────────────── */}
        {step === 'service' && (
          <motion.div key="service" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <ServiceCatalogStep
              onSelectService={handleServiceSelect}
              onRequestConcierge={handleRequestConcierge}
              partnerCode={partnerCode}
            />
          </motion.div>
        )}

        {/* ── STEP 4: Patient Details ──────────────── */}
        {step === 'details' && (
          <motion.div key="details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Your Information</h2>
              <p className="text-muted-foreground text-sm flex items-center justify-center gap-1">
                <Shield className="h-3.5 w-3.5" /> Your information is secure and encrypted
              </p>
            </div>

            <form onSubmit={handlePatientSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="First Name" value={patient.firstName} onChange={v => updatePatient('firstName', v)} error={formErrors.firstName} />
                <FormField label="Last Name" value={patient.lastName} onChange={v => updatePatient('lastName', v)} error={formErrors.lastName} />
              </div>
              <FormField label="Date of Birth" type="date" value={patient.dob} onChange={v => updatePatient('dob', v)} error={formErrors.dob} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Phone" type="tel" value={patient.phone} onChange={v => updatePatient('phone', v)} error={formErrors.phone} placeholder="(555) 123-4567" />
                <FormField label="Email" type="email" value={patient.email} onChange={v => updatePatient('email', v)} error={formErrors.email} placeholder="you@email.com" />
              </div>
              <FormField label="Street Address" value={patient.address} onChange={v => updatePatient('address', v)} error={formErrors.address} placeholder="123 Main St" />
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <FormField label="City" value={patient.city} onChange={v => updatePatient('city', v)} error={formErrors.city} />
                <FormField label="State" value={patient.state} onChange={v => updatePatient('state', v)} error={formErrors.state} maxLength={2} />
                <FormField label="ZIP" value={patient.zip} onChange={v => updatePatient('zip', v.replace(/\D/g, '').slice(0, 5))} error={formErrors.zip} />
              </div>
              {/* Insurance & Lab Order — conditional */}
              {requiresInsurance && (
                <div className="border-t border-border pt-4 mt-2 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4 text-conve-red" />
                    <span className="text-sm font-semibold text-foreground">Insurance Information</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Insurance Carrier" value={patient.insuranceCarrier || ''} onChange={v => updatePatient('insuranceCarrier', v)} error={formErrors.insuranceCarrier} placeholder="e.g. UnitedHealthcare" />
                    <FormField label="Member ID" value={patient.insuranceMemberId || ''} onChange={v => updatePatient('insuranceMemberId', v)} error={formErrors.insuranceMemberId} placeholder="e.g. ABC123456789" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <FileText className="h-4 w-4 text-conve-red" />
                      <label className="text-sm font-semibold text-foreground">Lab Order (optional)</label>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">Upload your doctor's lab order (PDF or image). This helps us prepare for your appointment.</p>
                    <label className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all min-h-[52px] ${
                      labOrderFile ? 'border-conve-red/50 bg-conve-red/5' : 'border-border hover:border-conve-red/40 hover:bg-accent/30'
                    }`}>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && file.size <= 10 * 1024 * 1024) {
                            setLabOrderFile(file);
                            if (formErrors.labOrder) {
                              setFormErrors(prev => { const next = { ...prev }; delete next.labOrder; return next; });
                            }
                          } else if (file) {
                            setFormErrors(prev => ({ ...prev, labOrder: 'File must be under 10MB' }));
                          }
                        }}
                      />
                      {labOrderFile ? (
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="truncate max-w-[200px]">{labOrderFile.name}</span>
                          <button type="button" onClick={(e) => { e.preventDefault(); setLabOrderFile(null); }} className="text-xs text-muted-foreground hover:text-destructive underline ml-1">Remove</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Upload className="h-4 w-4" />
                          <span>Tap to upload lab order</span>
                        </div>
                      )}
                    </label>
                    {formErrors.labOrder && <p className="text-destructive text-xs mt-1">{formErrors.labOrder}</p>}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Notes (optional)</label>
                <textarea
                  value={patient.notes}
                  onChange={e => updatePatient('notes', e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Gate code, parking instructions, etc."
                  className="w-full rounded-xl border-2 border-border p-3 text-sm focus:border-conve-red focus:outline-none resize-none bg-background text-foreground"
                />
              </div>
              <Button type="submit" disabled={labOrderUploading} className="w-full h-14 bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-base rounded-xl min-h-[44px]">
                {labOrderUploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Uploading...</>
                ) : (
                  <>Review Appointment <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
            </form>
          </motion.div>
        )}

        {/* ── STEP 5: Review & Pay ─────────────────── */}
        {step === 'review' && selectedSlot && (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Review Your Appointment</h2>
              <p className="text-muted-foreground text-sm">Confirm your details, then proceed to secure payment</p>
            </div>

            {holdExpiresAt && !holdExpired && (
              <div className="mb-4">
                <HoldCountdownTimer expiresAt={holdExpiresAt} onExpired={handleHoldExpired} />
              </div>
            )}

            <div className="bg-muted/30 rounded-xl p-4 sm:p-6 space-y-3 sm:space-y-4 mb-4 sm:mb-6 border border-border">
              <SummaryRow icon={<Calendar className="h-5 w-5 text-conve-red" />} label="Service" value={selectedServiceLabel} />
              {selectedAddOns.length > 0 && (
                <SummaryRow 
                  icon={<CheckCircle className="h-5 w-5 text-conve-red" />} 
                  label="Add-Ons" 
                  value={selectedAddOns.map(a => a.name).join(', ')} 
                />
              )}
              <SummaryRow icon={<Clock className="h-5 w-5 text-conve-red" />} label="Date & Time" value={`${formatDate(selectedSlot.date)} · ${selectedSlot.arrivalWindow || selectedSlot.startTime}`} />
              {selectedSlot.providerName && (
                <SummaryRow icon={<User className="h-5 w-5 text-conve-red" />} label="Provider" value={selectedSlot.providerName} />
              )}
              <SummaryRow icon={<MapPin className="h-5 w-5 text-conve-red" />} label="Location" value={`${patient.address}, ${patient.city}, ${patient.state} ${patient.zip}`} />
              <SummaryRow icon={<User className="h-5 w-5 text-conve-red" />} label="Patient" value={`${patient.firstName} ${patient.lastName}`} />
              
              {/* Price breakdown */}
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{selectedServiceLabel}</span>
                  <span className="text-foreground">${selectedCatalogItem?.starting_price || 0}</span>
                </div>
                {selectedAddOns.map(addOn => (
                  <div key={addOn.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{addOn.name}</span>
                    <span className="text-foreground">${addOn.price}</span>
                  </div>
                ))}
                {isSameDayBooking && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Same-Day Booking Surcharge</span>
                    <span className="text-foreground">$35</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-foreground font-semibold">Total</span>
                  <span className="text-xl font-bold text-conve-red">${totalPrice}</span>
                </div>
              </div>
            </div>

            <div className="bg-accent/50 rounded-xl p-3 mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4 text-conve-red flex-shrink-0" />
              <span>Your appointment will be briefly reserved while you complete payment. Payment is processed securely via Stripe.</span>
            </div>

            <p className="text-xs text-muted-foreground text-center mb-4">
              A licensed phlebotomist will be assigned automatically based on your location and time.
            </p>

            {handoffError && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl mb-4 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{handoffError}</span>
              </div>
            )}

            {holdExpired ? (
              <div className="text-center">
                <p className="text-foreground font-medium mb-3">Your slot reservation has expired.</p>
                <Button
                  onClick={() => { setHoldExpired(false); setStep('availability'); fetchAvailability(zip); }}
                  className="bg-conve-red hover:bg-conve-red-dark text-white font-semibold rounded-xl"
                >
                  Choose a New Time
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleContinueToPayment}
                disabled={handoffLoading}
                className="w-full h-14 bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-base rounded-xl min-h-[44px]"
              >
                {handoffLoading ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" />Securing your appointment...</>
                ) : (
                  <><Lock className="h-4 w-4 mr-2" /> Continue to Secure Payment</>
                )}
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Shared Components ───────────────────────────────

const FormField: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  error?: string; type?: string; placeholder?: string; maxLength?: number;
}> = ({ label, value, onChange, error, type = 'text', placeholder, maxLength }) => (
  <div>
    <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
    <Input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={`h-12 text-base rounded-xl border-2 ${error ? 'border-destructive' : 'border-border'}`}
    />
    {error && <p className="text-destructive text-xs mt-1">{error}</p>}
  </div>
);

const SummaryRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3">
    <div className="flex-shrink-0 mt-0.5">{icon}</div>
    <div>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-sm font-medium text-foreground">{value}</span>
    </div>
  </div>
);

export default InlineBookingFlow;
