
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Type-safe client using Database type
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Enable detecting auth session in URL to handle email verifications better
    flowType: 'pkce' // Use PKCE flow for more secure authentication
  },
  global: {
    headers: {
      'X-Client-Info': 'convelabs-web'
    }
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Helper to get auth token for API calls
export const getAuthToken = async () => {
  try {
    // First try to get the session
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      return data.session.access_token;
    }
    
    // If no session, try to refresh
    const { data: refreshData } = await supabase.auth.refreshSession();
    return refreshData?.session?.access_token;
  } catch (error) {
    console.error("Error getting auth token:", error);
    return null;
  }
};

export const signOut = async () => {
  try {
    console.log("Executing signOut helper function");
    
    // First clear all auth-related items from localStorage
    localStorage.removeItem('convelabs_user');
    localStorage.removeItem('supabase.auth.token');
    localStorage.removeItem('sb-yluyonhrxxtyuiyrdixl-auth-token');
    
    // Then sign out from Supabase
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    
    if (error) {
      console.error("Error during signOut:", error);
      throw error;
    }
    
    console.log("Successfully signed out from Supabase");
    return { success: true };
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};
