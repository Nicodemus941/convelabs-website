
import React from "react";
import { useNavigate } from "react-router-dom";
import PricingHeader from "./PricingHeader";
import PricingPlansGrid from "./PricingPlansGrid";
import AddOnsSection from "./AddOnsSection";
import OrderSummary from "./OrderSummary";
import { usePricingSelection } from "@/hooks/usePricingSelection";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from '@/components/ui/sonner';

export const PricingCards = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    selectedPlan,
    selectedAddOns,
    isProcessing,
    pricingPlans,
    addOns,
    toggleAddOn,
    calculateTotalPrice,
    handleCheckout
  } = usePricingSelection();

  const handlePlanSelection = (planId: string) => {
    // Store the selected plan and add-ons in localStorage
    localStorage.setItem('selectedPlanId', planId);
    localStorage.setItem('selectedAddOns', JSON.stringify(selectedAddOns));
    
    // If user is not authenticated, redirect to account creation
    if (!user) {
      toast.info("Please create an account to proceed with this plan");
      navigate("/signup", { 
        state: { 
          fromMembership: true,
          planId, 
          planName: pricingPlans.find(p => p.id === planId)?.name
        } 
      });
      return;
    }
    
    // If user is authenticated, proceed to checkout
    handleCheckout(planId);
  };

  return (
    <section className="py-12 bg-gray-50">
      <div className="container mx-auto px-4">
        <PricingHeader />
        
        <PricingPlansGrid 
          pricingPlans={pricingPlans}
          selectedPlan={selectedPlan}
          isProcessing={isProcessing}
          onCheckout={handlePlanSelection}
        />
        
        <AddOnsSection 
          addOns={addOns}
          selectedAddOns={selectedAddOns}
          onToggleAddOn={toggleAddOn}
        />

        {selectedPlan && (
          <OrderSummary
            selectedPlan={pricingPlans.find(p => p.id === selectedPlan)}
            selectedAddOns={addOns.filter(addon => selectedAddOns.includes(addon.id))}
            totalPrice={calculateTotalPrice()}
            onCheckout={() => handlePlanSelection(selectedPlan)}
            isProcessing={isProcessing}
          />
        )}
      </div>
    </section>
  );
};
