
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { getEmailPreview } from '@/services/marketing';
import { EmailTemplate } from '@/types/marketingTypes';

export async function loadEmailPreview(
  templateName: string,
  templateData: {
    customMessage: string;
    subject: string;
  },
  senderInfo: {
    senderName: string;
    senderEmail: string;
    replyTo: string;
  },
  selectedTemplate: EmailTemplate | null
) {
  if (!selectedTemplate) {
    toast("No template selected", {
      description: "Please select an email template first."
    });
    return { success: false, previewHtml: '' };
  }
  
  try {
    const result = await getEmailPreview(
      templateName,
      {
        customMessage: templateData.customMessage,
        firstName: 'Preview',
        fullName: 'Preview User',
        subject: templateData.subject
      },
      {
        senderName: senderInfo.senderName,
        senderEmail: senderInfo.senderEmail,
        replyTo: senderInfo.replyTo
      }
    );
    
    if (!result.success) {
      throw new Error(result.error?.message || "Preview generation failed");
    }
    
    return { success: true, previewHtml: result.previewHtml || '' };
  } catch (err: any) {
    console.error('Error generating preview:', err);
    toast("Preview generation failed", {
      description: err.message || "Could not generate email preview. Please try again."
    });
    return { success: false, previewHtml: '' };
  }
}
