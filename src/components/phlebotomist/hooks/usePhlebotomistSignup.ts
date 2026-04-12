
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PhlebotomistSignupFormValues } from '../utils/formUtils';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { useTenantSubscription } from '@/hooks/tenant/useTenantSubscription';

export const usePhlebotomistSignup = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { createTenant } = useTenant();
  const { createSubscriptionCheckout } = useTenantSubscription();

  const handleSignup = async (data: PhlebotomistSignupFormValues) => {
    if (!data.subscriptionTierId) {
      toast.error('Please select a subscription plan');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Split name into first and last name
      const nameParts = data.contactName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Register the new user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            firstName,
            lastName,
            full_name: data.contactName.trim(),
            role: 'phlebotomist' // Set role for phlebotomists
          }
        }
      });
      
      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Failed to create account');
      }
      
      // Create tenant record for the phlebotomist organization
      const tenant = await createTenant({
        name: data.organizationName,
        contact_email: data.email,
        branding: {
          primary_color: '#5a67d8',
          secondary_color: '#4c51bf'
        },
        owner_id: authData.user.id
      });
      
      // Save additional phlebotomist details to a profile or custom table if needed
      // This would be a good place to save organization type, team size, etc.
      
      // Redirect to Stripe checkout for subscription
      await createSubscriptionCheckout(
        data.subscriptionTierId,
        authData.user.id,
        data.organizationName,
        `${window.location.origin}/phlebotomist/dashboard/${tenant.id}`
      );
      
      toast.success('Your account has been created! Redirecting to payment...');
    } catch (error: any) {
      console.error('Signup error:', error);
      toast.error(error.message || 'Failed to create your organization. Please try again.');
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    handleSignup
  };
};
