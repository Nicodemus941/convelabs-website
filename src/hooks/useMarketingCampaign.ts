
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { sendMarketingCampaign as sendMarketingCampaignService, sendTestMarketingCampaign as sendTestMarketingCampaignService } from '@/services/email-marketing';

export interface MarketingCampaignRequest {
  templateName: string;
  templateData: {
    customMessage?: string;
    subject: string;
    [key: string]: any;
  };
  recipientFilter?: {
    includeFoundingMembers: boolean;
    includeSupernovaMembers: boolean;
    onlyActiveMembers: boolean;
  };
  manualEmails?: string[];
  senderName: string;
  senderEmail: string;
  replyTo: string;
  scheduledFor?: string;
  testMode?: boolean;
}

export interface MarketingCampaignResult {
  success: boolean;
  scheduled?: boolean;
  scheduled_id?: string;
  scheduled_for?: string;
  estimated_recipients?: number;
  total?: number;
  sent?: number;
  failed?: number;
  recipient?: string;
  error?: {
    message: string;
  };
}

export const useMarketingCampaign = () => {
  const [loading, setLoading] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [campaignResults, setCampaignResults] = useState<{
    scheduled?: boolean;
    scheduled_id?: string;
    scheduled_for?: string;
    estimated_recipients?: number;
    total?: number;
    sent?: number;
    failed?: number;
    recipient?: string;
  } | null>(null);
  const { toast } = useToast();

  const sendCampaign = async (campaignData: MarketingCampaignRequest) => {
    setLoading(true);
    try {
      const result = testMode 
        ? await sendTestMarketingCampaignService(campaignData)
        : await sendMarketingCampaignService(campaignData);

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to send campaign');
      }

      setCampaignResults({
        scheduled: result.scheduled,
        scheduled_id: result.scheduled_id,
        scheduled_for: result.scheduled_for,
        estimated_recipients: result.estimated_recipients,
        total: result.total,
        sent: result.sent,
        failed: result.failed,
        recipient: result.recipient
      });

      // Different toast messages based on scheduled or immediate
      if (result.scheduled) {
        toast({
          title: "Campaign Scheduled",
          description: `Campaign scheduled for ${new Date(result.scheduled_for!).toLocaleString()}. Estimated recipients: ${result.estimated_recipients}.`,
          variant: "default",
        });
      } else {
        const recipientText = campaignData.manualEmails && campaignData.manualEmails.length > 0 
          ? 'manually entered email addresses' 
          : 'members';

        toast({
          title: testMode ? "Test Email Sent" : "Campaign Started",
          description: testMode 
            ? `Test email sent to ${result.recipient}`
            : `Campaign started. ${result.sent} emails queued for delivery to ${recipientText}.`,
          variant: "default",
        });
      }

      return true;
    } catch (error: any) {
      console.error('Error sending marketing campaign:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send marketing campaign.",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const sendTestEmail = async (campaignData: MarketingCampaignRequest) => {
    setTestMode(true);
    const result = await sendCampaign(campaignData);
    setTestMode(false);
    return result;
  };

  return {
    loading,
    testMode,
    campaignResults,
    sendCampaign,
    sendTestEmail,
  };
};
