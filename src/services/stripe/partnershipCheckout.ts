
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';

// Import CheckoutResult type
export interface CheckoutResult {
  url?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Creates a checkout session for a partnership platform purchase
 */
export const createPartnershipCheckout = async (
  planId: string,
  amount: number,
  metadata: Record<string, string>
): Promise<CheckoutResult> => {
  try {
    console.log('Creating partnership checkout session for plan:', planId, 'amount:', amount);
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();

    // For partnership purchases, we require authentication now
    if (!user) {
      console.error('User not authenticated');
      return { error: 'You must be logged in to proceed with checkout' };
    }
    
    console.log('User authenticated:', user.email);

    // Ensure we have a valid auth token to make the Edge Function call
    const { data, error } = await supabase.functions.invoke('create-partnership-checkout', {
      body: {
        planId,
        amount,
        metadata: {
          ...metadata,
          user_id: user.id,
          user_email: user.email
        }
      },
    });

    if (error) {
      console.error('Error creating partnership checkout session:', error);
      return { error: `Error creating checkout session: ${error.message}` };
    }

    if (!data) {
      console.error('No data returned from create-partnership-checkout');
      return { error: 'No data returned from checkout service' };
    }

    if (data.error) {
      console.error('Error from checkout service:', data.error);
      return { error: data.error };
    }

    console.log('Checkout session created successfully:', data);

    return { url: data.url, sessionId: data.sessionId };
  } catch (error) {
    console.error('Error in createPartnershipCheckout:', error);
    return { error: 'An unexpected error occurred. Please try again later.' };
  }
};
