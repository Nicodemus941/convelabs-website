
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { useMarketingCampaignForm } from '@/hooks/useMarketingCampaignForm';

// Import subcomponents
import CampaignFormHeader from './CampaignFormHeader';
import CampaignResultAlert from './CampaignResultAlert';
import EmailTemplateSelector from './EmailTemplateSelector';
import EmailContentFields from './EmailContentFields';
import SenderFields from './SenderFields';
import RecipientTabs from './RecipientTabs';
import SchedulingOptions from './SchedulingOptions';
import EmailPreview from './EmailPreview';
import TestEmailButton from './TestEmailButton';
import CampaignActions from './CampaignActions';

interface MarketingCampaignFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

const MarketingCampaignForm: React.FC<MarketingCampaignFormProps> = ({ onSuccess, onCancel }) => {
  const {
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
    loadPreview
  } = useMarketingCampaignForm(onSuccess);

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <Card className="max-w-3xl mx-auto">
      <CampaignFormHeader />
      <CardContent>
        <CampaignResultAlert campaignResults={campaignResults} />
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <EmailTemplateSelector 
              form={form} 
              onTemplateChange={() => {}} // Template selection is handled in the hook
            />
            <EmailContentFields form={form} />
            <SenderFields form={form} />
            <RecipientTabs form={form} />
            <SchedulingOptions />
            
            {/* Preview and Test Email buttons */}
            <div className="flex justify-between items-center">
              <EmailPreview 
                form={form} 
                previewLoading={previewLoading} 
                setPreviewLoading={setPreviewLoading} 
                showPreview={showPreview} 
                setShowPreview={setShowPreview} 
                selectedTemplate={selectedTemplate}
                previewHtml={previewHtml}
                onLoadPreview={loadPreview}
              />
              <TestEmailButton 
                loading={loading} 
                hasTemplate={!!selectedTemplate}
                onSendTest={handleTestEmail}
              />
            </div>
            
            <CampaignActions 
              loading={loading} 
              onCancel={handleCancel} 
              onSubmit={form.handleSubmit(onSubmit)}
              hasTemplate={!!selectedTemplate}
              isScheduled={form.watch('schedulingMode') === 'later'}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default MarketingCampaignForm;
