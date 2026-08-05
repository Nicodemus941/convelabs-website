
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// In the native (Capacitor) app the URL is capacitor://localhost/... — there is
// never an OAuth code/hash to exchange, and supabase-js's Web-Locks-based auth
// lock can DEADLOCK inside iOS WKWebView (the app boots, then the login screen
// hangs blank). So on native: don't detect a session in the URL, and swap the
// Web Locks lock for a pass-through so auth init never stalls. Web is unchanged.
const isNativeApp = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

// Only detect session in URL on auth-related web pages (login, reset, signup).
const isAuthPage = typeof window !== 'undefined' &&
  (window.location.pathname.includes('/reset-password') ||
   window.location.pathname.includes('/login') ||
   window.location.pathname.includes('/signup'));

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isAuthPage && !isNativeApp,
    flowType: 'pkce',
    // Pass-through lock on native to avoid the WKWebView navigator.locks deadlock.
    ...(isNativeApp ? { lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => await fn() } : {}),
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

/**
 * Build a public storage URL with PROPER percent-encoding of every
 * path segment. The Supabase JS getPublicUrl() / download() helpers
 * don't encode commas — files with names like "Rienzi, Mary Ellen.pdf"
 * or "Rienzi,P.pdf" 404 because the storage CDN can't match the
 * literal comma in the URL. encodeURIComponent on each segment fixes
 * commas, spaces, parens, and every other ambiguous character.
 *
 * Use this instead of supabase.storage.from(b).getPublicUrl() whenever
 * the bucket is `public=true` and the filename might contain anything
 * other than [A-Za-z0-9._-].
 */
export function publicStorageUrl(bucket: string, path: string): string {
  const safe = path.split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${safe}`;
}

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
