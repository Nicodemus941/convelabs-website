
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';

export interface CheckoutResult {
  url?: string;
  error?: string;
  sessionId?: string;
}

/**
 * Creates a checkout session for a partnership software purchase
 */
export const createCheckoutSession = async (
  planId: string,
  billingFrequency: 'monthly' | 'quarterly' | 'annual' | 'one-time',
  couponCode?: string,
  isGiftPurchase?: boolean,
  metadata?: Record<string, string>,
  isSupernovaMember: boolean = false,
  supernovaAddOnId?: string | null,
  amount?: number
): Promise<CheckoutResult> => {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();

    // For partnership purchases, we allow guest checkout
    const isGuestCheckout = !user;

    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        planId,
        billingFrequency,
        userId: user?.id,
        couponCode,
        isGiftPurchase,
        metadata,
        isSupernovaMember,
        supernovaAddOnId,
        amount,
        isPartnershipPurchase: metadata?.isUpgrade ? false : true, // Don't treat upgrades as partnership purchases
        guestCheckoutEmail: isGuestCheckout ? 'guest@placeholder.com' : undefined,
        isGuestCheckout,
        isUpgrade: metadata?.isUpgrade === 'true' // Pass the upgrade flag to the edge function
      },
    });

    if (error) {
      console.error('Error creating checkout session:', error);
      return { error: `Error creating checkout session: ${error.message}` };
    }

    if (!data) {
      console.error('No data returned from create-checkout-session');
      return { error: 'No data returned from checkout service' };
    }

    if (data.error) {
      console.error('Error from checkout service:', data.error);
      return { error: data.error };
    }

    return { url: data.url, sessionId: data.sessionId };
  } catch (error) {
    console.error('Error in createCheckoutSession:', error);
    return { error: 'An unexpected error occurred. Please try again later.' };
  }
};
