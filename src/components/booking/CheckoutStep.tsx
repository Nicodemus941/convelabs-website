import React, { useState } from 'react';
import { format } from 'date-fns';
import { useFormContext } from 'react-hook-form';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import SubscribeAtCheckoutCard from './SubscribeAtCheckoutCard';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, Loader2, CreditCard, AlertTriangle } from 'lucide-react';
import { FormField, FormItem, FormControl, FormLabel, FormMessage } from '@/components/ui/form';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { BookingFormValues } from '@/types/appointmentTypes';
import { calculateTotal, getServiceById, isExtendedArea, type SpecialtyKitBundle } from '@/services/pricing/pricingService';
import SpecialtyKitBundleCard from './SpecialtyKitBundleCard';
import { supabase } from '@/integrations/supabase/client';
import TipSelector from './TipSelector';
import { toast } from '@/components/ui/sonner';
import { Shield, Gift, Tag, Plus, Layers, X, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import DateOfBirthInput from '@/components/ui/DateOfBirthInput';

interface FamilyMember {
  name: string;
  dob: string;
  relationship: string;
  fastingRequired?: boolean;
}
// Tier-aware companion pricing. Mirrors TIER_PRICING['additional'] server-side
// so admin + public flows charge the same. Non-member $75, Member $55,
// VIP $45, Concierge $35 — every booking reinforces the member benefit.
const FAMILY_MEMBER_PRICE_BY_TIER: Record<string, number> = {
  none: 75,
  member: 55,
  vip: 45,
  concierge: 35,
};

interface CheckoutStepProps {
  onBack: () => void;
  onCheckout: (tipAmount: number, promoCode?: string | null) => void;
  isProcessing: boolean;
  /**
   * Notifies the parent (BookingFlow) when membership is detected, so the
   * Stripe checkout amount can be calculated with the member tier.
   * Without this callback, members were shown a discounted price but
   * charged the full price (bug fix, April 2026).
   */
  onMemberTierDetected?: (tier: 'none' | 'member' | 'vip' | 'concierge') => void;
  /**
   * Fires when we detect the patient is one of the Founding 50 VIPs.
   * BookingFlow stores this on its own state + passes through to
   * `calculateTotal(... , isFoundingMember=true)` so the FIRST additional
   * household member is comped to $0 (Founding-50 free family add-on).
   */
  onFoundingMemberDetected?: (isFounding: boolean) => void;
  /**
   * Called when the patient subscribes to a membership inline at checkout.
   * Parent (BookingFlow) forwards this to create-appointment-checkout's
   * subscribeToMembership param so Stripe bundles the membership + visit
   * into one subscription session.
   */
  onBundledSubscription?: (payload: {
    planName: 'Regular' | 'VIP' | 'Concierge';
    annualPriceCents: number;
    agreementId: string;
    memberTierAfter: 'member' | 'vip' | 'concierge';
  } | null) => void;
  /**
   * Inline error banner — toast fallback for mobile browsers that hide toasts
   * (some iOS content blockers). Parent (BookingFlow) sets this whenever
   * createAppointmentCheckoutSession returns an error. Cleared when the
   * checkout is retried or the patient edits the form.
   */
  checkoutError?: string | null;
  onClearCheckoutError?: () => void;
}

const CheckoutStep: React.FC<CheckoutStepProps> = ({ onBack, onCheckout, isProcessing, onMemberTierDetected, onFoundingMemberDetected, onBundledSubscription, checkoutError, onClearCheckoutError }) => {
  const { user } = useAuth();
  const methods = useFormContext<BookingFormValues>();
  const { watch, getValues } = methods;
  const [tipAmount, setTipAmount] = useState(0);
  const [termsFlashing, setTermsFlashing] = useState(false);
  const [showMismatchDialog, setShowMismatchDialog] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralDiscount, setReferralDiscount] = useState(0);
  const [referralApplied, setReferralApplied] = useState(false);
  // Promo code state — validated server-side at checkout.
  // We accept the patient's input here and forward it to the edge fn which
  // calls validate_promo_code RPC. Final discount is applied server-side only
  // (client can't forge). This field shows a preview; real source of truth is Stripe.
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [promoMessage, setPromoMessage] = useState<string>('');
  const [promoPreview, setPromoPreview] = useState<{ type: string; value: number } | null>(null);
  const [addOns, setAddOns] = useState<any[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<Set<string>>(new Set());
  const [memberTier, setMemberTier] = useState<'none' | 'member' | 'vip' | 'concierge'>('none');
  // Founding-50 VIP: unlocks the FREE family add-on (1st additional patient
  // comped to $0). Detected by the membership lookup below — see the
  // onFoundingMemberDetected callback for context.
  const [isFoundingMember, setIsFoundingMember] = useState<boolean>(false);
  const [bundledSubscription, setBundledSubscription] = useState<{
    planName: 'Regular' | 'VIP' | 'Concierge';
    annualPriceCents: number;
    agreementId: string;
    memberTierAfter: 'member' | 'vip' | 'concierge';
  } | null>(null);
  const [memberLabel, setMemberLabel] = useState('');
  const [bundleEnabled, setBundleEnabled] = useState(false);
  // Patient credits (referral_credits + goodwill) — auto-detected from the
  // logged-in patient's email. Stored as cents for precise math. Applied
  // by default; patient can uncheck to save for later. IDs are persisted
  // to sessionStorage so BookingFlow picks them up at submission time
  // without changing the onCheckout callback signature.
  const [availableCreditCents, setAvailableCreditCents] = useState(0);
  const [availableCreditIds, setAvailableCreditIds] = useState<string[]>([]);
  const [applyCredits, setApplyCredits] = useState(true);
  // Family members live INSIDE the additionalPatients form array (single
  // source of truth for companions on this booking). Tagged with
  // _source='family_member' so we can filter for display + remove. Older
  // architecture had a separate familyMembers local state + familyMemberExtra
  // form field which double-counted with PatientInfoStep's additionalPatients
  // — caught Mary Rienzi at $250 vs $175. Consolidation removes the dual path.
  const additionalPatientsAll = (watch('additionalPatients') || []) as any[];
  const familyMembers = additionalPatientsAll.filter((p: any) => p?._source === 'family_member') as FamilyMember[];
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [familyForm, setFamilyForm] = useState({ name: '', dob: '', relationship: 'Spouse', fastingRequired: false });
  const BUNDLE_COUNT = 4;
  const BUNDLE_DISCOUNT = 0.15;

  // Must be defined before useEffects that reference it
  const serviceId = getValues('serviceDetails.visitType') || getValues('serviceDetails.selectedService');

  // Hormozi "don't pitch what doesn't fit" — these partner flows are typically
  // one-time draws (student physicals, specialty panels), so membership upsell
  // has near-zero conversion and adds checkout friction. Existing members still
  // get their tier discount via TIER_PRICING; we just don't pitch NEW signups
  // here. Right audience, right offer.
  const ONE_TIME_DRAW_SERVICES = new Set([
    'partner-nd-wellness',
    'partner-aristotle-education',
  ]);
  const suppressMembershipUpsell = ONE_TIME_DRAW_SERVICES.has(String(serviceId));

  // Auto-detect membership by patient email (no auth calls — avoid lock)
  React.useEffect(() => {
    const email = getValues('patientDetails.email');
    if (!email) return;
    // Look up patient in tenant_patients, then check memberships by user_id
    supabase.from('tenant_patients').select('user_id').ilike('email', email).maybeSingle()
      .then(({ data: tp }) => {
        if (!tp?.user_id) return;
        return supabase.from('user_memberships' as any)
          .select('*, membership_plans(*)')
          .eq('user_id', tp.user_id)
          .eq('status', 'active')
          .maybeSingle();
      })
      .then((res) => {
        if (!res?.data) return;
        const plan = (res.data as any).membership_plans;
        const name = plan?.name?.toLowerCase() || '';
        let detectedTier: 'none' | 'member' | 'vip' | 'concierge' = 'none';
        if (name.includes('concierge')) { detectedTier = 'concierge'; setMemberTier('concierge'); setMemberLabel('Concierge'); }
        else if (name.includes('vip')) { detectedTier = 'vip'; setMemberTier('vip'); setMemberLabel('VIP'); }
        else if (plan) { detectedTier = 'member'; setMemberTier('member'); setMemberLabel('Member'); }
        // CRITICAL: notify parent so the Stripe amount uses the right price
        if (detectedTier !== 'none') onMemberTierDetected?.(detectedTier);
        // Founding-50 detection — surfaces the free family add-on perk.
        // Trust the DB row, NOT the plan name (founding is a separate
        // column claimed atomically by stripe-webhook on signup).
        const isFounding = Boolean((res.data as any).founding_member);
        setIsFoundingMember(isFounding);
        onFoundingMemberDetected?.(isFounding);
      });
  }, []);

  // Deep-link from /dashboard/patient → /book-now?addFamily=1 — scroll to
  // and visually pulse the family-member panel so the user sees the free
  // slot CTA immediately. Wired for Mariela's "Book visit + add family"
  // dashboard button.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('addFamily') === '1') {
      const t = setTimeout(() => {
        const el = document.getElementById('family-member-panel');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-4', 'ring-amber-300', 'ring-offset-2');
          setTimeout(() => el.classList.remove('ring-4', 'ring-amber-300', 'ring-offset-2'), 2500);
        }
      }, 600);
      return () => clearTimeout(t);
    }
  }, []);

  // Auto-detect unredeemed patient credits by email — referral wins,
  // goodwill, apology credits all live in the same table. Patient never
  // has to remember a code; the system finds and applies them.
  React.useEffect(() => {
    const email = (getValues('patientDetails.email') || '').trim();
    if (!email) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: tp } = await supabase
          .from('tenant_patients').select('user_id').ilike('email', email).maybeSingle();
        if (!tp?.user_id || cancelled) return;
        const { data: rows } = await supabase
          .from('referral_credits' as any)
          .select('id, amount')
          .eq('user_id', tp.user_id)
          .eq('redeemed', false);
        if (cancelled) return;
        const list = (rows || []) as any[];
        const ids = list.map(r => r.id);
        const cents = list.reduce((s, r) => s + Math.round(Number(r.amount || 0) * 100), 0);
        setAvailableCreditCents(cents);
        setAvailableCreditIds(ids);
      } catch { /* non-blocking */ }
    })();
    return () => { cancelled = true; };
  }, [getValues('patientDetails.email')]);

  // Persist chosen credit IDs to sessionStorage so BookingFlow can pull
  // them at submission and forward to create-appointment-checkout. Clearing
  // applyCredits zeros it out instantly.
  React.useEffect(() => {
    try {
      if (applyCredits && availableCreditIds.length > 0) {
        sessionStorage.setItem('convelabs_redeem_credit_ids', JSON.stringify(availableCreditIds));
      } else {
        sessionStorage.removeItem('convelabs_redeem_credit_ids');
      }
    } catch { /* private-browsing safe */ }
  }, [applyCredits, availableCreditIds]);

  // Fetch add-ons for this service type
  React.useEffect(() => {
    supabase.from('add_on_prices' as any).select('*').eq('active', true).then(({ data }) => {
      const relevant = (data || []).filter((a: any) => {
        if (!a.service_types || a.service_types.length === 0) return true; // available for all
        return a.service_types.includes(serviceId);
      });
      setAddOns(relevant);
    });
  }, [serviceId]);

  const addOnTotal = addOns.filter(a => selectedAddOns.has(a.id)).reduce((s, a) => s + (a.price || 0), 0);
  // Bundle extra: patient prepays for 3 MORE visits (total of 4) at 15% off the 4-pack.
  // bundleExtra = servicePrice × ((BUNDLE_COUNT × (1 - DISCOUNT)) - 1)

  // Check URL + sessionStorage for referral code (survives multi-step flow)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || sessionStorage.getItem('convelabs_referral');
    if (ref) {
      setReferralCode(ref);
      applyReferral(ref);
      sessionStorage.setItem('convelabs_referral', ref); // Persist through steps
    }
  }, []);

  const applyReferral = async (code: string) => {
    if (!code.trim()) return;
    const { data } = await supabase.from('referral_codes' as any).select('*').eq('code', code.trim().toUpperCase()).eq('active', true).maybeSingle();
    if (data) {
      setReferralDiscount((data as any).discount_amount || 25);
      setReferralApplied(true);
      toast.success(`Referral code applied! $${(data as any).discount_amount || 25} off`);
    } else {
      toast.error('Invalid referral code');
      setReferralApplied(false);
      setReferralDiscount(0);
    }
  };

  const serviceDetails = getValues('serviceDetails');
  const locationCity = getValues('locationDetails.city') || '';
  const locationZip = getValues('locationDetails.zipCode') || '';
  const additionalPatients = watch('additionalPatients') || [];
  const termsAccepted = watch('termsAccepted');

  const service = getServiceById(serviceId);
  const extendedArea = isExtendedArea(locationCity, locationZip);

  // Hormozi specialty-kit bundle: when service is `specialty-kit*`, we
  // ignore the flat additionalPatientCount path and compute via the bundle
  // so the customer sees the volume-discounted total + savings chip.
  const isSpecialtyKit = serviceId === 'specialty-kit' || serviceId === 'specialty-kit-genova';
  const [specialtyBundle, setSpecialtyBundle] = useState<SpecialtyKitBundle | null>(null);

  const breakdown = calculateTotal(serviceId, {
    sameDay: serviceDetails?.sameDay,
    weekend: serviceDetails?.weekend,
    extendedArea,
    ...(isSpecialtyKit && specialtyBundle ? { specialtyKitBundle: specialtyBundle } : {}),
  }, tipAmount, isSpecialtyKit ? 0 : additionalPatients.length, memberTier, isFoundingMember);

  const effectiveReferralDiscount = referralApplied ? referralDiscount : 0;
  // Founding VIPs get their FIRST family member free — the perk promised
  // in BonusStackCard.tsx ("Free family add-on · +$75 value"). The 2nd, 3rd,
  // etc. still bill at the VIP tier rate. Matches the comp logic inside
  // pricingService.calculateTotal() so what the UI shows == what charges.
  const baseFamilyMemberPrice = FAMILY_MEMBER_PRICE_BY_TIER[memberTier] ?? 75;
  const familyMemberPrice = baseFamilyMemberPrice; // per-additional-member rate (unchanged)
  // Free family-slot rules (must mirror pricingService.calculateTotal):
  //   • Concierge ($399/yr): 2 free family members per visit
  //   • Founding-50 VIP: 1 free family member per visit
  //   • Everyone else: 0 free
  const foundingFamilyFreeSlots = memberTier === 'concierge'
    ? 2
    : (isFoundingMember && memberTier === 'vip' ? 1 : 0);
  const billableFamilyCount = Math.max(0, familyMembers.length - foundingFamilyFreeSlots);
  const familyMemberTotal = billableFamilyCount * familyMemberPrice;

  const handleAddFamilyMember = () => {
    if (!familyForm.name.trim()) { toast.error('Please enter the family member\'s name'); return; }
    if (!familyForm.dob) { toast.error('Please enter their date of birth'); return; }
    // Push into additionalPatients (canonical source). _source tag lets us
    // filter family-member entries out for display + removal.
    const trimmedName = familyForm.name.trim();
    const [first, ...rest] = trimmedName.split(/\s+/);
    const current = (getValues('additionalPatients') || []) as any[];
    methods.setValue('additionalPatients', [
      ...current,
      {
        firstName: first || trimmedName,
        lastName: rest.join(' ') || '',
        email: '',
        phone: '',
        dob: familyForm.dob,
        relationship: familyForm.relationship,
        // Per-patient fasting flag — drives a separate fasting-aware
        // night-before reminder for THIS family member specifically. The
        // Amy/Robert case (couple at one address, one fasts, one doesn't)
        // routes through here when added at checkout instead of in
        // PatientInfoStep.
        fastingRequired: !!familyForm.fastingRequired,
        _source: 'family_member',
      },
    ] as any);
    setFamilyForm({ name: '', dob: '', relationship: 'Spouse', fastingRequired: false });
    setShowFamilyForm(false);
    toast.success(`Family member added (+$${familyMemberPrice}) — add another or continue`);
  };

  const handleRemoveFamilyMember = (index: number) => {
    // Remove the Nth family-member-tagged entry from additionalPatients.
    const current = (getValues('additionalPatients') || []) as any[];
    let fmSeen = -1;
    const next = current.filter((p: any) => {
      if (p?._source === 'family_member') {
        fmSeen++;
        return fmSeen !== index;
      }
      return true;
    });
    methods.setValue('additionalPatients', next as any);
    toast.info('Family member removed');
  };

  const selectedDate = watch('date');

  const handleCheckout = async () => {
    if (!termsAccepted) {
      toast.error('Please accept the terms and conditions');
      return;
    }

    // Store T&C agreement with timestamp
    try {
      const patientEmail = getValues('patientDetails.email') || '';
      const patientName = `${getValues('patientDetails.firstName') || ''} ${getValues('patientDetails.lastName') || ''}`.trim();

      await supabase.from('terms_agreements' as any).insert({
        patient_email: patientEmail,
        patient_name: patientName,
        terms_version: '2026-04-13',
        user_agent: navigator.userAgent,
      });
    } catch (e) {
      console.error('Failed to store T&C agreement:', e);
    }

    // Store referral + add-on + bundle info in form context for the checkout session
    const noteParts = [getValues('serviceDetails.additionalNotes')];
    if (referralApplied && referralCode) {
      noteParts.push(`Referral: ${referralCode} (-$${referralDiscount})`);
    }
    if (bundleEnabled) {
      noteParts.push(`BUNDLE: ${BUNDLE_COUNT} visits @ ${Math.round(BUNDLE_DISCOUNT * 100)}% off (1 of ${BUNDLE_COUNT} today, ${BUNDLE_COUNT - 1} credits remaining)`);
    }
    if (familyMembers.length > 0) {
      const fmNames = familyMembers.map(fm => `${fm.name} (${fm.relationship}, DOB: ${fm.dob})`).join('; ');
      noteParts.push(`FAMILY: ${familyMembers.length} member(s) @ $${familyMemberPrice} each — ${fmNames}`);
    }
    methods.setValue('serviceDetails.additionalNotes', noteParts.filter(Boolean).join(' | '));

    // Pass bundle surcharge via tipAmount? No — extend onCheckout payload instead.
    // We piggyback bundle extra into tipAmount would be wrong. Use a data attr on form.
    if (bundleEnabled) {
      methods.setValue('bundleCount' as any, BUNDLE_COUNT);
      methods.setValue('bundleExtra' as any, breakdown.servicePrice * ((BUNDLE_COUNT * (1 - BUNDLE_DISCOUNT)) - 1));
    }
    if (familyMembers.length > 0) {
      methods.setValue('familyMembers' as any, familyMembers);
      // CONSOLIDATED: family members are already inside additionalPatients,
      // so their fee is already counted by calculateTotal via the
      // additionalPatientCount path. Setting familyMemberExtra=0 keeps
      // older callers safe in case any read it.
      methods.setValue('familyMemberExtra' as any, 0);
    }

    // HIPAA safeguard: detect when logged-in user's email matches patient email
    // but the names don't match — signals "booking for someone else" with wrong email
    if (user?.email) {
      const patientEmail = getValues('patientDetails.email')?.trim().toLowerCase();
      const userEmail = user.email.trim().toLowerCase();
      const patientFirst = (getValues('patientDetails.firstName') || '').trim().toLowerCase();
      const patientLast = (getValues('patientDetails.lastName') || '').trim().toLowerCase();
      const userFirst = (user.firstName || '').trim().toLowerCase();
      const userLast = (user.lastName || '').trim().toLowerCase();

      if (patientEmail === userEmail && (patientFirst !== userFirst || patientLast !== userLast)) {
        // Email matches logged-in user but name is different — likely booking for someone else
        // with the wrong email still attached
        setShowMismatchDialog(true);
        return;
      }
    }

    onCheckout(tipAmount, promoStatus === 'valid' ? promoCode.trim() : null);
  };

  const handleConfirmCheckout = () => {
    setShowMismatchDialog(false);
    onCheckout(tipAmount, promoStatus === 'valid' ? promoCode.trim() : null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Checkout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Appointment summary */}
        <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Service</span>
            <span className="font-medium">{service?.name || serviceId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span>{selectedDate ? format(selectedDate, 'EEEE, MMMM d, yyyy') : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Time</span>
            <span>{getValues('time') || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Patient</span>
            <span>{getValues('patientDetails.firstName')} {getValues('patientDetails.lastName')}</span>
          </div>
          {getValues('locationDetails.address') && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Address</span>
              <span className="text-right max-w-[55%] sm:max-w-[60%] break-words text-xs sm:text-sm">
                {getValues('locationDetails.address')}{getValues('locationDetails.city') ? `, ${getValues('locationDetails.city')}` : ''}{getValues('locationDetails.state') ? `, ${getValues('locationDetails.state')}` : ''} {getValues('locationDetails.zipCode') || ''}
              </span>
            </div>
          )}
          {getValues('labOrder.labDestination') && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lab Delivery</span>
              <span className="font-medium capitalize">{getValues('labOrder.labDestination')?.replace('-', ' ')}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Member discount badge */}
        {memberTier !== 'none' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
            <span className="text-emerald-700 text-sm font-medium">🎉 {memberLabel} pricing applied!</span>
            <span className="text-xs text-emerald-600">Your membership discount has been automatically applied.</span>
          </div>
        )}

        {/* Patient credit available — auto-detected from referral_credits.
            Includes referrals, goodwill, and apology credits. Default ON so
            the patient gets the discount automatically; can opt out to save
            it for a future visit. (Aditya Patel 2026-05-11 + future flows.) */}
        {availableCreditCents > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <Gift className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    ${(availableCreditCents / 100).toFixed(2)} credit on your account
                  </p>
                  <p className="text-xs text-amber-800">
                    {applyCredits
                      ? `We'll apply it to today's booking — you save $${(Math.min(availableCreditCents, Math.round((breakdown.total || 0) * 100)) / 100).toFixed(2)}.`
                      : 'Saved for a future visit. Toggle on to apply now.'}
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-amber-900 cursor-pointer flex-shrink-0">
                <Checkbox checked={applyCredits} onCheckedChange={(v) => setApplyCredits(v === true)} />
                Apply now
              </label>
            </div>
          </div>
        )}

        {/* Inline Hormozi upsell — non-members only, and only if no bundle already picked.
            Also suppressed on one-time-draw partner flows (ND Wellness, Aristotle)
            where the audience rarely returns — upsell would just hurt conversion. */}
        {memberTier === 'none' && !bundledSubscription && breakdown.servicePrice >= 50 && !suppressMembershipUpsell && (
          <SubscribeAtCheckoutCard
            patientEmail={String(watch('patientDetails.email') || '')}
            patientName={`${watch('patientDetails.firstName') || ''} ${watch('patientDetails.lastName') || ''}`.trim()}
            serviceType={String(watch('serviceDetails.visitType') || 'mobile')}
            serviceBaseCents={Math.round(breakdown.servicePrice * 100)}
            onSubscribed={(payload) => {
              setBundledSubscription(payload);
              onBundledSubscription?.(payload);
              // Also update the local memberTier preview so the price display flips
              setMemberTier(payload.memberTierAfter);
            }}
          />
        )}

        {/* Bundled-subscription confirmation card */}
        {bundledSubscription && (
          <div className="bg-gradient-to-r from-emerald-50 to-white border-2 border-emerald-300 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-bold text-emerald-800">
                  ✨ {bundledSubscription.planName} membership added
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  +${(bundledSubscription.annualPriceCents / 100).toFixed(2)}/yr charged once at checkout. Today's visit is automatically discounted.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-gray-500 hover:text-red-600"
                onClick={() => {
                  setBundledSubscription(null);
                  onBundledSubscription?.(null);
                  setMemberTier('none');
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        )}

        {/* Specialty-kit bundle card — shown only for specialty-kit visits.
            Lets the patient pick kit counts per person + see live volume discount. */}
        <SpecialtyKitBundleCard
          serviceId={serviceId}
          memberTier={memberTier}
          onBundleChange={(b) => setSpecialtyBundle(b)}
        />

        {/* Price breakdown */}
        <div className="space-y-3">
          <h3 className="font-medium">Order Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>{service?.name || 'Blood Draw Service'}</span>
              <span>${breakdown.servicePrice.toFixed(2)}</span>
            </div>

            {breakdown.surcharges.map((surcharge) => (
              <div key={surcharge.label} className="flex justify-between text-muted-foreground">
                <span>{surcharge.label}</span>
                <span>+${surcharge.amount.toFixed(2)}</span>
              </div>
            ))}

            <Separator />

            <div className="flex justify-between font-medium">
              <span>Subtotal</span>
              <span>${breakdown.subtotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Add-ons */}
        {addOns.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium text-sm flex items-center gap-1.5"><Plus className="h-4 w-4" /> Add-Ons</h3>
            {addOns.map((addon: any) => (
              <div key={addon.id} className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/30 transition">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedAddOns.has(addon.id)}
                    onCheckedChange={(checked) => {
                      setSelectedAddOns(prev => {
                        const next = new Set(prev);
                        checked ? next.add(addon.id) : next.delete(addon.id);
                        return next;
                      });
                    }}
                  />
                  <div>
                    <p className="text-sm font-medium">{addon.name}</p>
                    {addon.description && <p className="text-xs text-muted-foreground">{addon.description}</p>}
                  </div>
                </div>
                <span className="text-sm font-medium">+${Number(addon.price).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Multi-visit bundle — highest LTV lever */}
        <div className={`rounded-xl p-4 space-y-2 transition ${bundleEnabled ? 'bg-emerald-50 border-2 border-emerald-400' : 'bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200'}`}>
          <div className="flex items-start gap-3">
            <Checkbox
              checked={bundleEnabled}
              onCheckedChange={(c) => setBundleEnabled(!!c)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="font-semibold text-sm flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-purple-700" /> Book 4 visits, save 15%
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lock in today's pricing for your next 4 visits.{' '}
                <span className="font-bold text-emerald-700">
                  ${(breakdown.servicePrice * BUNDLE_COUNT).toFixed(0)} → ${(breakdown.servicePrice * BUNDLE_COUNT * (1 - BUNDLE_DISCOUNT)).toFixed(0)}
                </span>{' '}
                (save ${(breakdown.servicePrice * BUNDLE_COUNT * BUNDLE_DISCOUNT).toFixed(0)})
              </p>
              {bundleEnabled && (
                <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                  ✓ Today's visit is the first of 4. Schedule the remaining 3 anytime within 12 months.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Family member upsell */}
        <div
          id="family-member-panel"
          className={`bg-blue-50 border ${foundingFamilyFreeSlots > 0 ? 'border-amber-300 bg-amber-50' : 'border-blue-200'} rounded-xl p-3 space-y-2`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-blue-900">
                👨‍👩‍👧 Bringing a family member?
                {foundingFamilyFreeSlots > 0 && familyMembers.length === 0 && (
                  <span className="ml-2 inline-block bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 align-middle">
                    1st FREE · Founding VIP
                  </span>
                )}
              </p>
              {/* Pricing line — shows $0 for the founding-50 free first slot */}
              {foundingFamilyFreeSlots > 0 && familyMembers.length === 0 ? (
                <p className="text-xs text-amber-900">
                  Your first household member is <span className="font-bold">FREE</span> as a Founding VIP perk
                  (then ${familyMemberPrice} each after).
                </p>
              ) : (
                <p className="text-xs text-blue-700">
                  Add them to this visit for just <span className="font-bold">${familyMemberPrice}</span> each.
                  {memberTier !== 'none' && (
                    <span className="block mt-0.5 text-emerald-700 font-medium">
                      ✓ {memberLabel} rate applied — save ${75 - familyMemberPrice} per companion
                    </span>
                  )}
                </p>
              )}
              {/* Operational rule: must be drawn at THIS appointment, not separate. */}
              <p className="text-[11px] text-blue-900 mt-1.5 bg-white border border-blue-200 rounded px-2 py-1">
                <span className="font-bold">Same-visit rule:</span> family members are drawn at this same appointment —
                not a separate one. The phlebotomist sees everyone at the same address, same time slot.
              </p>
            </div>
          </div>

          {/* Running count + clear "you can add more" hint — without it,
              users assume "Confirm" closes the affordance for good. */}
          {familyMembers.length > 0 && (
            <p className="text-[11px] text-blue-900 -mt-1 mb-1.5">
              <strong>{familyMembers.length} family member{familyMembers.length === 1 ? '' : 's'} added</strong>
              {' '}({familyMembers.length} × ${familyMemberPrice} = ${familyMemberTotal}). Add another below, or continue when done.
            </p>
          )}

          {/* Added family members list */}
          {familyMembers.map((fm, i) => (
            <div key={i} className="flex items-center justify-between bg-white border border-blue-200 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {fm.name}
                  {(fm as any).fastingRequired && (
                    <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-1.5 py-0.5">fasting</span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">{fm.relationship} · DOB: {fm.dob}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-semibold text-blue-800">+${familyMemberPrice}</span>
                <button type="button" onClick={() => handleRemoveFamilyMember(i)} className="text-red-400 hover:text-red-600 p-0.5">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Add family member form */}
          {showFamilyForm ? (
            <div className="bg-white border border-blue-200 rounded-lg p-3 space-y-3">
              <div>
                <Label className="text-xs font-medium">Full Name *</Label>
                <Input
                  value={familyForm.name}
                  onChange={e => setFamilyForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Jane Smith"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Date of Birth *</Label>
                  <div className="mt-1">
                    <DateOfBirthInput
                      value={familyForm.dob}
                      onChange={(iso) => setFamilyForm(f => ({ ...f, dob: iso }))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium">Relationship</Label>
                  <select
                    value={familyForm.relationship}
                    onChange={e => setFamilyForm(f => ({ ...f, relationship: e.target.value }))}
                    className="mt-1 h-9 w-full text-sm border rounded-md px-2 bg-white"
                  >
                    <option>Spouse</option>
                    <option>Child</option>
                    <option>Parent</option>
                    <option>Sibling</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              {/* Per-patient fasting toggle — the Amy/Robert case (couple,
                  one fasts, one doesn't). We drive a separate fasting-aware
                  night-before reminder for THIS person off this flag. */}
              <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 flex items-center justify-between gap-3">
                <div className="text-[11px] text-amber-900 leading-snug">
                  <strong>Fasting required for this person?</strong><br/>
                  <span className="text-amber-800">We'll send them their own night-before reminder if so.</span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer select-none flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={!!familyForm.fastingRequired}
                    onChange={(e) => setFamilyForm(f => ({ ...f, fastingRequired: e.target.checked }))}
                    className="h-4 w-4 accent-amber-600"
                  />
                  <span className="text-xs font-medium text-amber-900">{familyForm.fastingRequired ? 'Yes' : 'No'}</span>
                </label>
              </div>

              <div className="flex gap-2">
                <Button type="button" size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white flex-1" onClick={handleAddFamilyMember}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Confirm (+${familyMemberPrice})
                </Button>
                <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => setShowFamilyForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" className="text-xs border-blue-300 text-blue-800 hover:bg-blue-100 w-full"
              onClick={() => setShowFamilyForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {familyMembers.length === 0 ? `Add Family Member — $${familyMemberPrice}` : `Add Another (+$${familyMemberPrice})`}
            </Button>
          )}
        </div>

        {/* Promo code input — server validates + applies discount at checkout.
            For new patients, prominently nudges WELCOME25 ($25 off first visit). */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-700">Promo code (optional)</label>
            {promoStatus !== 'valid' && !promoCode && (
              <button
                type="button"
                onClick={() => {
                  setPromoCode('WELCOME25');
                  setPromoStatus('idle');
                  setPromoMessage('');
                }}
                className="text-[11px] font-semibold text-conve-red hover:underline"
              >
                New patient? Use WELCOME25 — $25 off
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value);
                if (promoStatus !== 'idle') { setPromoStatus('idle'); setPromoMessage(''); setPromoPreview(null); }
              }}
              disabled={promoStatus === 'valid'}
              placeholder="Enter code"
              className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 bg-white disabled:bg-gray-100 disabled:text-gray-500 uppercase"
              style={{ textTransform: 'uppercase' }}
            />
            {promoStatus === 'valid' ? (
              <button
                type="button"
                onClick={() => { setPromoCode(''); setPromoStatus('idle'); setPromoMessage(''); setPromoPreview(null); }}
                className="px-3 py-2 text-sm font-semibold rounded-md border border-gray-300 bg-white hover:bg-gray-50"
              >Remove</button>
            ) : (
              <button
                type="button"
                disabled={!promoCode.trim() || promoStatus === 'checking'}
                onClick={async () => {
                  setPromoStatus('checking');
                  setPromoMessage('');
                  try {
                    const email = getValues('patientDetails.email') || '';
                    const phone = getValues('patientDetails.phone') || '';
                    const firstName = getValues('patientDetails.firstName') || '';
                    const lastName = getValues('patientDetails.lastName') || '';
                    const { data, error } = await supabase.rpc('validate_promo_code', {
                      p_code: promoCode.trim(),
                      p_email: email,
                      p_phone: phone,
                      p_first_name: firstName,
                      p_last_name: lastName,
                    });
                    if (error) throw error;
                    if (data?.valid) {
                      setPromoStatus('valid');
                      setPromoPreview({ type: data.discount_type, value: data.discount_value });
                      setPromoMessage(
                        data.discount_type === 'full_waiver'
                          ? '✓ Code applied — visit fee fully waived. Add any tip amount to complete booking.'
                          : data.discount_type === 'percent'
                          ? `✓ Code applied — ${data.discount_value}% off`
                          : `✓ Code applied — $${(data.discount_value / 100).toFixed(2)} off`
                      );
                    } else {
                      setPromoStatus('invalid');
                      // BUG FIX 2026-05-25 (Joshua Hoskins case): the generic
                      // "Invalid promo code" message confused patients with
                      // membership-signup codes (HOSKINS24, etc.). Those codes
                      // live in Stripe and only apply at the payment page AFTER
                      // adding the membership bundle. Now we surface a clear
                      // hint when validation fails with no specific reason —
                      // points patients to the right place.
                      setPromoMessage(
                        data?.reason === 'email_not_authorized'
                          ? 'This code is not available on this account. Make sure your email is correct.'
                          : data?.reason === 'expired'
                          ? 'This code has expired.'
                          : data?.reason === 'max_uses_reached'
                          ? 'This code has reached its usage limit.'
                          : data?.reason === 'max_uses_per_email_reached'
                          ? 'You\'ve already used this code.'
                          : data?.reason === 'not_first_time'
                          ? 'WELCOME25 is for new patients only. VIP membership saves more on every visit.'
                          : 'This code can\'t be applied here. If it\'s a membership signup code (e.g. one we texted you for Concierge), add the membership above first — then enter it on the secure payment page after you press Pay.'
                      );
                    }
                  } catch (e: any) {
                    setPromoStatus('invalid');
                    setPromoMessage('Could not validate — please try again.');
                  }
                }}
                className="px-4 py-2 text-sm font-semibold rounded-md bg-[#B91C1C] text-white disabled:bg-gray-300 hover:bg-[#991B1B]"
              >{promoStatus === 'checking' ? '…' : 'Apply'}</button>
            )}
          </div>
          {promoMessage && (
            <p className={`mt-1.5 text-xs ${promoStatus === 'valid' ? 'text-green-700' : 'text-red-600'}`}>
              {promoMessage}
            </p>
          )}
        </div>

        {/* Tip selector */}
        {/* Pass the visit subtotal so the preset chips become percentage-
            based (15% / 20% / 25%) — better anchor than flat $5/$10/$15. */}
        <TipSelector value={tipAmount} onChange={setTipAmount} visitSubtotal={breakdown?.subtotal || 0} />

        {tipAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tip</span>
            <span>${tipAmount.toFixed(2)}</span>
          </div>
        )}

        <Separator />

        {/* Add-on line items */}
        {addOnTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Add-ons</span>
            <span>+${addOnTotal.toFixed(2)}</span>
          </div>
        )}

        {bundleEnabled && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">3 future visits (bundle, 15% off)</span>
            <span>+${(breakdown.servicePrice * ((BUNDLE_COUNT * (1 - BUNDLE_DISCOUNT)) - 1)).toFixed(2)}</span>
          </div>
        )}

        {/* Family-member line removed — family members now live inside
            additionalPatients form array, so their fee is already counted
            in breakdown.surcharges (see "Additional patients (N × $75)"
            line above). Showing a separate line would double-display. */}

        {effectiveReferralDiscount > 0 && (
          <div className="flex justify-between text-sm text-emerald-700">
            <span>Referral discount</span>
            <span>-${effectiveReferralDiscount.toFixed(2)}</span>
          </div>
        )}

        <Separator />

        {/* Total */}
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span>${Math.max(0, breakdown.total + addOnTotal + (bundleEnabled ? breakdown.servicePrice * ((BUNDLE_COUNT * (1 - BUNDLE_DISCOUNT)) - 1) : 0) - effectiveReferralDiscount).toFixed(2)}</span>
        </div>

        {/* Referral Code */}
        {!referralApplied ? (
          <div className="flex gap-2">
            <Input
              value={referralCode}
              onChange={e => setReferralCode(e.target.value)}
              placeholder="Referral code (optional)"
              className="flex-1 text-sm"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => applyReferral(referralCode)} disabled={!referralCode.trim()}>
              <Tag className="h-3.5 w-3.5 mr-1" /> Apply
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <Gift className="h-4 w-4" /> Referral: -{`$${referralDiscount}`} applied
            </span>
            <button onClick={() => { setReferralApplied(false); setReferralDiscount(0); setReferralCode(''); }} className="text-xs text-muted-foreground hover:text-red-500">Remove</button>
          </div>
        )}

        {/* Guarantee Badge */}
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <Shield className="h-4 w-4 text-[#B91C1C]" />
          <span className="text-xs text-muted-foreground">Protected by the <a href="/guarantee" target="_blank" className="text-[#B91C1C] font-medium hover:underline">ConveLabs Guarantee</a></span>
        </div>

        {/* Terms — anchor id used by the Continue button to scroll-to + flash
            when the patient tries to proceed without checking. Without this,
            the Continue button silently disabled itself (mobile users below
            the fold reported "the button does nothing"). */}
        <FormField
          control={methods.control}
          name="termsAccepted"
          render={({ field }) => (
            <FormItem
              id="checkout-terms-block"
              className={`flex flex-row items-start space-x-3 space-y-0 rounded-lg p-3 -m-3 transition-colors ${termsFlashing ? 'bg-amber-100 ring-2 ring-amber-400' : ''}`}
            >
              <FormControl>
                <Checkbox
                  checked={field.value || false}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I agree to the{' '}
                  <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">terms and conditions</a>
                  {' '}and{' '}
                  <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">privacy policy</a>
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        {/*
          Inline error banner — fallback for mobile browsers that hide toasts.
          Set by BookingFlow when checkout returns an error. Visible above the
          Pay button so patients see the issue without scrolling. Clears when
          they edit the form or retry. (Added 2026-05-20 to make the previous
          "spinning button + invisible toast" failure mode loud and clear.)
        */}
        {checkoutError && (
          <div role="alert" className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-900">Checkout didn't go through</p>
              <p className="text-sm text-red-800 mt-0.5 break-words">{checkoutError}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onClearCheckoutError?.()}
                  className="text-xs font-semibold text-red-700 underline underline-offset-2"
                >
                  Dismiss
                </button>
                <a href="tel:+19415279169" className="text-xs font-semibold text-red-700 underline underline-offset-2">
                  Or call (941) 527-9169
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isProcessing}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button
            type="button"
            onClick={() => {
              // Don't silently disable when T&C is unchecked — many mobile
              // patients couldn't see the checkbox below the fold and reported
              // "the Continue button does nothing." Now: scroll to the terms
              // block, flash it amber for 1.6s, and surface a clear toast.
              if (!termsAccepted) {
                const el = document.getElementById('checkout-terms-block');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setTermsFlashing(true);
                  setTimeout(() => setTermsFlashing(false), 1600);
                }
                toast.error('Please check the terms-and-conditions box below to continue.', { duration: 6000 });
                return;
              }
              handleCheckout();
            }}
            disabled={isProcessing}
            className="bg-conve-red hover:bg-conve-red-dark text-white"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Proceed to Payment — ${Math.max(0, breakdown.total + addOnTotal + (bundleEnabled ? breakdown.servicePrice * ((BUNDLE_COUNT * (1 - BUNDLE_DISCOUNT)) - 1) : 0) - effectiveReferralDiscount).toFixed(2)}
              </>
            )}
          </Button>
        </div>
        {/* HIPAA mismatch warning dialog */}
        <AlertDialog open={showMismatchDialog} onOpenChange={setShowMismatchDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-5 w-5" /> Patient Email Verification
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3 text-left">
                <p>
                  The patient name is <strong>{getValues('patientDetails.firstName')} {getValues('patientDetails.lastName')}</strong>, but the email
                  (<strong>{getValues('patientDetails.email')}</strong>) belongs to your account (<strong>{user?.firstName} {user?.lastName}</strong>).
                </p>
                <p>
                  Appointment confirmations and notifications will be sent to this email. If you're booking for someone else,
                  please go back and enter <strong>the patient's own email</strong> so they receive their own notifications.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={onBack}>
                Go Back & Fix Email
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmCheckout} className="bg-amber-600 hover:bg-amber-700">
                Continue Anyway — Send to My Email
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

export default CheckoutStep;
