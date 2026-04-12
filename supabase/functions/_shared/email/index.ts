
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0';
import { EmailData, EmailResult } from './types.ts';

const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY');
const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN');

if (!mailgunApiKey || !mailgunDomain) {
  console.warn('MAILGUN_API_KEY or MAILGUN_DOMAIN is not set. Email sending will fail.');
}

export const createSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  
  const client = createClient(supabaseUrl, supabaseServiceRoleKey);
  
  return client;
};

/**
 * Fetches an email template from Supabase by name.
 * @param templateName The name of the email template to fetch.
 * @returns The email template, or null if not found.
 */
export const getEmailTemplate = async (templateName: string): Promise<{
  id: string;
  name: string;
  subject_template: string;
  body_template: string;
  created_at: string;
} | null> => {
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('name', templateName)
    .single();

  if (error) {
    console.error('Error fetching email template:', error);
    return null;
  }

  return data;
};
