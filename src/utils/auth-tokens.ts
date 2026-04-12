
/**
 * Utilities for managing authentication tokens between our main app and 
 * the external appointments system.
 */

import { Session } from "@/types/auth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Creates an encoded authentication payload that can be sent to external systems
 * to maintain the user's session across domains (using the same Supabase instance).
 * 
 * @param session Current user session with tokens
 * @returns Encoded authentication payload or null if session is invalid
 */
export const createAuthPayload = (session: Session | null): string | null => {
  if (!session?.access_token || !session?.refresh_token) {
    return null;
  }
  
  try {
    const payload = {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      user: session.user ? {
        id: session.user.id,
        email: session.user.email,
        fullName: session.user.full_name || 
          `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim(),
        firstName: session.user.firstName,
        lastName: session.user.lastName,
        role: session.user.role
      } : null,
      timestamp: new Date().getTime(),
      expiresAt: session.expires_at,
      returnUrl: window.location.href // Add the return URL to the payload
    };
    
    // Base64 encode for transmission
    return btoa(JSON.stringify(payload));
  } catch (err) {
    console.error("Failed to create auth payload:", err);
    return null;
  }
};

/**
 * Refreshes the current session tokens to ensure they're valid before redirecting
 * to an external system.
 * 
 * @returns Promise resolving to refreshed session or null if refresh fails
 */
export const refreshSessionBeforeRedirect = async (): Promise<Session | null> => {
  try {
    console.log("Refreshing session before redirect...");
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      console.error("Failed to refresh session:", error);
      return null;
    }
    
    if (!data.session) {
      console.warn("No session available after refresh");
      return null;
    }
    
    console.log("Session refreshed successfully");
    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: data.session.user ? {
        id: data.session.user.id,
        email: data.session.user.email || '',
        firstName: data.session.user.user_metadata?.firstName || '',
        lastName: data.session.user.user_metadata?.lastName || '',
        full_name: data.session.user.user_metadata?.full_name || '',
        role: data.session.user.user_metadata?.role || 'patient',
        createdAt: data.session.user.created_at || '',
      } : null
    };
  } catch (err) {
    console.error("Error refreshing session:", err);
    return null;
  }
};

/**
 * Creates a URL for redirecting to the appointments site with authentication tokens
 * 
 * @param baseUrl The base URL of the appointments site page
 * @param session Current user session 
 * @param options Additional options (like noredirect flag)
 * @returns URL with auth parameters or base URL if session is invalid
 */
export const createRedirectUrl = async (
  baseUrl: string, 
  session: Session | null,
  options: { noRedirect?: boolean } = {}
): Promise<string> => {
  if (!baseUrl) return '';
  
  try {
    // First try to refresh the session to get fresh tokens
    const refreshedSession = session ? await refreshSessionBeforeRedirect() : null;
    
    // Use refreshed session if available, otherwise use current session
    const currentSession = refreshedSession || session;
    
    // Create auth payload if we have a valid session
    const encodedPayload = currentSession ? createAuthPayload(currentSession) : null;
    
    if (encodedPayload) {
      // Add auth parameter to URL
      const separator = baseUrl.includes('?') ? '&' : '?';
      let url = `${baseUrl}${separator}auth=${encodeURIComponent(encodedPayload)}`;
      
      // Add noRedirect parameter if specified
      if (options.noRedirect) {
        url += '&noredirect=true';
      }
      
      return url;
    }
    
    // Return base URL if no valid session
    return baseUrl;
  } catch (err) {
    console.error("Error creating redirect URL:", err);
    return baseUrl;
  }
};
