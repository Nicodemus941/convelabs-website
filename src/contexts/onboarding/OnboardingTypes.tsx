
export interface OnboardingContextType {
  fullName: string;
  email: string;
  mobileNumber: string;
  password: string;
  selectedPlanId: string | null;
  billingFrequency: 'monthly' | 'quarterly' | 'annual';
  isSubmitting: boolean;
  setFullName: (name: string) => void;
  setEmail: (email: string) => void;
  setMobileNumber: (mobile: string) => void;
  setPassword: (password: string) => void;
  setSelectedPlanId: (planId: string | null) => void;
  setBillingFrequency: (frequency: 'monthly' | 'quarterly' | 'annual') => void;
  submitLightAccount: () => Promise<boolean>;
}
