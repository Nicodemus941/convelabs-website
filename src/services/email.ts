
import { supabase } from '@/integrations/supabase/client';
import { EmailResult } from '@/types/auth';

export const sendWelcomeEmail = async (
  email: string, 
  firstName: string, 
  userId: string
): Promise<EmailResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-welcome-email', {
      body: { 
        email, 
        firstName,
        userId
      }
    });
    
    if (error) {
      console.error('Send welcome email error:', error);
      return { success: false, error: { message: error.message || 'Failed to send welcome email' } };
    }
    
    return { success: true, ...data };
  } catch (err: any) {
    console.error('Send welcome email exception:', err);
    return { success: false, error: { message: err.message || 'An unexpected error occurred' } };
  }
};

// Interface for templated email data
interface TemplatedEmailRequest {
  to: string;
  templateName: string;
  templateData: Record<string, any>;
  userId?: string;
}

// Function to send a templated email
export const sendTemplatedEmail = async (
  request: TemplatedEmailRequest
): Promise<EmailResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: request
    });

    if (error) {
      console.error('Send templated email error:', error);
      return { success: false, error: { message: error.message || 'Failed to send templated email' } };
    }
    
    return { success: true, ...data };
  } catch (err: any) {
    console.error('Send templated email exception:', err);
    return { success: false, error: { message: err.message || 'An unexpected error occurred' } };
  }
};

// Function to send appointment confirmation
export const sendAppointmentConfirmation = async (appointmentId: string): Promise<EmailResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-appointment-confirmation', {
      body: { appointmentId }
    });

    if (error) {
      console.error('Send appointment confirmation error:', error);
      return { success: false, error: { message: error.message || 'Failed to send appointment confirmation' } };
    }
    
    return { success: true, ...data };
  } catch (err: any) {
    console.error('Send appointment confirmation exception:', err);
    return { success: false, error: { message: err.message || 'An unexpected error occurred' } };
  }
};

// Function to send franchise notification
export const sendFranchiseNotification = async (
  franchiseData: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    hasExperience: string;
    estimatedBudget: string;
  }
): Promise<EmailResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-franchise-notification', {
      body: franchiseData
    });

    if (error) {
      console.error('Send franchise notification error:', error);
      return { success: false, error: { message: error.message || 'Failed to send notification' } };
    }
    
    return { success: true, ...data };
  } catch (err: any) {
    console.error('Send franchise notification exception:', err);
    return { success: false, error: { message: err.message || 'An unexpected error occurred' } };
  }
};

// We're importing these from the dedicated email-marketing.ts file now
import { MarketingCampaignRequest, MarketingCampaignResult, sendMarketingCampaign, sendTestMarketingCampaign } from './email-marketing';
// Fix: Use 'export type' for interfaces to comply with 'isolatedModules'
export type { MarketingCampaignRequest, MarketingCampaignResult };
// Export functions normally
export { sendMarketingCampaign, sendTestMarketingCampaign };

// The functions below are now deprecated and re-exported from email-marketing.ts for backward compatibility
export const sendTestMarketingEmail = async (
  request: MarketingCampaignRequest
): Promise<MarketingCampaignResult> => {
  console.warn('sendTestMarketingEmail is deprecated. Use sendTestMarketingCampaign instead.');
  return sendTestMarketingCampaign(request);
};
