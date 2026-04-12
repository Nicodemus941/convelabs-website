
import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import ConciergeCalculator from '@/components/onboarding/ConciergeCalculator';

const ConciergeCalculatorPage: React.FC = () => {
  return (
    <OnboardingLayout currentStep={2} totalSteps={3}>
      <ConciergeCalculator />
    </OnboardingLayout>
  );
};

export default ConciergeCalculatorPage;
