
import { supabase } from '@/integrations/supabase/client';
import { ensureAuthToken } from './authentication';

// Process lab test checkout
export const createLabTestCheckout = async (
  orderId: string,
  tests: { id: string; name: string; price: number }[]
) => {
  try {
    // Get a valid authentication token
    const token = await ensureAuthToken();
    
    if (!token) {
      console.error('No authentication token available');
      return { error: 'You must be logged in to create a checkout session. Please try logging out and back in.' };
    }

    const { data, error } = await supabase.functions.invoke('lab-checkout', {
      body: {
        orderId,
        tests,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    if (error) {
      console.error('Error creating lab test checkout:', error);
      return { error: error.message };
    }

    return { sessionId: data.sessionId, url: data.url };
  } catch (error) {
    console.error('Error in createLabTestCheckout:', error);
    return { error: 'Failed to process lab test checkout' };
  }
};
