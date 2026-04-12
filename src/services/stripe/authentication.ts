
import { supabase } from '@/integrations/supabase/client';

// Ensure we have a valid auth token before trying to create a checkout session
export const ensureAuthToken = async (): Promise<string | null> => {
  try {
    // Try to get current session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session error:', sessionError);
      return null;
    }
    
    let token = sessionData?.session?.access_token;
    
    // If no token, attempt to refresh the session
    if (!token) {
      console.log('No token found, attempting to refresh session...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.error('Failed to refresh session:', refreshError);
        return null;
      }
      
      token = refreshData?.session?.access_token;
      
      if (!token) {
        console.error('Failed to refresh authentication token');
        return null;
      }
      console.log('Session refreshed successfully');
    }
    
    return token;
  } catch (error) {
    console.error('Error ensuring auth token:', error);
    return null;
  }
};
