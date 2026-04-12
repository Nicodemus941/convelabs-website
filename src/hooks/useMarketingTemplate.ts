
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { UseFormReturn } from 'react-hook-form';
import { EmailTemplate, MarketingCampaignFormValues } from '@/types/marketingTypes';

export function useMarketingTemplate(form: UseFormReturn<MarketingCampaignFormValues>) {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);

  // Fetch template details when templateId changes
  const { data: templateDetails } = useQuery({
    queryKey: ['templateDetails', form.watch('templateId')],
    queryFn: async () => {
      const templateId = form.getValues('templateId');
      if (!templateId) return null;
      
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', templateId)
        .single();
        
      if (error) throw error;
      return data as EmailTemplate;
    },
    enabled: !!form.watch('templateId')
  });

  // Update selected template when templateDetails changes
  useEffect(() => {
    if (templateDetails) {
      setSelectedTemplate(templateDetails);
      
      // Set subject from template if not already set
      if (!form.getValues('subject') && templateDetails.subject_template) {
        form.setValue('subject', templateDetails.subject_template.replace(/{{.*?}}/g, '').trim() || 'Special Offer from ConveLabs');
      }
    }
  }, [templateDetails, form]);

  return { selectedTemplate };
}
