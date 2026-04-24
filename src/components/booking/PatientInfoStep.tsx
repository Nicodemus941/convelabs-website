
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

interface PatientInfoStepProps {
  onNext: () => void;
  onBack: () => void;
}

const PatientInfoStep: React.FC<PatientInfoStepProps> = ({
  onNext,
  onBack
}) => {
  const { user } = useAuth();
  const { control, watch, setValue, getValues } = useFormContext<BookingFormValues>();
  const dateOfBirth = watch('patientDetails.dateOfBirth');
  const [recognized, setRecognized] = useState(false);
  const [recognizedName, setRecognizedName] = useState('');
  const [hasAuthAccount, setHasAuthAccount] = useState(false);
  const [checking, setChecking] = useState(false);
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
        .maybeSingle();

      if (tp) {
        setRecognized(true);
        setRecognizedName(tp.first_name || '');
        setHasAuthAccount(!!tp.user_id);

        // Auto-fill fields if empty
        if (!getValues('patientDetails.firstName') && tp.first_name) setValue('patientDetails.firstName', tp.first_name);
        if (!getValues('patientDetails.lastName') && tp.last_name) setValue('patientDetails.lastName', tp.last_name);
        if (!getValues('patientDetails.phone') && tp.phone) setValue('patientDetails.phone', tp.phone);

        toast.success(`Welcome back, ${tp.first_name}! We've filled in your info.`);
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
          
          {/* Additional Patients */}
          <div className="border-t pt-5 mt-2 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-sm">Additional Patients at Same Location</h3>
                <p className="text-xs text-muted-foreground">$75 per additional patient</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '' })}
              >
                <UserPlus className="h-4 w-4 mr-1" /> Add Patient
              </Button>
            </div>

            {fields.map((field, index) => (
              <Card key={field.id} className="p-4 bg-muted/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Patient {index + 2}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => remove(index)}
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
                          <Input {...f} placeholder="First Name" />
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
                          <Input {...f} placeholder="Last Name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`additionalPatients.${index}.email`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...f} placeholder="Email (optional)" type="email" />
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
