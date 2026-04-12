
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';

// Mapping of step names to numbers
const STEP_MAP = {
  'security': 1,
  'details': 2,
  'booking': 3
};

export const useOnboardingData = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { login } = useAuth();
  
  const [activeStep, setActiveStep] = useState('security');
  const { userId, email } = useOnboarding();
  const [isLoading, setIsLoading] = useState(true);
  const [isConciergeDoctor, setIsConciergeDoctor] = useState(false);
  
  // Fetch checkout session details
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['checkoutSession', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      
      try {
        const response = await fetch('/api/verify-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sessionId })
        });
        
        if (!response.ok) {
          throw new Error('Failed to verify checkout session');
        }
        
        return response.json();
      } catch (error) {
        console.error('Error verifying checkout:', error);
        toast.error('Could not verify your payment. Please contact support.');
        return null;
      }
    },
    enabled: !!sessionId,
    retry: false
  });
  
  // Check if user is authenticated
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['userData'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
    enabled: !sessionLoading
  });
  
  // Check if user membership exists and its type
  const { data: membership, isLoading: membershipLoading } = useQuery({
    queryKey: ['userMembership', userData?.id],
    queryFn: async () => {
      if (!userData) return null;
      
      const { data, error } = await supabase
        .from('user_memberships')
        .select('*, plan:plan_id(*)')
        .eq('user_id', userData.id)
        .single();
        
      if (error) throw error;
      return data;
    },
    enabled: !!userData
  });
  
  // Update onboarding step in user metadata
  const updateOnboardingStepMutation = useMutation({
    mutationFn: async (step: string) => {
      if (!userData) return;
      
      // Get step number from map or default to 1
      const stepNumber = STEP_MAP[step as keyof typeof STEP_MAP] || 1;
      
      const { error } = await supabase.auth.updateUser({
        data: {
          onboarding_step: stepNumber,
          updated_at: new Date().toISOString()
        }
      });
        
      if (error) throw error;
    }
  });
  
  // Try to login the user if needed
  useEffect(() => {
    const attemptLogin = async () => {
      if (!userData && email && !userLoading) {
        try {
          // Generate a magic link or attempt login with session
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: window.location.href
            }
          });
          
          if (error) {
            console.error('Login error:', error);
          }
        } catch (error) {
          console.error('Login attempt error:', error);
        }
      }
    };
    
    attemptLogin();
  }, [userData, email, userLoading]);
  
  // Effect to determine if user is concierge doctor
  useEffect(() => {
    if (membership?.plan) {
      setIsConciergeDoctor(membership.plan.is_concierge_plan);
    }
    
    setIsLoading(sessionLoading || userLoading || membershipLoading);
  }, [membership, sessionLoading, userLoading, membershipLoading]);
  
  // Handle tab change
  const handleStepChange = (step: string) => {
    setActiveStep(step);
    updateOnboardingStepMutation.mutate(step);
  };
  
  // Handle onboarding completion
  const handleCompleteOnboarding = async () => {
    if (!userData) return;
    
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          onboarding_completed: true,
          updated_at: new Date().toISOString()
        }
      });
        
      if (error) throw error;
      
      // Navigate to appropriate dashboard
      if (isConciergeDoctor) {
        navigate('/dashboard/concierge_doctor');
      } else {
        navigate('/dashboard/patient');
      }
      
      toast.success('Onboarding completed! Welcome to ConveLabs.');
      
    } catch (error) {
      console.error('Error completing onboarding:', error);
      toast.error('Failed to complete onboarding. Please try again.');
    }
  };
  
  // Handle next step
  const handleNextStep = () => {
    if (activeStep === 'security') {
      handleStepChange('details');
    } else if (activeStep === 'details') {
      if (isConciergeDoctor) {
        handleStepChange('concierge');
      } else {
        handleStepChange('booking');
      }
    } else {
      handleCompleteOnboarding();
    }
  };
  
  return {
    isLoading,
    sessionId,
    userData,
    activeStep,
    isConciergeDoctor,
    handleStepChange,
    handleNextStep
  };
};
