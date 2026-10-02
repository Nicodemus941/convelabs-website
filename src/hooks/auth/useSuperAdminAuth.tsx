
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { getTrustedRole } from '@/lib/authRole';

export const useSuperAdminAuth = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const handleSuperAdminLogin = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    console.log("Super admin login attempt:", { email });
    
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (signInError) {
        console.error("Super admin login error:", signInError);
        setError(`Super admin login error: ${signInError.message}`);
        toast({
          variant: "destructive",
          title: "Login failed",
          description: signInError.message || "Please check your credentials and try again",
        });
        throw new Error(signInError.message);
      }
      
      if (data.user) {
        // The client no longer stamps a role: super_admin lives in
        // app_metadata, which only the service role can write. A client-side
        // updateUser({ data: { role } }) was the privilege-escalation vector.
        if (getTrustedRole(data.user) !== 'super_admin') {
          console.warn('Signed in via super-admin form but account has no trusted super_admin role');
        }
        toast({ title: "Login successful", description: "Welcome back, Super Admin" });
        // Navigation is owned solely by the Login page effect (see Login.tsx).
        // This hook must NOT navigate — four competing navigators thrashed the
        // router and multiplied auth calls into the storm above.
      }
    } catch (err: any) {
      console.error("Super admin login error:", err);
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
  };

  return {
    handleSuperAdminLogin,
    isLoading,
    error,
    resetError: () => setError(null),
  };
};
