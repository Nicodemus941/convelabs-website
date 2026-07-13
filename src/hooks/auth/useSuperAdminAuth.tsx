
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

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
        // STAMP the role only the FIRST time. Writing it on every login
        // reissues a token, which fires a cascade of auth events; combined
        // with multi-device refresh-token rotation that storms /token into a
        // 429 and locks the account out (2026-07-14 desktop lockout). Skip
        // when the role is already correct — which it is after login #1.
        if (data.user.user_metadata?.role !== 'super_admin') {
          try {
            await supabase.auth.updateUser({ data: { role: 'super_admin' } });
          } catch (updateErr) {
            console.warn("Could not stamp super_admin role (non-blocking):", updateErr);
          }
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
