
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { createCheckoutSession } from '@/services/stripe';

export const useMembershipPlanSelection = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [showAgreement, setShowAgreement] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [pendingPlanName, setPendingPlanName] = useState<string>('');
  const [selectedAddOnId, setSelectedAddOnId] = useState<string | null>(null);
  const [isAnnualOnly, setIsAnnualOnly] = useState<boolean>(false);
  
  const handleAddOnSelect = (addOnId: string | null) => {
    setSelectedAddOnId(addOnId);
  };

  const handlePlanSelect = (planId: string, plans: any[]) => {
    // Find the selected plan to get its name
    const selectedPlan = plans?.find(plan => plan.id === planId);
    
    // Check if this is an annual-only plan
    if (selectedPlan?.name === 'Essential Care') {
      setIsAnnualOnly(true);
    } else {
      setIsAnnualOnly(false);
    }
    
    // If user is not authenticated, redirect to account creation first
    if (!user) {
      if (selectedPlan) {
        toast.info("Please create an account to proceed with this plan");
        navigate("/signup", { 
          state: { 
            fromMembership: true,
            planId, 
            planName: selectedPlan.name,
            billingFrequency: isAnnualOnly ? 'annual' : undefined,
            isSupernovaMember: false,
            selectedAddOnId: selectedAddOnId
          } 
        });
      } else {
        toast.error("Could not find selected plan. Please try again.");
      }
      return;
    }
    
    // If user is authenticated, show agreement modal
    if (selectedPlan) {
      setPendingPlanId(planId);
      setPendingPlanName(selectedPlan.name);
      setShowAgreement(true);
    } else {
      toast.error('Could not find selected plan. Please try again.');
    }
  };
  
  const handleCheckout = async (
    billingFrequency: 'monthly' | 'quarterly' | 'annual',
    plans: any[],
    isSupernovaEligible: boolean
  ) => {
    if (!pendingPlanId) {
      toast.error('No plan selected. Please try again.');
      return;
    }
    
    setCheckingOut(pendingPlanId);
    
    try {
      // Check if this is the Essential Care plan - if so, only allow annual billing
      const selectedPlan = plans?.find(plan => plan.id === pendingPlanId);
      const isEssentialCare = selectedPlan?.name === 'Essential Care';
      const currentBillingFreq = isEssentialCare ? 'annual' : billingFrequency;
      
      // Create checkout session with Supernova benefits if eligible, but not for Essential Care
      const result = await createCheckoutSession(
        pendingPlanId,
        currentBillingFreq,
        undefined,
        false,
        undefined,
        isSupernovaEligible && !isEssentialCare,
        selectedAddOnId
      );
      
      if (result.error) {
        console.error('Checkout error:', result.error);
        toast.error(result.error);
      } else if (result.url) {
        // Open the checkout URL in the browser
        window.location.href = result.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Checkout failed. Please try again.');
    } finally {
      setCheckingOut(null);
      setPendingPlanId(null);
    }
  };

  return {
    checkingOut,
    showAgreement, 
    setShowAgreement,
    pendingPlanId,
    pendingPlanName,
    selectedAddOnId,
    isAnnualOnly, 
    setIsAnnualOnly,
    handleAddOnSelect,
    handlePlanSelect,
    handleCheckout
  };
};
