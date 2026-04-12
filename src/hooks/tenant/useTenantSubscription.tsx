
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export function useTenantSubscription() {
  const [isLoading, setIsLoading] = useState(false);
  const { currentTenant } = useTenant();
  const navigate = useNavigate();

  const createSubscriptionCheckout = async (
    tierId: string,
    userId: string,
    organizationName: string,
    returnUrl?: string
  ) => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase.functions.invoke('tenant-subscription-checkout', {
        body: {
          tierId,
          userId,
          organizationName,
          returnUrl
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.url) {
        window.location.href = data.url;
        return { success: true };
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating subscription checkout:', error);
      toast.error('Failed to create subscription checkout. Please try again.');
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  };

  const getTenantSubscriptionTier = async (tenantId: string) => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('tenants')
        .select(`
          subscription_tier_id,
          subscription_start_date,
          trial_ends_at,
          tenant_subscription_tiers (*)
        `)
        .eq('id', tenantId)
        .single();
      
      if (error) throw error;
      
      return {
        tierId: data.subscription_tier_id,
        tierDetails: data.tenant_subscription_tiers,
        startDate: data.subscription_start_date,
        trialEndsAt: data.trial_ends_at
      };
    } catch (error) {
      console.error('Error fetching tenant subscription:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const upgradeSubscription = async (newTierId: string) => {
    if (!currentTenant) {
      toast.error('No organization selected');
      return { success: false };
    }

    try {
      setIsLoading(true);
      
      // We'll use the same checkout function but for an existing tenant
      return await createSubscriptionCheckout(
        newTierId, 
        currentTenant.owner_id,
        currentTenant.name,
        `${window.location.origin}/tenant/dashboard/${currentTenant.id}`
      );
    } catch (error) {
      console.error('Error upgrading subscription:', error);
      toast.error('Failed to upgrade subscription. Please try again.');
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  };

  const manageBilling = async () => {
    if (!currentTenant) {
      toast.error('No organization selected');
      return { success: false };
    }

    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('create-billing-portal', {
        body: { tenantId: currentTenant.id },
      });

      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
        return { success: true };
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (error) {
      console.error('Error creating billing portal session:', error);
      toast.error('Failed to access billing portal. Please try again.');
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createSubscriptionCheckout,
    getTenantSubscriptionTier,
    upgradeSubscription,
    manageBilling,
    isLoading
  };
}
