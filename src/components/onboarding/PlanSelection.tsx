
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';

import { membershipPlans } from './plans/PlansData';
import { Plan } from './plans/PlanTypes';
import PlanGrid from './plans/PlanGrid';
import BillingSection from './plans/BillingSection';

const PlanSelection: React.FC = () => {
  const navigate = useNavigate();
  const { 
    selectedPlanId,
    setSelectedPlanId, 
    billingFrequency,
    setBillingFrequency
  } = useOnboarding();
  
  const [selectedBilling, setSelectedBilling] = useState<'monthly' | 'quarterly' | 'annual'>(
    billingFrequency || 'annual'
  );
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Set selected plan based on ID if available
  useEffect(() => {
    if (selectedPlanId) {
      const plan = membershipPlans.find(p => p.id === selectedPlanId);
      if (plan) setSelectedPlan(plan);
    }
  }, [selectedPlanId]);
  
  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setSelectedPlanId(plan.id);
    
    // Scroll to billing selection
    document.getElementById('billing-section')?.scrollIntoView({ 
      behavior: 'smooth' 
    });
  };
  
  const handleContinue = async () => {
    if (!selectedPlan) {
      toast.error('Please select a plan to continue');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Save the selected plan to user metadata
      await supabase.auth.updateUser({
        data: {
          selectedPlan: selectedPlan.id,
          billingFrequency: selectedBilling
        }
      });
      
      // Save the selection in onboarding context
      setSelectedPlanId(selectedPlan.id);
      setBillingFrequency(selectedBilling);
      
      // Navigate to agreements page
      navigate('/onboarding/agreements');
    } catch (error) {
      console.error('Error saving plan selection:', error);
      toast.error('Failed to save your plan selection. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Choose Your Plan</h1>
        <p className="text-muted-foreground">
          Select the membership plan that suits your needs.
        </p>
      </div>
      
      <PlanGrid
        plans={membershipPlans}
        selectedPlan={selectedPlan}
        selectedBilling={selectedBilling}
        onSelectPlan={handleSelectPlan}
      />
      
      <div id="billing-section" className="space-y-8">
        {selectedPlan && (
          <BillingSection
            selectedPlan={selectedPlan}
            selectedBilling={selectedBilling}
            setSelectedBilling={setSelectedBilling}
          />
        )}
        
        <div className="flex justify-end">
          <Button 
            size="lg" 
            onClick={handleContinue}
            disabled={isSubmitting || !selectedPlan}
          >
            {isSubmitting ? 'Processing...' : 'Continue to Agreements'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PlanSelection;
