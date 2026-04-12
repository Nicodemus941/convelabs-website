
import { useState, useEffect } from 'react';
import { useMembership } from '@/hooks/useMembership';
import { useAddOns } from '@/hooks/useAddOns';
import { useMembershipPlanSelection } from '@/hooks/useMembershipPlanSelection';
import { useAuth } from '@/contexts/AuthContext';

import { BillingFrequencyToggle } from './BillingFrequencyToggle';
import { MembershipPlanGrid } from './MembershipPlanGrid';
import { MembershipLoading } from './MembershipLoading';
import { CurrentMembershipCard } from './CurrentMembershipCard';
import MembershipAgreementModal from './MembershipAgreementModal';
import { generatePlanFeatures, sortPlansByOrder } from './MembershipPlanUtils';
import { toast } from '@/components/ui/sonner';

const MembershipPlans = () => {
  const [billingFrequency, setBillingFrequency] = useState<'monthly' | 'quarterly' | 'annual'>('annual');
  const { plans, userMembership, isLoading, error } = useMembership();
  const { addOns, isLoading: addOnsLoading, error: addOnsError } = useAddOns();
  const { user } = useAuth();
  
  // Log debugging information
  useEffect(() => {
    console.log("MembershipPlans rendering with:", { 
      plans, 
      userMembership, 
      isLoading, 
      error, 
      addOnsLoading, 
      addOnsError 
    });
    
    if (error) {
      console.error("Membership error:", error);
      toast.error("Error loading membership data. Please try again.");
    }
    
    if (addOnsError) {
      console.error("Add-ons error:", addOnsError);
    }
  }, [plans, userMembership, isLoading, error, addOnsLoading, addOnsError]);
  
  const {
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
  } = useMembershipPlanSelection();

  // Convert raw plans to plan cards with features and filter out the Test Plan
  const planCards = plans
    ?.filter(plan => !plan.is_concierge_plan && plan.name !== 'Test Plan')
    .map(plan => {
      const features = generatePlanFeatures(plan);
      const is_popular = plan.name === 'Individual +1';
      const is_annual_only = plan.name === 'Essential Care';
      
      return {
        ...plan,
        features,
        is_popular,
        is_annual_only
      };
    }) || [];

  // Sort plans in the specified order - put Essential Care first
  const sortedPlanCards = sortPlansByOrder(planCards);
  
  // Check if there's an annual-only plan selected
  useEffect(() => {
    if (pendingPlanId) {
      const selectedPlan = plans?.find(plan => plan.id === pendingPlanId);
      if (selectedPlan?.name === 'Essential Care') {
        setIsAnnualOnly(true);
        setBillingFrequency('annual');
      } else {
        setIsAnnualOnly(false);
      }
    }
  }, [pendingPlanId, plans, setIsAnnualOnly]);

  // Show loading state
  if (isLoading || addOnsLoading) {
    return <MembershipLoading />;
  }

  // Show error state if there's an error loading membership data
  if (error) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Error Loading Membership Data</h2>
        <p className="mb-4">We encountered an issue loading the membership plans. Please try again later.</p>
        <button 
          className="px-4 py-2 bg-primary text-white rounded-md" 
          onClick={() => window.location.reload()}
        >
          Reload Page
        </button>
      </div>
    );
  }

  // Show current membership if user has one
  if (user && userMembership) {
    return <CurrentMembershipCard userMembership={userMembership} />;
  }

  // Return the main content if we reach this point
  return (
    <div className="space-y-8">
      <BillingFrequencyToggle 
        billingFrequency={billingFrequency} 
        setBillingFrequency={setBillingFrequency} 
        annualOnly={isAnnualOnly}
      />

      <MembershipPlanGrid 
        planCards={sortedPlanCards}
        billingFrequency={billingFrequency}
        checkingOut={checkingOut}
        onSubscribe={(planId) => handlePlanSelect(planId, plans || [])}
      />
      
      {/* Membership Agreement Modal */}
      <MembershipAgreementModal
        open={showAgreement}
        onOpenChange={setShowAgreement}
        planId={pendingPlanId || ''}
        planName={pendingPlanName}
        billingFrequency={isAnnualOnly ? 'annual' : billingFrequency}
        selectedAddOnId={selectedAddOnId}
        onAccept={() => handleCheckout(billingFrequency, plans || [], false)}
      />
    </div>
  );
};

export default MembershipPlans;
