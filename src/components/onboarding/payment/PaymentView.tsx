
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { createCheckoutSession } from '@/services/stripe';
import PaymentError from './PaymentError';
import PaymentSuccess from './PaymentSuccess';
import { useNavigate, useLocation } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const PaymentView: React.FC = () => {
  const { selectedPlanId, billingFrequency } = useOnboarding();
  const { user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [checkoutTime, setCheckoutTime] = useState<Date | null>(null);
  
  // Get membership details from location state if coming from signup
  const membershipState = location.state as {
    fromMembership?: boolean;
    planId?: string;
    billingFrequency?: 'monthly' | 'quarterly' | 'annual';
    planName?: string;
    isSupernovaMember?: boolean;
    selectedAddOnId?: string | null;
  };
  
  useEffect(() => {
    // Check if user is authenticated, if not redirect to account creation
    if (!user) {
      toast.error("Please create an account to continue");
      navigate('/signup');
      return;
    }
    
    // Log that component mounted successfully
    console.log("Payment view loaded. User authenticated:", user.email);
    
    // Check for plan selection from location state or localStorage
    const locationPlanId = membershipState?.planId;
    const storedPlanId = localStorage.getItem('selectedPlanId');
    const effectivePlanId = selectedPlanId || locationPlanId || storedPlanId;
    
    // Check for billing frequency from location state or localStorage
    const locationFrequency = membershipState?.billingFrequency;
    const storedFrequency = localStorage.getItem('billingFrequency') as 'monthly' | 'quarterly' | 'annual' | null;
    const effectiveFrequency = billingFrequency || locationFrequency || storedFrequency || 'annual';
    
    console.log("Payment view selected plan:", effectivePlanId, "Billing frequency:", effectiveFrequency);
    
    // If no plan is selected, redirect to plan selection
    if (!effectivePlanId) {
      toast.error("Please select a plan before proceeding to payment");
      navigate('/onboarding/plan-selection');
    }
  }, [user, selectedPlanId, billingFrequency, navigate, membershipState]);
  
  const createCheckoutMutation = useMutation({
    mutationFn: async () => {
      // Check plan from context, location state, or localStorage
      const locationPlanId = membershipState?.planId;
      const storedPlanId = localStorage.getItem('selectedPlanId');
      const planId = selectedPlanId || locationPlanId || storedPlanId;
      
      // Check billing frequency from context, location state, or localStorage
      const locationFrequency = membershipState?.billingFrequency;
      const storedFrequency = localStorage.getItem('billingFrequency') as 'monthly' | 'quarterly' | 'annual' | null;
      const frequency = billingFrequency || locationFrequency || storedFrequency || 'annual';
      
      // Check selected add-on from location state or localStorage
      const locationAddOn = membershipState?.selectedAddOnId;
      const storedAddOn = localStorage.getItem('selectedAddOnId');
      const addOnId = locationAddOn || storedAddOn || null;
      
      if (!planId) {
        const error = "Please select a plan before proceeding";
        console.error(error);
        setErrorMessage(error);
        return null;
      }
      
      if (!user) {
        const error = "Please log in before proceeding to payment";
        console.error(error);
        setErrorMessage(error);
        navigate('/signup');
        return null;
      }
      
      setErrorMessage(null); // Clear previous errors
      console.log("Creating checkout session for plan:", planId, "with billing frequency:", frequency);
      
      // Save the user's plan selection to their metadata
      console.log("Updating user metadata with plan selection");
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          selectedPlan: planId,
          billingFrequency: frequency
        }
      });
      
      if (updateError) {
        console.error("Error updating user metadata:", updateError);
        // Continue anyway, not critical
      }
      
      // If concierge doctor plan, navigate to calculator
      if (planId === 'concierge') {
        console.log("Concierge plan selected, navigating to calculator");
        return '/onboarding/concierge-calculator';
      }
      
      try {
        console.log("Calling createCheckoutSession");
        setCheckoutTime(new Date());
        
        // Get Supernova eligibility from location state
        const isSupernovaMember = membershipState?.isSupernovaMember || false;
        
        // Create Stripe checkout session using our service function
        const result = await createCheckoutSession(
          planId,
          frequency,
          undefined,
          false,
          undefined,
          isSupernovaMember,
          addOnId
        );
        
        if (result.error) {
          console.error("Checkout session creation error:", result.error);
          setErrorMessage(result.error);
          throw new Error(result.error);
        }
        
        console.log("Checkout session created successfully");
        return result.url ? result.url : null;
      } catch (error) {
        console.error('Error creating checkout session:', error);
        setErrorMessage(error instanceof Error ? error.message : "Unknown checkout error");
        throw error;
      }
    },
    onSuccess: (result) => {
      if (result === '/onboarding/concierge-calculator') {
        console.log("Navigating to concierge calculator");
        navigate(result);
      } else if (typeof result === 'string' && result.startsWith('http')) {
        // Add analytics tracking for checkout redirect
        try {
          supabase.from('page_views').insert({
            path: '/checkout-redirect',
            user_agent: navigator.userAgent,
            referrer: document.referrer || location.pathname,
            user_id: user?.id
          });
        } catch (e) {
          // Non-critical, so just log
          console.error("Failed to log analytics for checkout:", e);
        }
        
        // Open the checkout URL in the browser
        window.location.href = result;
        console.log('Redirecting to Stripe checkout');
        
        // Show a toast that we're redirecting
        toast.info("Redirecting to secure checkout...");
      } else {
        toast.error("Something went wrong with the payment process");
        console.error("Unexpected checkout result:", result);
      }
    },
    onError: (error) => {
      console.error('Checkout error:', error);
      toast.error('Failed to create checkout session. Please try again.');
      // Error message is already set in the mutation function
    }
  });
  
  const handleProceedToPayment = () => {
    if (!user) {
      toast.error("Please create an account to continue");
      navigate('/signup');
      return;
    }
    
    console.log("Payment proceeding with authenticated user:", user.email);
    createCheckoutMutation.mutate();
  };
  
  const handleBack = () => {
    navigate('/onboarding/agreements');
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Payment</h2>
          <p className="text-sm text-muted-foreground">
            Proceed to payment to complete your membership registration
          </p>
        </div>
        
        {errorMessage ? (
          <PaymentError errorMessage={errorMessage} />
        ) : (
          <PaymentSuccess />
        )}
        
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={createCheckoutMutation.isPending}
          >
            Back
          </Button>
          <Button 
            onClick={handleProceedToPayment}
            disabled={createCheckoutMutation.isPending || !user}
            className="flex items-center gap-2"
          >
            {createCheckoutMutation.isPending ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : 'Proceed to Payment'}
          </Button>
        </div>
        
        {/* Debug information - only in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-2 border border-dashed border-gray-300 rounded text-xs text-gray-500">
            <p>User: {user?.email || 'Not logged in'}</p>
            <p>Plan ID: {selectedPlanId || membershipState?.planId || localStorage.getItem('selectedPlanId') || 'Not selected'}</p>
            <p>Billing: {billingFrequency || membershipState?.billingFrequency || localStorage.getItem('billingFrequency') || 'Not selected'}</p>
            {checkoutTime && (
              <p>Last checkout attempt: {checkoutTime.toLocaleTimeString()}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentView;
