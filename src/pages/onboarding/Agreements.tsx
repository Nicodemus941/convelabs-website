
import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import AgreementForm from '@/components/onboarding/onboarding-steps/AgreementForm';

const AgreementsPage: React.FC = () => {
  return (
    <OnboardingLayout currentStep={3} totalSteps={4}>
      <AgreementForm />
    </OnboardingLayout>
  );
};

export default AgreementsPage;
