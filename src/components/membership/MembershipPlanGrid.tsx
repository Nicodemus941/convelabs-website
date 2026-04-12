
import React from 'react';
import { MembershipPlanCard, PlanProps } from './MembershipPlanCard';
import { ConciergeDoctorCard } from './ConciergeDoctorCard';

interface MembershipPlanGridProps {
  planCards: PlanProps[];
  billingFrequency: 'monthly' | 'quarterly' | 'annual';
  checkingOut: string | null;
  onSubscribe: (planId: string) => void;
}

export const MembershipPlanGrid = ({
  planCards,
  billingFrequency,
  checkingOut,
  onSubscribe
}: MembershipPlanGridProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {planCards.map((plan) => (
        <MembershipPlanCard
          key={plan.id}
          plan={plan}
          billingFrequency={plan.is_annual_only ? 'annual' : billingFrequency}
          onSubscribe={() => onSubscribe(plan.id)}
          isCheckingOut={checkingOut === plan.id}
        />
      ))}
      
      {/* Concierge Doctor Plan Card - placed after all other plans */}
      <ConciergeDoctorCard />
    </div>
  );
};
