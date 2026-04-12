
import React from 'react';
import { Navigate } from 'react-router-dom';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import LightAccountCreation from '@/components/onboarding/LightAccountCreation';
import { useAuth } from '@/contexts/AuthContext';

const AccountCreationPage: React.FC = () => {
  const { user } = useAuth();
  
  // If user is already logged in, redirect to plan selection
  if (user) {
    return <Navigate to="/onboarding/plan-selection" replace />;
  }

  return (
    <OnboardingLayout currentStep={1} totalSteps={3}>
      <LightAccountCreation />
    </OnboardingLayout>
  );
};

export default AccountCreationPage;
