
import { supabase } from "@/integrations/supabase/client";

export const setupSuperAdminAccess = async (email: string) => {
  try {
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error("No authenticated user found:", userError);
      return { success: false, error: "No authenticated user found" };
    }

    // Update user metadata to ensure super_admin role
    const { error: updateError } = await supabase.auth.updateUser({
      data: { 
        role: 'super_admin',
        firstName: 'Site',
        lastName: 'Owner',
        full_name: 'Site Owner'
      }
    });

    if (updateError) {
      console.error("Failed to update user role:", updateError);
      return { success: false, error: updateError.message };
    }

    console.log("Successfully updated user to super admin");
    return { success: true };
  } catch (error) {
    console.error("Error setting up super admin access:", error);
    return { success: false, error: error.message };
  }
};
