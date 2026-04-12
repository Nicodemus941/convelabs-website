
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface VerifyPaymentResult {
  success: boolean;
  status?: string;
  amount?: number;
  error?: string;
}

/**
 * Verifies a payment session with Stripe via a Supabase Edge Function
 * 
 * @param sessionId - The Stripe checkout session ID to verify
 * @returns A promise resolving to the verification result
 */
export async function verifyPayment(sessionId: string): Promise<VerifyPaymentResult> {
  try {
    console.log("Verifying payment session:", sessionId);
    
    // Call the Supabase Edge Function to verify the payment
    const { data, error } = await supabase.functions.invoke('verify-checkout-session', {
      body: { sessionId }
    });
    
    if (error) {
      console.error("Payment verification error:", error);
      return { 
        success: false, 
        error: `Verification error: ${error.message}` 
      };
    }
    
    console.log("Payment verification response:", data);
    
    if (!data) {
      return { 
        success: false, 
        error: "No data returned from payment verification" 
      };
    }
    
    // Check the payment status
    if (data.status === 'complete' || data.status === 'paid') {
      // Record successful payment analytics
      try {
        await supabase.from('page_views').insert({
          path: '/payment-success',
          user_agent: navigator.userAgent,
          referrer: document.referrer
        });
      } catch (e) {
        // Non-critical analytics error
        console.error("Failed to log payment analytics:", e);
      }
      
      return {
        success: true,
        status: data.status,
        amount: data.amount_total || data.amount
      };
    }
    
    // Payment is not complete
    return {
      success: false,
      status: data.status,
      error: `Payment requires attention: ${data.status}`
    };
  } catch (error) {
    console.error("Error in payment verification:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown verification error"
    };
  }
}

/**
 * Updates a payment record in the database with verification details
 * 
 * @param paymentId - The ID of the payment record to update
 * @param verificationData - The verification data to save
 */
export async function updatePaymentVerification(
  paymentId: string, 
  verificationData: { 
    status: string; 
    verified_at: string;
    amount_total?: number;
    payment_method?: string;
  }
): Promise<boolean> {
  try {
    // Note: We'll use this function once the payments table is created
    console.log("Would update payment verification:", paymentId, verificationData);
    
    return true;
  } catch (error) {
    console.error("Error updating payment verification:", error);
    return false;
  }
}
