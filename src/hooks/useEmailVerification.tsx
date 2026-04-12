
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const useEmailVerification = (
  setIsLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
  setUser: (user: any) => void,
  setSession: (session: any) => void
) => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Handle auth redirects from OAuth providers and email verification
    const handleAuthRedirect = async () => {
      try {
        // Check if we have an access_token or refresh_token in the URL
        // This handles both OAuth callbacks and email verification
        if (location.hash && (location.hash.includes('access_token') || location.hash.includes('refresh_token'))) {
          setIsLoading(true);

          // The supabase client will automatically handle setting up the session
          const { data, error } = await supabase.auth.getSession();

          if (error) {
            throw error;
          }

          if (data && data.session) {
            setSession(data.session);
            setUser(data.session.user);
            
            // Check if this was an OAuth sign in
            if (data.session.user.app_metadata.provider 
                && ['google', 'facebook', 'github'].includes(data.session.user.app_metadata.provider)) {
              console.log("OAuth login successful");
              
              // Redirect to appropriate page after successful OAuth login
              const userData = await supabase.auth.getUser();
              const role = userData?.data?.user?.user_metadata?.role || 'patient';
              
              // Use replace to avoid history stacking
              navigate(`/dashboard/${role}`, { replace: true });
            }
          }
        }
      } catch (err: any) {
        console.error("Auth redirect error:", err);
        setError(err.message || "Authentication failed");
      } finally {
        setIsLoading(false);
      }
    };

    handleAuthRedirect();
  }, [location.hash, setIsLoading, setError, setUser, setSession, navigate]);

  return { isProcessingRedirect: location.hash && location.hash.includes('access_token') };
};

export default useEmailVerification;
