
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SubscriptionTier } from '@/types/subscriptionTiers';
import { toast } from 'sonner';

export function useSubscriptionTiers() {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const loadSubscriptionTiers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('tenant_subscription_tiers')
        .select('*')
        .order('monthly_price', { ascending: true });
      
      if (error) {
        throw error;
      }
      
      if (data) {
        const formattedTiers: SubscriptionTier[] = data.map(tier => ({
          id: tier.id,
          name: tier.name,
          description: tier.description || '',
          monthlyPrice: tier.monthly_price,
          features: tier.features as string[]
        }));
        
        setTiers(formattedTiers);
      }
    } catch (err) {
      console.error('Error loading subscription tiers:', err);
      setError(err as Error);
      toast.error('Failed to load subscription options. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptionTiers();
  }, []);

  return {
    tiers,
    isLoading,
    error,
    refresh: loadSubscriptionTiers
  };
}
