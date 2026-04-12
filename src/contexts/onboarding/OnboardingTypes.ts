
export interface OnboardingContextType {
  fullName: string;
  setFullName: (name: string) => void;
  email: string;
  setEmail: (email: string) => void;
  mobileNumber: string;
  setMobileNumber: (number: string) => void;
  password: string;
  setPassword: (password: string) => void;
  selectedPlanId: string | null;
  setSelectedPlanId: (id: string | null) => void;
  billingFrequency: 'monthly' | 'quarterly' | 'annual';
  setBillingFrequency: (frequency: 'monthly' | 'quarterly' | 'annual') => void;
  dateOfBirth: string;
  setDateOfBirth: (dob: string) => void;
  address: {
    street: string;
    city: string;
    state: string;
    zipcode: string;
  };
  setAddress: (address: { street: string; city: string; state: string; zipcode: string }) => void;
  insuranceProvider: string;
  setInsuranceProvider: (provider: string) => void;
  insuranceId: string;
  setInsuranceId: (id: string) => void;
  patientCount: number;
  setPatientCount: (count: number) => void;
  leadId: string | null;
  userId: string | null;
  isSubmitting: boolean;
  submitLightAccount: () => Promise<boolean>;
  goToNextStep: () => void;
  currentStep: number;
  resumeId: string | null;
  loadResumeData: (id: string) => Promise<boolean>;
  isLoading: boolean;
  resetOnboarding: () => void;
  agreementsAccepted: boolean;
  setAgreementsAccepted: (accepted: boolean) => void;
}
