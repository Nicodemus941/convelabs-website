
import { supabase } from '@/integrations/supabase/client';
import { MarketingCampaignRequest, MarketingCampaignResult } from '@/hooks/useMarketingCampaign';

/**
 * Send a marketing campaign to multiple recipients
 */
export const sendMarketingCampaign = async (campaignData: MarketingCampaignRequest): Promise<MarketingCampaignResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-marketing-campaign', {
      body: campaignData
    });

    if (error) {
      throw error;
    }

    return {
      success: true,
      ...data
    };
  } catch (error: any) {
    console.error('Error in marketing API call:', error);
    return {
      success: false,
      error: {
        message: error.message || 'Failed to send marketing campaign'
      }
    };
  }
};

/**
 * Send a test marketing email to verify template
 */
export const sendTestMarketingCampaign = async (campaignData: MarketingCampaignRequest): Promise<MarketingCampaignResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        to: campaignData.manualEmails?.[0] || 'test@example.com',
        templateName: campaignData.templateName,
        templateData: campaignData.templateData,
        from: `${campaignData.senderName} <${campaignData.senderEmail}>`,
        replyTo: campaignData.replyTo,
        isTest: true
      }
    });

    if (error) {
      throw error;
    }

    return {
      success: true,
      sent: 1,
      total: 1,
      recipient: campaignData.manualEmails?.[0] || 'test@example.com'
    };
  } catch (error: any) {
    console.error('Error in test marketing email API call:', error);
    return {
      success: false,
      error: {
        message: error.message || 'Failed to send test email'
      }
    };
  }
};

/**
 * Get a preview of an email template with custom data
 */
export const getEmailPreview = async (
  templateName: string,
  templateData: Record<string, any>,
  senderInfo: {
    senderName: string;
    senderEmail: string;
    replyTo: string;
  }
): Promise<{ success: boolean; previewHtml?: string; error?: { message: string } }> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        to: 'preview@example.com',
        templateName,
        templateData: {
          ...templateData,
          previewMode: true,
        },
        from: `${senderInfo.senderName} <${senderInfo.senderEmail}>`,
        replyTo: senderInfo.replyTo,
        previewOnly: true
      }
    });

    if (error) throw error;

    if (!data?.previewHtml) {
      throw new Error('No preview HTML returned');
    }

    return {
      success: true,
      previewHtml: data.previewHtml
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'Failed to generate email preview'
      }
    };
  }
};

