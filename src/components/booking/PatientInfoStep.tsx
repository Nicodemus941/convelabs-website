
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ArrowLeft, ArrowRight, UserPlus, X, CheckCircle, Users, Heart } from 'lucide-react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { BookingFormValues } from '@/types/appointmentTypes';
import DateOfBirthInput from '@/components/ui/DateOfBirthInput';
import { isSeniorAge } from '@/services/pricing/pricingService';

interface PatientInfoStepProps {
  onNext: () => void;
  onBack: () => void;
  /** When the email matches a tenant_patient with an active membership,
   *  fire this so the parent's top "Est. $X" badge can flip to the
   *  member rate IMMEDIATELY — not only when the user reaches Checkout. */
  onMemberTierDetected?: (tier: 'none' | 'member' | 'vip' | 'concierge') => void;
  onFoundingMemberDetected?: (isFounding: boolean) => void;
}

const PatientInfoStep: React.FC<PatientInfoStepProps> = ({
  onNext,
  onBack,
  onMemberTierDetected,
  onFoundingMemberDetected,
}) => {
  const { user } = useAuth();
  const { control, watch, setValue, getValues } = useFormContext<BookingFormValues>();
  const dateOfBirth = watch('patientDetails.dateOfBirth');
  const [recognized, setRecognized] = useState(false);
  const [recognizedName, setRecognizedName] = useState('');
  const [hasAuthAccount, setHasAuthAccount] = useState(false);
  const [checking, setChecking] = useState(false);
  // Mirror of bubbled tier — drives the dynamic companion-fee copy
  const [detectedTier, setDetectedTier] = useState<'none' | 'member' | 'vip' | 'concierge'>('none');
  const [detectedFounding, setDetectedFounding] = useState(false);
  const detectedCompanionPrice = (() => {
    if (detectedTier === 'concierge') return 35;
    if (detectedTier === 'vip') return 45;
    if (detectedTier === 'member') return 55;
    return 75;
  })();
  const detectedFreeSlots = (() => {
    if (detectedTier === 'concierge') return 2;
    if (detectedFounding && detectedTier === 'vip') return 1;
    return 0;
  })();
  const [bookingForSelf, setBookingForSelf] = useState(true);
  // Family members saved on the logged-in user's chart. When booking for
  // "someone else," we show these as quick-pick cards so they don't re-type
  // the info. Appointment rows get family_member_id stamped so downstream
  // dashboards can show "for [spouse name]" chips.
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<string | null>(null);

  // Load the user's family members once we know who they are
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: tp } = await supabase
        .from('tenant_patients')
        .select('id')
        .or(`user_id.eq.${user.id},email.ilike.${user.email || 'none'}`)
        .maybeSingle();
      if (!tp?.id) return;
      const { data: fams } = await supabase
        .from('family_members' as any)
        .select('id, first_name, last_name, relationship, email, phone, date_of_birth, insurance_provider, insurance_member_id, insurance_group_number')
        .eq('patient_id', tp.id)
        .order('created_at');
      setFamilyMembers((fams as any[]) || []);
    })();
  }, [user]);

  // Auto-prefill DOB + phone for logged-in returning patients.
  // Previously these were only filled on email-blur, which never fires
  // when the form lands with email already populated from auth context
  // (the most common path for returning patients). Result: returning
  // patient sees their name + email pre-filled but DOB and phone empty
  // — friction at the highest-intent step. This mirrors the handleEmailBlur
  // lookup so the same fields auto-fill from the chart on mount.
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    (async () => {
      const currentDob = getValues('patientDetails.dateOfBirth');
      const currentPhone = getValues('patientDetails.phone');
      if (currentDob && currentPhone) return;
      const { data: tp } = await supabase.from('tenant_patients')
        .select('phone, date_of_birth, user_id, first_name')
        .or(`user_id.eq.${user.id},email.ilike.${user.email}`)
        .limit(1).maybeSingle();
      if (cancelled || !tp) return;
      if (!currentPhone && tp.phone) setValue('patientDetails.phone', tp.phone);
      if (!currentDob && tp.date_of_birth) setValue('patientDetails.dateOfBirth', tp.date_of_birth);
      // Detect tier so the Est. badge upstairs reflects member pricing on
      // initial render — without this, logged-in members had to blur the
      // email to see their discount.
      if (tp.user_id) {
        try {
          const { data: mem } = await supabase
            .from('user_memberships' as any)
            .select('founding_member, membership_plans(name)')
            .eq('user_id', tp.user_id)
            .eq('status', 'active')
            .maybeSingle();
          if (cancelled || !mem) return;
          const planName = String((mem as any).membership_plans?.name || '').toLowerCase();
          let tier: 'none' | 'member' | 'vip' | 'concierge' = 'none';
          if (planName.includes('concierge')) tier = 'concierge';
          else if (planName.includes('vip')) tier = 'vip';
          else if (planName) tier = 'member';
          if (tier !== 'none') {
            onMemberTierDetected?.(tier);
            onFoundingMemberDetected?.(Boolean((mem as any).founding_member));
            setDetectedTier(tier);
            setDetectedFounding(Boolean((mem as any).founding_member));
          }
        } catch (e) {
          console.warn('[patient-info-mount-prefill] tier detect failed:', e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handlePickFamilyMember = (fm: any) => {
    setSelectedFamilyMemberId(fm.id);
    setValue('patientDetails.firstName', fm.first_name || '');
    setValue('patientDetails.lastName', fm.last_name || '');
    setValue('patientDetails.email', fm.email || user?.email || '');
    setValue('patientDetails.phone', fm.phone || '');
    if (fm.date_of_birth) setValue('patientDetails.dateOfBirth', fm.date_of_birth);
    // Stamp the family_member_id on the form so BookingFlow forwards it to
    // create-appointment-checkout → appointments.family_member_id.
    setValue('patientDetails.familyMemberId' as any, fm.id);
    toast.success(`Booking for ${fm.first_name} (${fm.relationship})`);
  };

  const handleClearFamilyMember = () => {
    setSelectedFamilyMemberId(null);
    setValue('patientDetails.familyMemberId' as any, null);
    setValue('patientDetails.firstName', '');
    setValue('patientDetails.lastName', '');
    setValue('patientDetails.email', '');
    setValue('patientDetails.phone', '');
  };

  const handleEmailBlur = async () => {
    const email = getValues('patientDetails.email');
    if (!email || !email.includes('@')) return;

    setChecking(true);
    try {
      const { data: tp } = await supabase.from('tenant_patients')
        .select('first_name, last_name, phone, date_of_birth, user_id, insurance_provider')
        .ilike('email', email.trim())
        .limit(1).maybeSingle();

      if (tp) {
        setRecognized(true);
        setRecognizedName(tp.first_name || '');
        setHasAuthAccount(!!tp.user_id);

        // Auto-overwrite when matched email belongs to a DIFFERENT patient.
        // Previous logic only filled if fields were empty — when booker is
        // logged in (booking for someone else), pre-filled names from their
        // own profile blocked the swap. Mariela's case: Naquala booked from
        // patient chart, name fields stayed 'Nicodemme/Jean-Baptiste' instead
        // of becoming 'Mariela/Sadrameli'.
        const curFirst = (getValues('patientDetails.firstName') || '').trim().toLowerCase();
        const curLast = (getValues('patientDetails.lastName') || '').trim().toLowerCase();
        const matchedFirst = (tp.first_name || '').trim().toLowerCase();
        const matchedLast = (tp.last_name || '').trim().toLowerCase();
        const namesMatch = curFirst === matchedFirst && curLast === matchedLast;
        if (!namesMatch && tp.first_name) {
          setValue('patientDetails.firstName', tp.first_name);
          setValue('patientDetails.lastName', tp.last_name || '');
        }
        if (tp.phone) setValue('patientDetails.phone', tp.phone);
        if (tp.date_of_birth && !getValues('patientDetails.dateOfBirth')) {
          setValue('patientDetails.dateOfBirth', tp.date_of_birth);
        }

        toast.success(`Welcome back, ${tp.first_name}! We've filled in your info.`);

        // Membership tier detection — bubble up so parent's "Est. $X" badge
        // reflects the discount IMMEDIATELY at step 4 (Patient Info), not
        // only after the patient reaches step 7 (Checkout). Fixes the
        // 'why am I seeing non-member price as a VIP?' UX gap.
        if (tp.user_id) {
          try {
            const { data: mem } = await supabase
              .from('user_memberships' as any)
              .select('founding_member, membership_plans(name)')
              .eq('user_id', tp.user_id)
              .eq('status', 'active')
              .maybeSingle();
            if (mem) {
              const planName = String((mem as any).membership_plans?.name || '').toLowerCase();
              let tier: 'none' | 'member' | 'vip' | 'concierge' = 'none';
              if (planName.includes('concierge')) tier = 'concierge';
              else if (planName.includes('vip')) tier = 'vip';
              else if (planName) tier = 'member';
              if (tier !== 'none') {
                onMemberTierDetected?.(tier);
                onFoundingMemberDetected?.(Boolean((mem as any).founding_member));
                setDetectedTier(tier);
                setDetectedFounding(Boolean((mem as any).founding_member));
              }
            }
          } catch (e) {
            console.warn('[patient-info-tier-detect]', e);
          }
        }
      } else {
        setRecognized(false);
      }
    } catch {
      // Non-blocking
    } finally {
      setChecking(false);
    }
  };

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'additionalPatients',
  });

  // ─── Senior auto-pricing (65+) ─────────────────────────────────────────
  // If the patient's DOB shows they're 65+, automatically switch a standard
  // mobile visit to the discounted senior rate. We only ever move DOWN in
  // price (mobile → senior) — never flip back or raise the price. The whole
  // downstream pipeline (procedure options, checkout, server) keys off
  // visitType, so flipping it here is the single cleanest lever.
  const visitType = watch('serviceDetails.visitType');
  const [seniorAutoApplied, setSeniorAutoApplied] = useState(false);
  useEffect(() => {
    if (visitType === 'mobile' && isSeniorAge(dateOfBirth)) {
      setValue('serviceDetails.visitType', 'senior');
      if (!seniorAutoApplied) {
        setSeniorAutoApplied(true);
        toast.success("You qualify for our Senior (65+) rate — we've applied the discounted price for you.");
      }
    }
  }, [visitType, dateOfBirth, setValue, seniorAutoApplied]);

  const handleBookingForToggle = (forSelf: boolean) => {
    setBookingForSelf(forSelf);
    // Always reset the family_member_id when toggling — protects against
    // "selected family member, toggled back to self, submitted" wiring bug.
    setSelectedFamilyMemberId(null);
    setValue('patientDetails.familyMemberId' as any, null);
    if (forSelf && user) {
      // Restore logged-in user's info
      setValue('patientDetails.firstName', user.firstName || '');
      setValue('patientDetails.lastName', user.lastName || '');
      setValue('patientDetails.email', user.email || '');
      setRecognized(false);
    } else {
      // Clear all fields so the booker must enter the actual patient's info
      setValue('patientDetails.firstName', '');
      setValue('patientDetails.lastName', '');
      setValue('patientDetails.email', '');
      setValue('patientDetails.phone', '');
      setRecognized(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="space-y-5">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold">Patient Information</h2>
            <p className="text-muted-foreground text-sm md:text-base mt-1">
              Please provide the patient's details
            </p>
          </div>

          {/* Booking-for toggle — only show when user is logged in */}
          {user && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={bookingForSelf ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => handleBookingForToggle(true)}
              >
                Booking for myself
              </Button>
              <Button
                type="button"
                variant={!bookingForSelf ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-xs gap-1.5"
                onClick={() => handleBookingForToggle(false)}
              >
                <Users className="h-3.5 w-3.5" /> Booking for someone else
              </Button>
            </div>
          )}

          {/* Family member quick-pick — only when logged-in user is booking
              for someone else and has saved family members on their chart */}
          {user && !bookingForSelf && familyMembers.length > 0 && (
            <div className="bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-rose-600" />
                <p className="text-sm font-semibold text-rose-900">Book for a family member</p>
                {selectedFamilyMemberId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-xs text-rose-700 hover:text-rose-900"
                    onClick={handleClearFamilyMember}
                  >
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-rose-700 -mt-2">
                Select a saved family member to auto-fill the form. Billing stays under your account.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {familyMembers.map((fm) => {
                  const isSelected = selectedFamilyMemberId === fm.id;
                  return (
                    <button
                      type="button"
                      key={fm.id}
                      onClick={() => handlePickFamilyMember(fm)}
                      className={cn(
                        'text-left border rounded-lg px-3 py-2 transition-all bg-white',
                        isSelected
                          ? 'border-rose-500 ring-2 ring-rose-300 shadow-sm'
                          : 'border-rose-200 hover:border-rose-400 hover:shadow-sm'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-gray-900 truncate">
                            {fm.first_name} {fm.last_name}
                          </p>
                          <p className="text-[11px] text-rose-700 capitalize">
                            {fm.relationship}
                            {fm.date_of_birth && ` · DOB ${fm.date_of_birth}`}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-rose-700/80 italic">
                Need to add someone new? <a href="/patient-profile" target="_blank" className="underline">Manage family members →</a>
              </p>
            </div>
          )}

          {user && !bookingForSelf && familyMembers.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800 leading-relaxed">
                💡 Tip: <a href="/patient-profile" target="_blank" className="underline font-medium">Add family members to your chart</a> once — then they're one-click to book next time.
              </p>
            </div>
          )}
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={control}
                name="patientDetails.firstName"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-2">
                    <label className="text-sm font-medium">First Name</label>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="John"
                      />
                    </FormControl>
                    {fieldState.error && (
                      <FormMessage>
                        {fieldState.error.message}
                      </FormMessage>
                    )}
                  </FormItem>
                )}
              />
              
              <FormField
                control={control}
                name="patientDetails.lastName"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-2">
                    <label className="text-sm font-medium">Last Name</label>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Doe"
                      />
                    </FormControl>
                    {fieldState.error && (
                      <FormMessage>
                        {fieldState.error.message}
                      </FormMessage>
                    )}
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={control}
                name="patientDetails.dateOfBirth"
                render={({ field, fieldState }) => {
                  // Field can hold either a Date object (from the legacy
                  // calendar picker) or an ISO yyyy-mm-dd string (what we
                  // emit now). Normalize to ISO before passing in.
                  const iso = (() => {
                    if (!field.value) return '';
                    if (field.value instanceof Date) {
                      const y = field.value.getFullYear();
                      const m = String(field.value.getMonth() + 1).padStart(2, '0');
                      const d = String(field.value.getDate()).padStart(2, '0');
                      return `${y}-${m}-${d}`;
                    }
                    return String(field.value);
                  })();
                  return (
                    <FormItem className="space-y-2">
                      <label className="text-sm font-medium">Date of Birth</label>
                      <FormControl>
                        <DateOfBirthInput
                          value={iso}
                          onChange={field.onChange}
                          error={!!fieldState.error}
                        />
                      </FormControl>
                      {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                    </FormItem>
                  );
                }}
              />
              
              <FormField
                control={control}
                name="patientDetails.phone"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-2">
                    <label className="text-sm font-medium">Phone Number</label>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="(555) 123-4567"
                        type="tel"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      We'll text you 30 minutes before arrival
                    </p>
                    {fieldState.error && (
                      <FormMessage>
                        {fieldState.error.message}
                      </FormMessage>
                    )}
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={control}
              name="patientDetails.email"
              render={({ field, fieldState }) => (
                <FormItem className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="john@example.com"
                      type="email"
                      onBlur={(e) => { field.onBlur(); handleEmailBlur(); }}
                    />
                  </FormControl>
                  {recognized && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                      <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <div className="text-xs">
                        <p className="font-medium text-emerald-800">Welcome back, {recognizedName}!</p>
                        <p className="text-emerald-600">We found your account and filled in your details.</p>
                        {!hasAuthAccount && (
                          <p className="text-emerald-600 mt-0.5">After booking, you'll receive a link to set up your password and access your dashboard.</p>
                        )}
                      </div>
                    </div>
                  )}
                  {!recognized && (
                    <p className="text-xs text-muted-foreground">
                      For appointment confirmation and results notification
                    </p>
                  )}
                  {fieldState.error && (
                    <FormMessage>
                      {fieldState.error.message}
                    </FormMessage>
                  )}
                </FormItem>
              )}
            />
          </div>
          
          {/* Additional Patients — couples / households at same address.
              Hormozi: surface savings + fasting-per-person FIRST so the
              Amy/Robert "couple, one fasts, one doesn't" case has a path
              instead of an org email-side-channel. Each additional patient
              creates its own appointment row (family_group_id) at the
              webhook, so each gets their own fasting-aware reminder + own
              specimen-delivery row. */}
          <div className="border-t pt-5 mt-2 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-sm flex items-center gap-2 text-emerald-900">
                    <Users className="h-4 w-4" /> More than one person at this address?
                  </h3>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                    Add a partner, parent, or kid getting labs the same visit.
                    {detectedFreeSlots > 0 ? (
                      <>
                        {' '}<strong className="text-emerald-900">
                          First {detectedFreeSlots === 2 ? '2 family members FREE' : 'family member FREE'} · {detectedTier === 'concierge' ? 'Concierge' : 'Founding VIP'} perk
                        </strong>
                        {' '}— additional ${detectedCompanionPrice} each ({detectedTier.toUpperCase()} rate).
                      </>
                    ) : detectedTier !== 'none' ? (
                      <>
                        {' '}<strong>${detectedCompanionPrice} each ({detectedTier.toUpperCase()} rate · saves ${75 - detectedCompanionPrice} per person)</strong>, and we only roll up once.
                      </>
                    ) : (
                      <> <strong>$75 each — saves $75-$150 vs. booking separately</strong>, and we only roll up once.</>
                    )}
                    {' '}Each person can have their own fasting status.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-100 flex-shrink-0"
                  onClick={() => append({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', fastingRequired: false } as any)}
                >
                  <UserPlus className="h-4 w-4 mr-1" /> Add Patient
                </Button>
              </div>
            </div>

            {fields.map((field, index) => (
              <Card key={field.id} className="p-4 bg-muted/30 border-2 border-dashed">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">Patient {index + 2} <span className="text-muted-foreground font-normal">· same address, same trip</span></span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => remove(index)}
                    aria-label="Remove patient"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.firstName`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...f} placeholder="First Name *" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.lastName`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...f} placeholder="Last Name *" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.dateOfBirth` as any}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...f}
                            type="date"
                            placeholder="Date of birth"
                            value={f.value || ''}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.email`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...f} placeholder="Email — for their own confirmation (optional)" type="email" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.phone`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...f} placeholder="Phone (optional)" type="tel" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Per-patient fasting toggle — the Amy/Robert case.
                    One can fast while the other doesn't; reminders fire
                    per-row off appointments.fasting_required at the
                    24-hour reminder cron. */}
                <div className="mt-3 pt-3 border-t border-dashed">
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.fastingRequired` as any}
                    render={({ field: f }) => (
                      <FormItem>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-muted-foreground leading-relaxed">
                            <strong className="text-foreground">Fasting required for this patient?</strong><br/>
                            We send them their own night-before reminder if their lab order requires it.
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!f.value}
                              onChange={(e) => f.onChange(e.target.checked)}
                              className="h-4 w-4 accent-conve-red"
                            />
                            <span className="text-xs font-medium">{f.value ? 'Yes — fasting' : 'No — eats normally'}</span>
                          </label>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </Card>
            ))}
          </div>

          <div className="flex justify-between pt-6 mt-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onBack}
              className="flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            <Button 
              type="button" 
              onClick={onNext}
              className="flex items-center"
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PatientInfoStep;
