
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export const useLogout = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Logout function with Supabase
  const logout = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log("Logging out user from useLogout hook");
      
      // Clear all auth-related localStorage items
      localStorage.removeItem('convelabs_user');
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('sb-yluyonhrxxtyuiyrdixl-auth-token');
      
      // Sign out from Supabase with scope: 'global' to terminate all sessions
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      
      if (signOutError) {
        throw signOutError;
      }
      
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
      
      // Force navigation to home page with replace to prevent back navigation
      navigate("/", { replace: true });
      
      // Adding a small delay and second navigation as fallback
      setTimeout(() => {
        window.location.href = "/";
      }, 100);
      
    } catch (err: any) {
      console.error("Logout error:", err);
      setError(err.message || "Logout failed");
      toast({
        variant: "destructive",
        title: "Logout failed",
        description: "Please try again",
      });
      
      // Even if there's an error, try to navigate to home page
      navigate("/", { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    logout,
    isLoading,
    error,
    resetError: () => setError(null),
  };
};
