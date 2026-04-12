
import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import PlanSelection from '@/components/onboarding/PlanSelection';

const PlanSelectionPage: React.FC = () => {
  return (
    <OnboardingLayout currentStep={2} totalSteps={3}>
      <PlanSelection />
    </OnboardingLayout>
  );
};

export default PlanSelectionPage;
