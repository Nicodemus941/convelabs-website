
import React from 'react';
import PlanCard from './PlanCard';
import { Plan } from './PlanTypes';
import { formatCurrency, getBillingPrice, getBillingPeriod } from './PlanUtils';

interface PlanGridProps {
  plans: Plan[];
  selectedPlan: Plan | null;
  selectedBilling: 'monthly' | 'quarterly' | 'annual';
  onSelectPlan: (plan: Plan) => void;
}

const PlanGrid: React.FC<PlanGridProps> = ({
  plans,
  selectedPlan,
  selectedBilling,
  onSelectPlan
}) => {
  const renderPlanPrice = (plan: Plan) => {
    // For concierge plan, show custom text
    if (plan.isConciergeDoctor) {
      return (
        <div className="mt-4">
          <div className="text-xl font-bold">Starting at $80/patient</div>
          <div className="text-sm text-muted-foreground">Custom pricing based on patient count</div>
        </div>
      );
    }
    
    const price = getBillingPrice(plan, selectedBilling);
    const period = getBillingPeriod(selectedBilling);
    
    return (
      <div className="mt-4">
        <div className="text-2xl font-bold">{formatCurrency(price)}</div>
        <div className="text-sm text-muted-foreground">{period}</div>
      </div>
    );
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-12">
      {plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          isSelected={selectedPlan?.id === plan.id}
          onSelect={onSelectPlan}
          renderPriceDisplay={renderPlanPrice}
        />
      ))}
    </div>
  );
};

export default PlanGrid;
