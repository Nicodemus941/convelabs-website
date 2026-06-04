
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

      // ── EXISTING-ACCOUNT GUARD (the Brian Hammontree case) ──────────────
      // Supabase returns NO error when the email already exists (enumeration
      // protection). It returns a user with an EMPTY identities array and no
      // session. Previously `if (data)` was always truthy → we showed
      // "Account created!" and pushed the user into checkout with no session,
      // which spun and silently dumped them back. Detect it and convert the
      // dead-end into a one-click recovery: email a set-password link.
      const alreadyRegistered = !!data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
      if (alreadyRegistered) {
        try {
          await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password?redirect=${encodeURIComponent('/pricing')}`,
          });
        } catch (e) { console.warn('reset email send failed (non-blocking):', e); }
        toast.message('You already have an account', {
          description: `We found an account for ${email} and just emailed you a secure link to set your password and continue. Check your inbox.`,
          duration: 12000,
        });
        return false;
      }

      // Genuine new account.
      if (data?.user) {
        toast.success('Account created successfully!');
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
