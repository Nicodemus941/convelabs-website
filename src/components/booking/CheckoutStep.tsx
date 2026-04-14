import React, { useState } from 'react';
import { format } from 'date-fns';
import { useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, Loader2, CreditCard } from 'lucide-react';
import { FormField, FormItem, FormControl, FormLabel, FormMessage } from '@/components/ui/form';
import { BookingFormValues } from '@/types/appointmentTypes';
import { calculateTotal, getServiceById, isExtendedArea } from '@/services/pricing/pricingService';
import { supabase } from '@/integrations/supabase/client';
import TipSelector from './TipSelector';
import { toast } from '@/components/ui/sonner';
import { Shield, Gift, Tag, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface CheckoutStepProps {
  onBack: () => void;
  onCheckout: (tipAmount: number) => void;
  isProcessing: boolean;
}

const CheckoutStep: React.FC<CheckoutStepProps> = ({ onBack, onCheckout, isProcessing }) => {
  const methods = useFormContext<BookingFormValues>();
  const { watch, getValues } = methods;
  const [tipAmount, setTipAmount] = useState(0);
  const [referralCode, setReferralCode] = useState('');
  const [referralDiscount, setReferralDiscount] = useState(0);
  const [referralApplied, setReferralApplied] = useState(false);
  const [addOns, setAddOns] = useState<any[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<Set<string>>(new Set());
  const [memberTier, setMemberTier] = useState<'none' | 'member' | 'vip' | 'concierge'>('none');
  const [memberLabel, setMemberLabel] = useState('');

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
        if (name.includes('concierge')) { setMemberTier('concierge'); setMemberLabel('Concierge'); }
        else if (name.includes('vip')) { setMemberTier('vip'); setMemberLabel('VIP'); }
        else if (plan) { setMemberTier('member'); setMemberLabel('Member'); }
      })
      .catch(() => {});
  }, []);

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

  const serviceId = getValues('serviceDetails.visitType') || getValues('serviceDetails.selectedService');
  const serviceDetails = getValues('serviceDetails');
  const locationCity = getValues('locationDetails.city') || '';
  const additionalPatients = watch('additionalPatients') || [];
  const termsAccepted = watch('termsAccepted');

  const service = getServiceById(serviceId);
  const extendedArea = isExtendedArea(locationCity);
  const breakdown = calculateTotal(serviceId, {
    sameDay: serviceDetails?.sameDay,
    weekend: serviceDetails?.weekend,
    extendedArea,
  }, tipAmount, additionalPatients.length, memberTier);

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

    // Store referral + add-on info in form context for the checkout session
    if (referralApplied && referralCode) {
      methods.setValue('serviceDetails.additionalNotes',
        [getValues('serviceDetails.additionalNotes'), `Referral: ${referralCode} (-$${referralDiscount})`].filter(Boolean).join(' | ')
      );
    }

    onCheckout(tipAmount);
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

        {/* Membership upsell for non-members */}
        {memberTier === 'none' && breakdown.servicePrice >= 100 && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-sm text-amber-900">💰 Save ${(breakdown.servicePrice - (breakdown.servicePrice * 0.87)).toFixed(0)} on this visit</p>
            <p className="text-xs text-amber-700">
              You're paying <span className="font-bold">${breakdown.servicePrice.toFixed(0)}</span>. Members pay <span className="font-bold">${(breakdown.servicePrice * 0.87).toFixed(0)}</span>.
              Join for <span className="font-bold">$99/year</span> and save on every visit.
            </p>
            <Button type="button" variant="outline" size="sm" className="text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
              onClick={() => window.open('/pricing', '_blank')}>
              View Membership Plans →
            </Button>
          </div>
        )}

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

        {/* Family member upsell */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1">
          <p className="font-semibold text-sm text-blue-900">👨‍👩‍👧 Bringing a family member?</p>
          <p className="text-xs text-blue-700">Add them to this visit for just <span className="font-bold">$75</span> — no separate appointment needed.</p>
          <Button type="button" variant="outline" size="sm" className="text-xs border-blue-300 text-blue-800 hover:bg-blue-100 mt-1"
            onClick={() => { toast.info('Call (941) 527-9169 to add a family member to this visit.'); }}>
            Add Family Member — $75
          </Button>
        </div>

        {/* Tip selector */}
        <TipSelector value={tipAmount} onChange={setTipAmount} />

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

        <Separator />

        {/* Total */}
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span>${(breakdown.total + addOnTotal).toFixed(2)}</span>
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

        {/* Terms */}
        <FormField
          control={methods.control}
          name="termsAccepted"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
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

        {/* Actions */}
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isProcessing}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button
            type="button"
            onClick={handleCheckout}
            disabled={isProcessing || !termsAccepted}
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
                Proceed to Payment — ${breakdown.total.toFixed(2)}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CheckoutStep;
