import { supabase } from "@/integrations/supabase/client";

export interface CorporateCheckoutParams {
  tenantId: string;
  seats: number;
  executiveSeats?: number;
  billingFrequency: 'monthly' | 'annual';
  returnUrl?: string;
}

export interface CheckoutResult {
  url?: string;
  sessionId?: string;
  error?: string;
}

export const createCorporateCheckout = async (params: CorporateCheckoutParams): Promise<CheckoutResult> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'You must be logged in to start corporate checkout.' };
    }

    const { data, error } = await supabase.functions.invoke('create-corporate-checkout', {
      body: {
        tenantId: params.tenantId,
        seats: params.seats,
        executiveSeats: params.executiveSeats || 0,
        billingFrequency: params.billingFrequency,
        returnUrl: params.returnUrl,
      }
    });

    if (error) {
      return { error: error.message };
    }

    return { url: data?.url };
  } catch (err) {
    console.error('Error in createCorporateCheckout:', err);
    return { error: 'Failed to start corporate checkout. Please try again.' };
  }
};
