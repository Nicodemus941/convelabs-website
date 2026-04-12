
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";

export const useSuperAdminAuth = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
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
        console.log("Super admin login successful, updating role");
        // Ensure super admin role
        try {
          const { error: updateError } = await supabase.auth.updateUser({
            data: { 
              role: 'super_admin',
              firstName: data.user.user_metadata?.firstName || 'Super',
              lastName: data.user.user_metadata?.lastName || 'Admin',
              full_name: 'Super Admin'
            }
          });
          
          if (updateError) {
            console.warn("Failed to update super admin role:", updateError);
          } else {
            console.log("Successfully updated super admin role");
          }
        } catch (updateErr) {
          console.error("Error updating user role:", updateErr);
        }
        
        toast({
          title: "Login successful",
          description: "Welcome back, Super Admin",
        });
        
        // Short delay to ensure auth state is properly updated
        setTimeout(() => {
          console.log("Navigating to super admin dashboard");
          navigate(`/dashboard/super_admin`);
        }, 300);
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
