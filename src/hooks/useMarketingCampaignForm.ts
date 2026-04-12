
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMarketingCampaign } from '@/hooks/useMarketingCampaign';
import { useMarketingTemplate } from '@/hooks/useMarketingTemplate';
import { loadEmailPreview } from '@/utils/marketingPreview';
import { MarketingCampaignFormValues } from '@/types/marketingTypes';

export * from '@/types/marketingTypes';

export function useMarketingCampaignForm(onSuccess?: () => void) {
  const { loading, campaignResults, sendCampaign, sendTestEmail } = useMarketingCampaign();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');

  const form = useForm<MarketingCampaignFormValues>({
    defaultValues: {
      templateId: '',
      senderName: 'ConveLabs',
      senderEmail: 'marketing@convelabs.com',
      replyTo: 'support@convelabs.com',
      subject: 'Special Offer from ConveLabs',
      includeFoundingMembers: true,
      includeSupernovaMembers: true,
      onlyActiveMembers: true,
      customMessage: '',
      manualEmails: '',
      recipientMode: 'members',
      schedulingMode: 'now',
      scheduledDate: null,
      scheduledTime: null
    }
  });

  const { selectedTemplate } = useMarketingTemplate(form);

  const onSubmit = async (values: MarketingCampaignFormValues) => {
    if (!selectedTemplate) return;
    
    // Process manual emails if in manual mode
    const manualEmails = values.recipientMode === 'manual' 
      ? values.manualEmails.split(',')
          .map(email => email.trim())
          .filter(email => email.length > 0)
      : undefined;
    
    // Handle scheduling
    let scheduledFor: string | undefined = undefined;
    
    if (values.schedulingMode === 'later' && values.scheduledDate) {
      const scheduledDate = new Date(values.scheduledDate);
      
      // If time is specified, add it to the date
      if (values.scheduledTime) {
        const [hours, minutes] = values.scheduledTime.split(':').map(Number);
        scheduledDate.setHours(hours, minutes);
      } else {
        // Default to noon if no time specified
        scheduledDate.setHours(12, 0, 0, 0);
      }
      
      scheduledFor = scheduledDate.toISOString();
    }
    
    const campaignData = {
      templateName: 'marketing-campaign',
      templateData: {
        customMessage: values.customMessage,
        subject: values.subject
      },
      recipientFilter: values.recipientMode === 'members' ? {
        includeFoundingMembers: values.includeFoundingMembers,
        includeSupernovaMembers: values.includeSupernovaMembers,
        onlyActiveMembers: values.onlyActiveMembers,
      } : undefined,
      manualEmails: manualEmails,
      senderName: values.senderName,
      senderEmail: values.senderEmail,
      replyTo: values.replyTo,
      scheduledFor: scheduledFor
    };
    
    await sendCampaign(campaignData);
    if (onSuccess) onSuccess();
  };

  const handleTestEmail = async () => {
    if (!selectedTemplate) return;
    
    const values = form.getValues();
    
    // Process manual emails if in manual mode
    const manualEmails = values.recipientMode === 'manual' 
      ? values.manualEmails.split(',')
          .map(email => email.trim())
          .filter(email => email.length > 0)
      : undefined;
    
    if (values.recipientMode === 'manual' && (!manualEmails || manualEmails.length === 0)) {
      // When using manual mode, we need at least one email
      form.setError('manualEmails', { 
        type: 'required', 
        message: 'Please enter at least one email address' 
      });
      return;
    }
    
    const campaignData = {
      templateName: 'marketing-campaign',
      templateData: {
        customMessage: values.customMessage,
        subject: values.subject
      },
      recipientFilter: values.recipientMode === 'members' ? {
        includeFoundingMembers: values.includeFoundingMembers,
        includeSupernovaMembers: values.includeSupernovaMembers,
        onlyActiveMembers: values.onlyActiveMembers,
      } : undefined,
      manualEmails: manualEmails,
      senderName: values.senderName,
      senderEmail: values.senderEmail,
      replyTo: values.replyTo
    };
    
    await sendTestEmail(campaignData);
  };

  const handleLoadPreview = async () => {
    setPreviewLoading(true);
    try {
      const values = form.getValues();
      const result = await loadEmailPreview(
        'marketing-campaign',
        {
          customMessage: values.customMessage,
          subject: values.subject
        },
        {
          senderName: values.senderName,
          senderEmail: values.senderEmail,
          replyTo: values.replyTo
        },
        selectedTemplate
      );
      
      if (result.success) {
        setPreviewHtml(result.previewHtml);
        setShowPreview(true);
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  return {
    form,
    loading,
    campaignResults,
    selectedTemplate,
    previewLoading,
    showPreview,
    previewHtml,
    setShowPreview,
    setPreviewLoading,
    onSubmit,
    handleTestEmail,
    loadPreview: handleLoadPreview
  };
}
