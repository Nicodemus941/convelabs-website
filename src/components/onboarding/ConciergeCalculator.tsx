
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { CheckCircle, PlusCircle, MinusCircle } from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { useMutation } from '@tanstack/react-query';

interface PricingTier {
  monthlyPrice: number;
  quarterlyPrice: number;
  annualPrice: number;
  creditsPerYear: number;
}

const ConciergeCalculator: React.FC = () => {
  const navigate = useNavigate();
  const { email, fullName, userId, mobileNumber, setSelectedPlanId, setBillingFrequency } = useOnboarding();
  
  const [patientCount, setPatientCount] = useState(10);
  const [pricing, setPricing] = useState<PricingTier>({
    monthlyPrice: 800,
    quarterlyPrice: 2400,
    annualPrice: 9600,
    creditsPerYear: 120
  });
  const [selectedBilling, setSelectedBilling] = useState<'monthly' | 'quarterly' | 'annual'>('annual');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  useEffect(() => {
    // Calculate pricing based on patient count
    const monthlyBase = patientCount * 80;
    
    setPricing({
      monthlyPrice: monthlyBase,
      quarterlyPrice: monthlyBase * 3,
      annualPrice: monthlyBase * 12,
      creditsPerYear: patientCount * 12
    });
  }, [patientCount]);
  
  const getBillingPrice = () => {
    switch (selectedBilling) {
      case 'monthly':
        return pricing.monthlyPrice;
      case 'quarterly':
        return pricing.quarterlyPrice;
      case 'annual':
        return pricing.annualPrice;
      default:
        return pricing.monthlyPrice;
    }
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };
  
  const createCheckoutMutation = useMutation({
    mutationFn: async () => {
      // Store the selected plan details in user metadata
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.auth.updateUser({
          data: {
            doctorPlan: {
              patientCount,
              billingCycle: selectedBilling,
              price: getBillingPrice()
            }
          }
        });
      }
      
      try {
        // Create Stripe checkout session
        const response = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            name: fullName,
            phone: mobileNumber,
            planType: 'concierge',
            billingFrequency: selectedBilling,
            patientCount,
            userId
          }),
        });
        
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        
        const data = await response.json();
        return data.url;
      } catch (error) {
        console.error('Error creating checkout session:', error);
        throw error;
      }
    },
    onSuccess: (checkoutUrl) => {
      // Set the selected plan in the onboarding context
      setBillingFrequency(selectedBilling);
      
      // Redirect to Stripe checkout
      window.location.href = checkoutUrl;
    },
    onError: (error) => {
      console.error('Checkout error:', error);
      toast.error('Failed to create checkout session. Please try again.');
      setIsSubmitting(false);
    }
  });
  
  const handleContinue = async () => {
    setIsSubmitting(true);
    createCheckoutMutation.mutate();
  };
  
  const incrementPatientCount = () => {
    if (patientCount < 100) {
      setPatientCount(patientCount + 1);
    }
  };
  
  const decrementPatientCount = () => {
    if (patientCount > 5) {
      setPatientCount(patientCount - 1);
    }
  };
  
  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-2xl font-bold mb-6">Customize Your Concierge Practice</h2>
          
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-4">How many patients do you anticipate serving per month?</h3>
            
            <div className="flex items-center gap-4 mb-2">
              <Button 
                variant="outline" 
                size="icon"
                onClick={decrementPatientCount}
                disabled={patientCount <= 5}
              >
                <MinusCircle className="h-4 w-4" />
              </Button>
              
              <div className="flex-1">
                <Slider
                  value={[patientCount]}
                  min={5}
                  max={100}
                  step={1}
                  onValueChange={(value) => setPatientCount(value[0])}
                  className="mb-2"
                />
              </div>
              
              <Button 
                variant="outline" 
                size="icon"
                onClick={incrementPatientCount}
                disabled={patientCount >= 100}
              >
                <PlusCircle className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="text-center">
              <Input
                type="number"
                min="5"
                max="100"
                value={patientCount}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (value >= 5 && value <= 100) {
                    setPatientCount(value);
                  }
                }}
                className="w-24 mx-auto text-center"
              />
              <p className="text-sm text-muted-foreground mt-1">Minimum 5, Maximum 100</p>
            </div>
          </div>
          
          <div className="grid gap-6 md:grid-cols-3 mb-8">
            <div 
              className={`border rounded-lg p-6 text-center cursor-pointer transition-all ${
                selectedBilling === 'monthly' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
              onClick={() => setSelectedBilling('monthly')}
            >
              <div className="flex justify-center mb-2">
                {selectedBilling === 'monthly' && (
                  <CheckCircle className="h-6 w-6 text-primary" />
                )}
              </div>
              <h3 className="text-lg font-medium">Monthly</h3>
              <div className="mt-2 text-3xl font-bold">
                {formatCurrency(pricing.monthlyPrice)}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                More flexibility, higher rate
              </p>
            </div>
            
            <div 
              className={`border rounded-lg p-6 text-center cursor-pointer transition-all ${
                selectedBilling === 'quarterly' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
              onClick={() => setSelectedBilling('quarterly')}
            >
              <div className="flex justify-center mb-2">
                {selectedBilling === 'quarterly' && (
                  <CheckCircle className="h-6 w-6 text-primary" />
                )}
              </div>
              <h3 className="text-lg font-medium">Quarterly</h3>
              <div className="mt-2 text-3xl font-bold">
                {formatCurrency(pricing.quarterlyPrice)}
                <span className="text-sm font-normal text-muted-foreground">/quarter</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Billed every 3 months
              </p>
            </div>
            
            <div 
              className={`border rounded-lg p-6 text-center cursor-pointer transition-all ${
                selectedBilling === 'annual' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
              onClick={() => setSelectedBilling('annual')}
            >
              <div className="flex justify-center mb-2">
                {selectedBilling === 'annual' && (
                  <CheckCircle className="h-6 w-6 text-primary" />
                )}
              </div>
              <h3 className="text-lg font-medium">Annual</h3>
              <div className="mt-2 text-3xl font-bold">
                {formatCurrency(pricing.annualPrice)}
                <span className="text-sm font-normal text-muted-foreground">/year</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Best value
              </p>
            </div>
          </div>
          
          <div className="bg-muted p-6 rounded-lg mb-6">
            <h3 className="text-lg font-medium mb-4">Plan Summary</h3>
            
            <div className="space-y-2 mb-4">
              <div className="flex justify-between">
                <span>Patient Count:</span>
                <span className="font-medium">{patientCount} patients</span>
              </div>
              <div className="flex justify-between">
                <span>Credits Per Year:</span>
                <span className="font-medium">{pricing.creditsPerYear} credits</span>
              </div>
              <div className="flex justify-between">
                <span>Billing Cycle:</span>
                <span className="font-medium capitalize">{selectedBilling}</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="font-medium">Total:</span>
                <span className="font-bold">{formatCurrency(getBillingPrice())}</span>
              </div>
            </div>
          </div>
          
          <Button
            onClick={handleContinue}
            disabled={isSubmitting}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? 'Processing...' : 'Continue to Payment'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConciergeCalculator;
