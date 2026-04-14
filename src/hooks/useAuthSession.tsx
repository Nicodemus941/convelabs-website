
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js';
import { Session, User, UserRole } from '@/types/auth';

export const useAuthSession = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Map Supabase user data to our application's User interface
  const mapUserData = (
    supabaseUser: SupabaseUser | null,
    role?: UserRole
  ): User | null => {
    if (!supabaseUser) return null;

    // Extract user metadata
    const metadata = supabaseUser.user_metadata || {};
    
    return {
      id: supabaseUser.id,
      email: supabaseUser.email || '',
      firstName: metadata.firstName || metadata.first_name || '',
      lastName: metadata.lastName || metadata.last_name || '',
      full_name: metadata.full_name || `${metadata.firstName || ''} ${metadata.lastName || ''}`.trim(),
      role: role as UserRole || (metadata.role as UserRole) || 'patient',
      createdAt: supabaseUser.created_at || new Date().toISOString(),
      phoneNumber: metadata.phoneNumber || metadata.phone_number || undefined
    };
  };

  // Map Supabase session to our application's Session interface
  const mapSessionData = (supabaseSession: SupabaseSession | null): Session | null => {
    if (!supabaseSession) return null;

    const role = supabaseSession?.user?.user_metadata?.role as UserRole || 'patient';
    
    return {
      access_token: supabaseSession.access_token,
      refresh_token: supabaseSession.refresh_token,
      expires_at: supabaseSession.expires_at,
      user: mapUserData(supabaseSession.user, role) as User
    };
  };

  useEffect(() => {
    // SINGLE SOURCE OF TRUTH: Only use onAuthStateChange, never call getSession directly.
    // This eliminates lock contention between getSession() and the auth listener.
    setIsLoading(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, supabaseSession) => {
      // Process the session from the listener (no separate getSession call)
      if (_event === 'PASSWORD_RECOVERY') return;

      const mappedSession = mapSessionData(supabaseSession);
      setSession(mappedSession);

      if (supabaseSession?.user) {
        const role = supabaseSession.user.user_metadata.role || null;
        setUserRole(role);
        setUser(mapUserData(supabaseSession.user, role as UserRole));
      } else {
        setUserRole(null);
        setUser(null);
      }

      setAuthInitialized(true);
      setIsLoading(false);
    });

    // Cleanup subscription
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    isLoading,
    userRole,
    user,
    authInitialized,
    mapUserData,
    mapSessionData
  };
};

export default useAuthSession;
