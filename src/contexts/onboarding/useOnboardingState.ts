
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';

export function useOnboardingState() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
  // Basic account info
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Plan selection
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingFrequency, setBillingFrequency] = useState<'monthly' | 'quarterly' | 'annual'>('annual');
  
  // Agreements
  const [agreementsAccepted, setAgreementsAccepted] = useState(false);
  
  // Post-payment onboarding
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zipcode: '',
  });
  const [insuranceProvider, setInsuranceProvider] = useState('');
  const [insuranceId, setInsuranceId] = useState('');
  
  // Concierge doctor specific
  const [patientCount, setPatientCount] = useState(5);
  
  // For abandonment recovery
  const [resumeId, setResumeId] = useState<string | null>(null);

  const submitLightAccount = async (): Promise<boolean> => {
    try {
      setIsSubmitting(true);
      
      if (!fullName || !email || !mobileNumber || !password) {
        toast.error('Please fill in all required fields');
        setIsSubmitting(false);
        return false;
      }
      
      // Sign up the user with Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            mobile_number: mobileNumber
          }
        }
      });
      
      if (error) {
        console.error('Error creating account:', error);
        toast.error(error.message || 'Failed to create account');
        return false;
      }
      
      if (data.user) {
        setUserId(data.user.id);
        toast.success('Account created successfully!');
        
        // Store user data for post-payment page
        localStorage.setItem('userFullName', fullName);
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userMobile', mobileNumber);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error creating account:', error);
      toast.error('Failed to create account. Please try again.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const goToNextStep = () => {
    setCurrentStep(prev => prev + 1);
  };

  const loadResumeData = async (id: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { email, user_metadata } = userData.user;
        
        setEmail(email || '');
        setFullName(user_metadata?.full_name || '');
        setMobileNumber(user_metadata?.mobile_number || '');
        
        if (user_metadata?.selectedPlan) {
          setSelectedPlanId(user_metadata.selectedPlan);
        }
        
        if (user_metadata?.billingFrequency) {
          setBillingFrequency(user_metadata.billingFrequency as 'monthly' | 'quarterly' | 'annual');
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error loading resume data:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const resetOnboarding = () => {
    setFullName('');
    setEmail('');
    setMobileNumber('');
    setPassword('');
    setSelectedPlanId(null);
    setBillingFrequency('annual');
    setDateOfBirth('');
    setAddress({
      street: '',
      city: '',
      state: '',
      zipcode: '',
    });
    setInsuranceProvider('');
    setInsuranceId('');
    setPatientCount(5);
    setLeadId(null);
    setUserId(null);
    setCurrentStep(1);
    setResumeId(null);
    setAgreementsAccepted(false);
  };
  
  return {
    // Basic account info
    fullName,
    setFullName,
    email,
    setEmail,
    mobileNumber,
    setMobileNumber,
    password,
    setPassword,
    leadId,
    userId,
    
    // Plan selection
    selectedPlanId,
    setSelectedPlanId,
    billingFrequency,
    setBillingFrequency,
    
    // Agreements
    agreementsAccepted,
    setAgreementsAccepted,
    
    // Post-payment onboarding
    dateOfBirth,
    setDateOfBirth,
    address,
    setAddress,
    insuranceProvider,
    setInsuranceProvider,
    insuranceId,
    setInsuranceId,
    
    // Concierge doctor specific
    patientCount,
    setPatientCount,
    
    // Functions and state
    isSubmitting,
    submitLightAccount,
    goToNextStep,
    currentStep,
    resumeId,
    loadResumeData,
    isLoading,
    resetOnboarding
  };
}
