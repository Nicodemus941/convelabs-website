
import React from "react";
import PricingCard from "./PricingCard";
import { PricingPlan } from "@/hooks/usePricingSelection";

interface PricingPlansGridProps {
  pricingPlans: PricingPlan[];
  selectedPlan: string | null;
  isProcessing: boolean;
  onCheckout: (planId: string) => void;
}

const PricingPlansGrid: React.FC<PricingPlansGridProps> = ({ 
  pricingPlans, 
  selectedPlan, 
  isProcessing,
  onCheckout 
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
      {pricingPlans.map((plan) => (
        <PricingCard
          key={plan.id}
          plan={plan}
          isSelected={selectedPlan === plan.id}
          isProcessing={isProcessing && selectedPlan === plan.id}
          onCheckout={() => onCheckout(plan.id)}
        />
      ))}
    </div>
  );
};

export default PricingPlansGrid;
