
import React from 'react';
import LoadingState from './post-payment/LoadingState';
import ErrorState from './post-payment/ErrorState';
import OnboardingTabs from './post-payment/OnboardingTabs';
import NavigationButtons from './post-payment/NavigationButtons';
import { useOnboardingData } from './post-payment/useOnboardingData';

const PostPaymentOnboarding: React.FC = () => {
  const {
    isLoading,
    sessionId,
    userData,
    activeStep,
    isConciergeDoctor,
    handleStepChange,
    handleNextStep
  } = useOnboardingData();
  
  if (isLoading) {
    return <LoadingState />;
  }
  
  if (!sessionId && !userData) {
    return <ErrorState />;
  }
  
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Complete Your Account Setup</h1>
        <p className="text-muted-foreground">
          You're almost done! Please complete the following steps to finish setting up your account.
        </p>
      </div>
      
      <OnboardingTabs 
        activeStep={activeStep}
        isConciergeDoctor={isConciergeDoctor}
        onStepChange={handleStepChange}
      />
      
      <NavigationButtons 
        activeStep={activeStep}
        isConciergeDoctor={isConciergeDoctor}
        handleNextStep={handleNextStep}
      />
    </div>
  );
};

export default PostPaymentOnboarding;
