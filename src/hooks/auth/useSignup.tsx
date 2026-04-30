
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserRole, AuthResult } from "@/types/auth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { sendWelcomeEmail } from "@/services/email";
import { useAuthSession } from "@/hooks/useAuthSession";

export const useSignup = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { mapUserData, mapSessionData } = useAuthSession();

  // Signup function with Supabase
  const signup = async (
    email: string, 
    password: string, 
    firstName: string, 
    lastName: string, 
    role: UserRole = "patient"
  ): Promise<AuthResult> => {
    setIsLoading(true);
    setError(null);
    console.log("Signup attempt:", { email, firstName, lastName, role });
    
    try {
      // Honor any ?redirect= already on the URL (the membership-resume flow
      // sends ?redirect=/pricing through the signup screen). Without this,
      // the email-confirmation link always landed on the dashboard and the
      // pending agreement in sessionStorage never resumed.
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const desiredRedirect = params?.get('redirect') || `/dashboard/${role}`;

      // Register the new user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            firstName,
            lastName,
            full_name: `${firstName} ${lastName}`.trim(),
            role
          },
          emailRedirectTo: `${window.location.origin}/login?redirect=${encodeURIComponent(desiredRedirect)}`,
        }
      });
      
      if (signUpError) {
        console.error("Signup error:", signUpError);
        setError(signUpError.message || "Signup failed");
        toast({
          variant: "destructive",
          title: "Signup failed",
          description: signUpError.message || "Please try again",
        });
        return { 
          success: false,
          error: { message: signUpError.message || "Signup failed" } 
        };
      }
      
      console.log("Signup successful, user data:", data.user);

      // Check if email confirmation is required (user exists but no session)
      if (data.user && !data.session) {
        console.log("Email confirmation required");
        toast({
          title: "Check your email",
          description: "We've sent you a confirmation link. Please check your inbox to complete registration.",
        });
        return {
          success: true,
          data: { requiresConfirmation: true },
        };
      }

      toast({
        title: "Account created",
        description: "Your account has been created successfully",
      });
      
      // Format the return data to match our AuthResult type
      const authResult: AuthResult = {
        success: true,
        data: {}
      };
      
      if (data.user) {
        // Send welcome email
        console.log("Sending welcome email");
        sendWelcomeEmail(email, firstName, data.user.id)
          .then(result => {
            if (result.success) {
              console.log('Welcome email sent successfully');
            } else {
              console.error('Failed to send welcome email:', result.error);
            }
          })
          .catch(err => {
            console.error('Error sending welcome email:', err);
          });
        
        // Map the Supabase user and session to our custom types if they exist
        if (data.session) {
          authResult.data.session = mapSessionData(data.session);
          authResult.data.user = mapUserData(data.user, role);
        }
        
        // Auto login is handled by onAuthStateChange. Honor ?redirect= so
        // the membership-resume flow lands back on /pricing instead of the
        // dashboard.
        const target = (typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('redirect')
          : null) || `/dashboard/${role}`;
        console.log("Navigating after signup:", target);
        setTimeout(() => {
          navigate(target);
        }, 100);
      }
      
      return authResult;
    } catch (err: any) {
      console.error("Signup function error:", err);
      setError(err.message || "Signup failed");
      toast({
        variant: "destructive",
        title: "Signup failed",
        description: err.message || "Please try again",
      });
      return { 
        success: false, 
        error: { message: err.message || "Signup failed" } 
      };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    signup,
    isLoading,
    error,
    resetError: () => setError(null),
  };
};
