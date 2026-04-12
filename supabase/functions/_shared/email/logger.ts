
import { createSupabaseAdmin } from './client.ts';
import { EmailLogParams } from './types.ts';

// Log email to database
export const logEmailSend = async (params: EmailLogParams) => {
  try {
    const supabase = createSupabaseAdmin();
    
    const { data, error } = await supabase
      .from('email_logs')
      .insert({
        user_id: params.userId,
        template_id: params.templateId,
        recipient_email: params.recipientEmail,
        subject: params.subject,
        body_html: params.bodyHtml,
        body_text: params.bodyText,
        status: params.status,
        error_message: params.error,
        metadata: params.metadata
      })
      .select()
      .single();
      
    if (error) {
      console.error('Error logging email:', error);
    }
    
    return data;
  } catch (error) {
    console.error('Error in logEmailSend:', error);
  }
};
