
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const AuthCallback = () => {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshSession } = useAuth();

  useEffect(() => {
    const handleAuthCallback = async () => {
      setLoading(true);
      try {
        // Get search params
        const searchParams = new URLSearchParams(location.search);
        let redirectTo = searchParams.get("redirectTo") || "/dashboard";
        
        // Prevent redirect loops - don't redirect back to login or auth pages
        if (redirectTo.includes('/login') || redirectTo.includes('/auth')) {
          redirectTo = '/dashboard';
        }
        
        console.log("Auth callback processing, will redirect to:", redirectTo);

        // Make sure session is refreshed
        await refreshSession();
        
        // Redirect to the specified path or dashboard
        navigate(redirectTo, { replace: true });
      } catch (error) {
        console.error("Error in auth callback:", error);
        navigate("/login", { replace: true });
      } finally {
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [navigate, location.search, refreshSession]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse-gentle flex flex-col items-center">
        <div className="w-16 h-16 border-4 border-t-conve-red border-r-conve-red border-b-transparent border-l-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-conve-black font-medium">Completing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
