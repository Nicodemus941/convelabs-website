
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Only detect session in URL on auth-related pages (login, reset-password, signup)
const isAuthPage = typeof window !== 'undefined' &&
  (window.location.pathname.includes('/reset-password') ||
   window.location.pathname.includes('/login') ||
   window.location.pathname.includes('/signup'));

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isAuthPage,
    flowType: 'pkce',
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

// Helper to get auth token — reads from localStorage to avoid lock contention
export const getAuthToken = () => {
  try {
    const stored = localStorage.getItem('sb-yluyonhrxxtyuiyrdixl-auth-token');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.access_token || null;
    }
    return null;
  } catch {
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
