
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OnboardingContextType } from './OnboardingTypes';
import { toast } from '@/components/ui/sonner';

export const useOnboardingState = (): OnboardingContextType => {
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [mobileNumber, setMobileNumber] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingFrequency, setBillingFrequency] = useState<'monthly' | 'quarterly' | 'annual'>('annual');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Function to create a new account
  const submitLightAccount = async (): Promise<boolean> => {
    if (!fullName || !email || !mobileNumber || !password) {
      toast.error('Please fill all required fields');
      return false;
    }

    setIsSubmitting(true);

    try {
      // Split full name into first name and last name
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      // Sign up the user with Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            firstName,
            lastName,
            phone: mobileNumber,
            role: 'patient'
          }
        }
      });

      if (error) {
        console.error('Error creating account:', error);
        toast.error(error.message || 'Failed to create account');
        return false;
      }

      if (data) {
        toast.success('Account created successfully!');
        
        // Store user data for post-payment page
        localStorage.setItem('userFullName', fullName);
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userMobile', mobileNumber);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error in account creation:', error);
      toast.error('An unexpected error occurred. Please try again.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    fullName,
    email,
    mobileNumber,
    password,
    selectedPlanId,
    billingFrequency,
    isSubmitting,
    setFullName,
    setEmail,
    setMobileNumber,
    setPassword,
    setSelectedPlanId,
    setBillingFrequency,
    submitLightAccount
  };
};
