
import { createSupabaseAdmin } from './client.ts';

// Check if user has opted in for a specific email type
export const userHasOptedIn = async (userId: string, emailType: 'marketing_emails' | 'appointment_reminders' | 'service_updates' | 'billing_notifications'): Promise<boolean> => {
  if (!userId) return true; // If no user ID, assume opt-in
  
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('email_preferences')
      .select(emailType)
      .eq('user_id', userId)
      .single();
      
    if (error) {
      console.error('Error checking email preferences:', error);
      return true; // Default to allowing emails if we can't check preferences
    }
    
    return data?.[emailType] ?? true;
  } catch (error) {
    console.error('Error in userHasOptedIn:', error);
    return true; // Default to allowing emails on error
  }
};
