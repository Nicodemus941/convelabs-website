import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContextType, User, AuthResult } from "@/types/auth";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useAuthActions } from "@/hooks/useAuthActions";
import { useEmailVerification } from "@/hooks/useEmailVerification";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  // These hooks from react-router-dom will be available because AuthProvider is inside BrowserRouter
  const location = useLocation();
  const navigate = useNavigate();

  // Use our custom hooks
  const { user, session, isLoading, mapUserData, mapSessionData } = useAuthSession();
  const { 
    login: authLogin, 
    logout: authLogout, 
    signup: authSignup, 
    resetError: resetActionError, 
    error: actionError, 
    isLoading: actionLoading 
  } = useAuthActions();

  // Add the refreshSession method
  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      console.log("Session refreshed successfully", data);
    } catch (err: any) {
      console.error("Error refreshing session:", err);
      setError(err.message || "Failed to refresh session");
    }
  }, []);

  // Custom login function to handle redirects and errors
  const login = useCallback(async (email: string, password: string): Promise<void> => {
    try {
      await authLogin(email, password);
      
      // If we reach here, login was successful
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData && sessionData.session) {
        // Check if this user has completed onboarding if they paid
        const { data: userData } = await supabase.auth.getUser();
        const hasPaid = userData?.user?.user_metadata?.hasPaid;
        const onboardingCompleted = userData?.user?.user_metadata?.onboarding_completed;
        
        if (hasPaid && !onboardingCompleted) {
          navigate('/onboarding/post-payment');
        } else {
          // Navigate based on user role
          const role = userData?.user?.user_metadata?.role || 'patient';
          navigate(`/dashboard/${role}`);
        }
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
      throw err; // Re-throw to allow components to handle the error
    }
  }, [authLogin, navigate]);

  // Custom logout function with redirect
  const logout = useCallback(async () => {
    try {
      console.log("AuthContext: Logging out user");
      
      // Clear all auth-related localStorage items
      localStorage.removeItem('convelabs_user');
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('sb-yluyonhrxxtyuiyrdixl-auth-token');
      
      // Use direct Supabase signOut to ensure we properly terminate all sessions
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      if (signOutError) throw signOutError;
      
      // Then call our logout function for any cleanup
      await authLogout();
      
      // Force navigation to home page with replace to prevent back navigation
      navigate('/', { replace: true });
      
      // Adding a small delay and second navigation as fallback
      setTimeout(() => {
        window.location.href = "/";
      }, 100);
    } catch (err: any) {
      console.error("AuthContext logout error:", err);
      setError(err.message || "Logout failed");
      
      // Even if there's an error, navigate to home page
      navigate('/', { replace: true });
    }
  }, [authLogout, navigate]);

  // Pass through the signup function, ensuring it matches the required return type
  const signup = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role?: any
  ): Promise<AuthResult> => {
    return await authSignup(email, password, firstName, lastName, role);
  };

  // Combine loading states
  const combinedIsLoading = isLoading || actionLoading;

  // Combine error states
  const combinedError = error || actionError;
  
  // Reset error function
  const resetError = useCallback(() => {
    setError(null);
    resetActionError();
  }, [resetActionError]);

  // Email verification handling
  const verificationEffect = useEmailVerification(
    (loading) => actionLoading || loading,
    setError,
    (newUser) => newUser, // We don't set user here as it's managed by useAuthSession
    (newSession) => newSession // We don't set session here as it's managed by useAuthSession
  );

  // Log authentication state for debugging
  useEffect(() => {
    console.log("Auth state changed:", { user, session, isLoading: combinedIsLoading, error: combinedError });
  }, [user, session, combinedIsLoading, combinedError]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session, 
        isLoading: combinedIsLoading,
        error: combinedError,
        login,
        logout,
        signup,
        resetError,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
