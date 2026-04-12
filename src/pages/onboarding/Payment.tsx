
import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import PaymentView from '@/components/onboarding/payment/PaymentView';
import { usePaymentVerification } from '@/components/onboarding/payment/PaymentVerification';

const PaymentPage: React.FC = () => {
  // Initialize payment verification
  usePaymentVerification();
  
  return (
    <OnboardingLayout currentStep={4} totalSteps={4}>
      <PaymentView />
    </OnboardingLayout>
  );
};

export default PaymentPage;
