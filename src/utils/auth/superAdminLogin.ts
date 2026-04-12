
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export const useSuperAdminLogin = () => {
  const { toast } = useToast();

  const handleSuperAdminLogin = async (email: string, password: string) => {
    console.log("Super admin login attempt detected");
    
    // Direct Supabase login bypassing error handling for this specific account
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.error("Super admin login error:", error);
      toast({
        variant: "destructive",
        title: "Super Admin Login Failed",
        description: "Please check your credentials and try again",
      });
      throw new Error(`Super admin login failed: ${error.message}`);
    }
    
    // If login successful, update user metadata to ensure super_admin role
    if (data.user) {
      console.log("Super admin login successful, updating role");
      
      const { error: updateError } = await supabase.auth.updateUser({
        data: { role: 'super_admin' }
      });
      
      if (updateError) {
        console.warn("Failed to update user role:", updateError);
      } else {
        console.log("Successfully updated super admin role");
      }
      
      toast({
        title: "Login successful",
        description: "Welcome back super admin",
      });
      
      // The redirect will be handled by the auth context
    }
  };

  return { handleSuperAdminLogin };
};
