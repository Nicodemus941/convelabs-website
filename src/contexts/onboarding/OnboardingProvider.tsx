
import React, { createContext, useContext } from 'react';
import { useOnboardingState } from './useOnboardingState';
import { OnboardingContextType } from './OnboardingTypes';

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const onboardingState = useOnboardingState();

  return (
    <OnboardingContext.Provider value={onboardingState}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};
