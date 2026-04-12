
import { EmailRecipient, EmailResult } from './types.ts';
import { sendEmail } from './providers.ts';
import { getRenderedTemplate } from './templates.ts';

/**
 * Process a single email recipient for a marketing campaign
 */
export async function processEmailRecipient(
  supabase: any,
  recipient: EmailRecipient,
  templateName: string,
  templateData: Record<string, any>,
  senderName?: string,
  senderEmail?: string,
  replyTo?: string
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  try {
    // Check if user has opted out of marketing emails (only for registered users)
    if (recipient.id) {
      const { data: preferences } = await supabase
        .from('email_preferences')
        .select('marketing_emails')
        .eq('user_id', recipient.id)
        .single();
      
      // Skip if user has opted out
      if (preferences && preferences.marketing_emails === false) {
        console.log(`Skipping ${recipient.email} - opted out of marketing emails`);
        return { success: false, skipped: true };
      }
    }
    
    // Personalize template data with recipient info
    const personalizedData = {
      ...templateData,
      firstName: recipient.firstName || '',
      fullName: recipient.fullName || ''
    };
    
    // Get personalized template
    const personalizedTemplate = await getRenderedTemplate(templateName, personalizedData);
    
    // Send email
    const result = await sendEmail({
      to: recipient.email,
      subject: personalizedTemplate.subject,
      html: personalizedTemplate.html,
      text: personalizedTemplate.text,
      from: senderName ? `${senderName} <${senderEmail || 'marketing@convelabs.com'}>` : undefined,
      replyTo: replyTo
    });
    
    // Log the email
    await logEmailSend(
      supabase,
      recipient,
      personalizedTemplate.subject,
      personalizedTemplate.html,
      personalizedTemplate.text,
      result,
      templateName
    );
    
    return result;
  } catch (error) {
    console.error(`Error sending email to ${recipient.email}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Log email send to the database
 */
export async function logEmailSend(
  supabase: any,
  recipient: EmailRecipient,
  subject: string,
  bodyHtml: string,
  bodyText: string | undefined,
  result: { success: boolean; error?: string },
  templateName: string
): Promise<void> {
  const logData = {
    recipient_email: recipient.email,
    ...(recipient.id ? { user_id: recipient.id } : {}),
    subject: subject,
    body_html: bodyHtml,
    body_text: bodyText,
    status: result.success ? 'sent' : 'failed',
    error_message: result.success ? null : result.error,
    metadata: {
      campaign: true,
      ...(recipient.id ? {} : { manual_recipient: true }),
      template_name: templateName
    }
  };

  await supabase.from('email_logs').insert(logData);
}

/**
 * Process a batch of recipients for a marketing campaign
 */
export async function processBatchedRecipients(
  supabase: any,
  recipients: EmailRecipient[],
  templateName: string,
  templateData: Record<string, any>,
  senderName?: string,
  senderEmail?: string,
  replyTo?: string
): Promise<{success: boolean; total: number; sent: number; failed: number}> {
  // Process in batches to avoid rate limits
  const BATCH_SIZE = 10;
  const BATCH_DELAY = 1000; // 1 second between batches
  let successCount = 0;
  let failureCount = 0;
  
  // Process recipients in batches
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    
    // Process each recipient in the batch
    const batchPromises = batch.map(recipient => 
      processEmailRecipient(
        supabase,
        recipient,
        templateName,
        templateData,
        senderName,
        senderEmail,
        replyTo
      )
    );
    
    // Wait for all emails in the batch to be processed
    const batchResults = await Promise.all(batchPromises);
    
    // Update counts
    batchResults.forEach(result => {
      if (result.success) {
        successCount++;
      } else if (!result.skipped) {
        failureCount++;
      }
    });
    
    // Delay between batches to avoid rate limits
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  return {
    success: true,
    total: recipients.length,
    sent: successCount,
    failed: failureCount
  };
}
