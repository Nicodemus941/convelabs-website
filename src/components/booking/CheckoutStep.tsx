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
import { calculateTotal, getServiceById } from '@/services/pricing/pricingService';
import TipSelector from './TipSelector';
import { toast } from '@/components/ui/sonner';

interface CheckoutStepProps {
  onBack: () => void;
  onCheckout: (tipAmount: number) => void;
  isProcessing: boolean;
}

const CheckoutStep: React.FC<CheckoutStepProps> = ({ onBack, onCheckout, isProcessing }) => {
  const methods = useFormContext<BookingFormValues>();
  const { watch, getValues } = methods;
  const [tipAmount, setTipAmount] = useState(0);

  const serviceId = getValues('serviceDetails.selectedService');
  const serviceDetails = getValues('serviceDetails');
  const termsAccepted = watch('termsAccepted');

  const service = getServiceById(serviceId);
  const breakdown = calculateTotal(serviceId, {
    sameDay: serviceDetails?.sameDay,
    weekend: serviceDetails?.weekend,
  }, tipAmount);

  const selectedDate = watch('date');

  const handleCheckout = () => {
    if (!termsAccepted) {
      toast.error('Please accept the terms and conditions');
      return;
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
        </div>

        <Separator />

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

        {/* Tip selector */}
        <TipSelector value={tipAmount} onChange={setTipAmount} />

        {tipAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tip</span>
            <span>${tipAmount.toFixed(2)}</span>
          </div>
        )}

        <Separator />

        {/* Total */}
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span>${breakdown.total.toFixed(2)}</span>
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
                  <a href="/terms-of-service" className="text-primary hover:underline">terms and conditions</a>
                  {' '}and{' '}
                  <a href="/privacy-policy" className="text-primary hover:underline">privacy policy</a>
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
