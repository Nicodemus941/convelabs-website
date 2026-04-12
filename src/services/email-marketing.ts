
import { supabase } from '@/integrations/supabase/client';
import { EmailResult } from '@/types/auth';

export interface MarketingCampaignRequest {
  templateName: string;
  templateData: Record<string, any>;
  recipientFilter?: {
    includeRoles?: string[];
    excludeIds?: string[];
    specificIds?: string[];
    includeFoundingMembers?: boolean;
    includeSupernovaMembers?: boolean;
    onlyActiveMembers?: boolean;
  };
  manualEmails?: string[];
  senderName?: string;
  senderEmail?: string;
  replyTo?: string;
  scheduledFor?: string;
  testMode?: boolean;
}

export interface MarketingCampaignResult extends EmailResult {
  scheduled?: boolean;
  scheduled_id?: string;
  scheduled_for?: string;
  estimated_recipients?: number;
  total?: number;
  sent?: number;
  failed?: number;
  test_mode?: boolean;
  recipient?: string;
  message?: string;
}

/**
 * Send a marketing campaign email to multiple recipients
 */
export const sendMarketingCampaign = async (
  request: MarketingCampaignRequest
): Promise<MarketingCampaignResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-marketing-campaign', {
      body: request
    });

    if (error) {
      console.error('Send marketing campaign error:', error);
      return { 
        success: false, 
        error: { message: error.message || 'Failed to send marketing campaign' } 
      };
    }
    
    return { success: true, ...data };
  } catch (err: any) {
    console.error('Send marketing campaign exception:', err);
    return { 
      success: false, 
      error: { message: err.message || 'An unexpected error occurred' } 
    };
  }
};

/**
 * Send a test marketing campaign email to verify template and settings
 */
export const sendTestMarketingCampaign = async (
  request: Omit<MarketingCampaignRequest, 'testMode'>
): Promise<MarketingCampaignResult> => {
  return sendMarketingCampaign({
    ...request,
    testMode: true
  });
};

// Define the shape of the scheduled campaigns data
export interface ScheduledCampaign {
  id: string;
  template_name: string;
  template_data: Record<string, any>;
  sender_name: string;
  sender_email: string;
  reply_to: string;
  scheduled_for: string;
  status: 'scheduled' | 'processing' | 'completed' | 'failed';
  created_at: string;
  estimated_recipients: number;
  result?: {
    sent?: number;
    failed?: number;
    total?: number;
    message?: string;
    error?: string;
  };
  processed_at?: string;
}

/**
 * Fetch all scheduled marketing campaigns
 */
export const getScheduledCampaigns = async (): Promise<{
  data: ScheduledCampaign[] | null;
  error: Error | null;
}> => {
  try {
    // Using a custom function call instead of direct table access
    // We need to use the functions.invoke method for custom functions
    const { data, error } = await supabase.functions.invoke('get-scheduled-campaigns', {
      body: {}
    });
    
    if (error) throw error;
    
    return { data: data as ScheduledCampaign[], error: null };
  } catch (error: any) {
    console.error('Error fetching scheduled campaigns:', error);
    return { data: null, error };
  }
};

/**
 * Delete a scheduled campaign
 */
export const deleteScheduledCampaign = async (id: string): Promise<{
  success: boolean;
  error: Error | null;
}> => {
  try {
    // Using a custom function call instead of direct table access
    // We need to use the functions.invoke method for custom functions
    const { data, error } = await supabase.functions.invoke('delete-scheduled-campaign', {
      body: { id }
    });
    
    if (error) throw error;
    
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error deleting scheduled campaign:', error);
    return { success: false, error };
  }
};
