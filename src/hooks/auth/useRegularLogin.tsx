
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export const useRegularLogin = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Regular user login function
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    console.log("Regular login attempt:", { email });
    
    try {
      // Create a new account option for the user to try
      const showSignupOption = () => {
        toast({
          title: "Try creating a new account",
          description: "If you've paid but haven't created an account yet, please sign up instead.",
          action: (
            <button 
              onClick={() => navigate('/signup')}
              className="bg-conve-red text-white px-3 py-1 rounded-md text-xs font-medium"
            >
              Sign up
            </button>
          )
        });
      };

      console.log("Regular user login attempt");
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (signInError) {
        console.error("Regular login error:", signInError);
        
        // Special handling for common errors
        if (signInError.message.includes("invalid login credentials") || 
            signInError.message.includes("Email not confirmed") ||
            signInError.message.includes("user not found")) {
          setError("Invalid login credentials or account not found. If you've already paid but haven't created an account, please sign up.");
          showSignupOption();
          throw new Error(signInError.message);
        }
        
        // Check if this is the database schema error we're encountering
        if (signInError.message.includes("Database error")) {
          setError("The system is currently experiencing technical issues with login. Please try signing up with a new account, or contact support.");
          showSignupOption();
          throw new Error(signInError.message);
        }
        
        setError(signInError.message || "Login failed");
        toast({
          variant: "destructive",
          title: "Login failed",
          description: signInError.message || "Please check your credentials and try again",
        });
        throw new Error(signInError.message);
      }
      
      if (data.user) {
        console.log("Login successful, user data:", data.user);
        toast({
          title: "Login successful",
          description: "Welcome back to ConveLabs",
        });
        
        // Return data rather than navigate here - let the context handle navigation
        return data;
      }
    } catch (err: any) {
      console.error("Login function error:", err);
      setError(err.message || "Login failed");
      toast({
        variant: "destructive",
        title: "Login failed",
        description: err.message || "Please check your credentials and try again",
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [navigate, toast]);

  return {
    login,
    isLoading,
    error,
    resetError: () => setError(null),
  };
};
