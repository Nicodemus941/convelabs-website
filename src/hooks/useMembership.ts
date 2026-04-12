
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';

interface MembershipPlan {
  id: string;
  name: string;
  description: string;
  monthly_price: number;
  quarterly_price: number;
  annual_price: number;
  credits_per_year: number;
  max_users: number;
  is_family_plan: boolean;
  is_concierge_plan: boolean;
}

interface UserMembership {
  id: string;
  user_id: string;
  plan_id: string;
  plan?: MembershipPlan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_frequency: string;
  credits_remaining: number;
  credits_allocated_annual: number | null;
  rollover_credits: number | null;
  rollover_expiration_date: string | null;
  shared_pool_id: string | null;
  is_primary_member: boolean;
  next_renewal: string;
  status: 'active' | 'canceled' | 'past_due' | 'inactive';
  founding_member?: boolean | null;
  founding_member_signup_date?: string | null;
  next_billing_override?: string | null;
}

interface CreditPool {
  id: string;
  plan_id: string;
  credits_total: number;
  credits_used: number;
  owner_id: string;
  next_renewal: string;
}

interface CreditPack {
  id: string;
  user_id: string;
  credits_amount: number;
  credits_remaining: number;
  price: number;
  purchase_date: string;
  is_active: boolean;
  expires_at: string | null;
}

export const useMembership = () => {
  const { user } = useAuth();
  const [hasMembership, setHasMembership] = useState<boolean>(false);
  const [totalCreditsAvailable, setTotalCreditsAvailable] = useState<number>(0);
  const [daysToRolloverExpiry, setDaysToRolloverExpiry] = useState<number | null>(null);
  
  // Ensure we have a valid UUID for user ID
  const isValidUuid = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);

  // Fetch membership plans
  const {
    data: plans,
    isLoading: plansLoading,
    error: plansError,
  } = useQuery({
    queryKey: ['membershipPlans'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('membership_plans')
          .select('*');

        if (error) {
          console.error('Error fetching membership plans:', error);
          return [] as MembershipPlan[]; // Return empty array instead of showing toast
        }

        return data as MembershipPlan[];
      } catch (error) {
        console.error('Error in membershipPlans query:', error);
        return [] as MembershipPlan[]; // Return empty array on error
      }
    },
    enabled: true, // Always fetch plans regardless of auth state
  });

  // Fetch user membership if logged in
  const {
    data: userMembership,
    isLoading: membershipLoading,
    error: membershipError,
    refetch: refetchMembership,
  } = useQuery({
    queryKey: ['userMembership', user?.id],
    queryFn: async () => {
      if (!user?.id || !isValidUuid) return null;

      try {
        const { data, error } = await supabase
          .from('user_memberships')
          .select('*, plan:plan_id(*)')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle(); // Use maybeSingle instead of single to prevent errors

        if (error) {
          console.error('Error fetching user membership:', error);
          // Only log the error, don't show toast to the user
          return null;
        }

        return data as UserMembership | null;
      } catch (error) {
        console.error('Error in userMembership query:', error);
        return null;
      }
    },
    enabled: !!user?.id && isValidUuid,
    retry: 2, // Retry failed requests twice
    retryDelay: 1000, // Wait 1 second between retries
  });

  // Fetch credit packs if logged in
  const {
    data: creditPacks,
    isLoading: creditPacksLoading,
    error: creditPacksError,
    refetch: refetchCreditPacks,
  } = useQuery({
    queryKey: ['creditPacks', user?.id],
    queryFn: async () => {
      if (!user?.id || !isValidUuid) return [];

      try {
        const { data, error } = await supabase
          .from('credit_packs')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .gt('credits_remaining', 0)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

        if (error) {
          console.error('Error fetching credit packs:', error);
          return [];
        }

        return data as CreditPack[] || [];
      } catch (error) {
        console.error('Error in creditPacks query:', error);
        return [];
      }
    },
    enabled: !!user?.id && isValidUuid,
    retry: 2,
    retryDelay: 1000,
  });

  // Fetch credit pool if user has one
  const {
    data: creditPool,
    isLoading: poolLoading,
    error: poolError,
  } = useQuery({
    queryKey: ['creditPool', userMembership?.shared_pool_id],
    queryFn: async () => {
      if (!userMembership?.shared_pool_id) return null;

      try {
        const { data, error } = await supabase
          .from('credit_pools')
          .select('*')
          .eq('id', userMembership.shared_pool_id)
          .maybeSingle(); // Use maybeSingle to prevent errors

        if (error) {
          console.error('Error fetching credit pool:', error);
          return null;
        }

        return data as CreditPool;
      } catch (error) {
        console.error('Error in creditPool query:', error);
        return null;
      }
    },
    enabled: !!userMembership?.shared_pool_id,
    retry: 2,
    retryDelay: 1000,
  });

  // Check if user has available credits
  const {
    data: hasCredits,
    isLoading: creditsCheckLoading,
    refetch: refetchCreditsCheck,
  } = useQuery({
    queryKey: ['hasCredits', user?.id],
    queryFn: async () => {
      if (!user?.id || !isValidUuid) return false;

      try {
        const { data, error } = await supabase
          .rpc('check_available_credits', { user_id: user.id });

        if (error) {
          console.error('Error checking credits:', error);
          return false;
        }

        return data;
      } catch (error) {
        console.error('Error in hasCredits query:', error);
        return false;
      }
    },
    enabled: !!user?.id && isValidUuid,
    retry: 2,
    retryDelay: 1000,
  });

  // Calculate total available credits and days to rollover expiry
  useEffect(() => {
    let totalCredits = 0;
    
    // Add membership credits
    if (userMembership) {
      // For shared pool
      if (userMembership.shared_pool_id && creditPool) {
        totalCredits += (creditPool.credits_total - creditPool.credits_used);
      } 
      // For individual credits
      else if (userMembership.credits_remaining) {
        totalCredits += userMembership.credits_remaining;
        
        // Add rollover credits
        if (userMembership.rollover_credits) {
          totalCredits += userMembership.rollover_credits;
        }
      }
    }
    
    // Add credit pack credits
    if (creditPacks && creditPacks.length > 0) {
      totalCredits += creditPacks.reduce((sum, pack) => sum + pack.credits_remaining, 0);
    }
    
    setTotalCreditsAvailable(totalCredits);
    
    // Calculate days to rollover expiry
    if (userMembership?.rollover_expiration_date && userMembership.rollover_credits && userMembership.rollover_credits > 0) {
      const expiryDate = new Date(userMembership.rollover_expiration_date);
      const today = new Date();
      const diffTime = expiryDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setDaysToRolloverExpiry(diffDays > 0 ? diffDays : 0);
    } else {
      setDaysToRolloverExpiry(null);
    }
  }, [userMembership, creditPool, creditPacks]);

  useEffect(() => {
    setHasMembership(!!userMembership);
  }, [userMembership]);

  return {
    plans,
    userMembership,
    creditPool,
    creditPacks,
    hasMembership,
    hasCredits,
    totalCreditsAvailable,
    daysToRolloverExpiry,
    isLoading: plansLoading || membershipLoading || poolLoading || creditsCheckLoading || creditPacksLoading,
    refetchCreditsCheck,
    refetchMembership,
    refetchCreditPacks,
    error: plansError || membershipError || poolError || creditPacksError,
  };
};
