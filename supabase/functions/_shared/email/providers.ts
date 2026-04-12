
import { EmailData, EmailResult } from './types.ts';

// Send email with Mailgun API
export const sendWithMailgun = async (emailData: EmailData): Promise<EmailResult> => {
  try {
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN');
    
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      throw new Error('Mailgun API key or domain not configured');
    }
    
    const sender = emailData.from || 'ConveLabs <notifications@convelabs.com>';
    
    // Prepare form data for Mailgun
    const formData = new FormData();
    formData.append("from", sender);
    formData.append("to", Array.isArray(emailData.to) ? emailData.to.join(",") : emailData.to);
    formData.append("subject", emailData.subject || '');
    if (emailData.html) formData.append("html", emailData.html);
    if (emailData.text) formData.append("text", emailData.text);
    if (emailData.replyTo) formData.append("h:Reply-To", emailData.replyTo);
    
    const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mailgun API error: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      id: data.id
    };
  } catch (error) {
    console.error('Mailgun API error:', error);
    throw error;
  }
};

// Email sending function that can use different providers
export const sendEmail = async (emailData: EmailData): Promise<EmailResult> => {
  try {
    // Default the service to Mailgun if available
    if (Deno.env.get('MAILGUN_API_KEY')) {
      return await sendWithMailgun(emailData);
    }
    
    // Fallback error if no email service is configured
    throw new Error('No email service configured');
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
};
