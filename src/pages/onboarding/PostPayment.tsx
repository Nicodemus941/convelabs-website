
import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import PostPaymentOnboarding from '@/components/onboarding/PostPaymentOnboarding';

const PostPaymentPage: React.FC = () => {
  return (
    <OnboardingLayout currentStep={3} totalSteps={3}>
      <PostPaymentOnboarding />
    </OnboardingLayout>
  );
};

export default PostPaymentPage;
