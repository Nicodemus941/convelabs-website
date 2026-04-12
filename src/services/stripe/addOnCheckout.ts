
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';

export interface AddOnCheckoutResult {
  url?: string;
  error?: string;
  sessionId?: string;
}

/**
 * Creates a checkout session for an add-on purchase
 */
export const createAddOnCheckoutSession = async (
  addOnId: string,
  billingFrequency?: 'monthly' | 'quarterly' | 'annual'
): Promise<AddOnCheckoutResult> => {
  try {
    // Authorization is required for add-on purchases
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { error: 'You must be logged in to purchase add-ons' };
    }
    
    const { data, error } = await supabase.functions.invoke('create-addon-checkout', {
      body: {
        addOnId,
        billingFrequency
      },
    });

    if (error) {
      console.error('Error creating add-on checkout session:', error);
      return { error: `Error creating checkout session: ${error.message}` };
    }

    if (!data) {
      console.error('No data returned from create-addon-checkout');
      return { error: 'No data returned from checkout service' };
    }

    if (data.error) {
      console.error('Error from checkout service:', data.error);
      return { error: data.error };
    }

    return { url: data.url, sessionId: data.sessionId };
  } catch (error) {
    console.error('Error in createAddOnCheckoutSession:', error);
    return { error: 'An unexpected error occurred. Please try again later.' };
  }
};
