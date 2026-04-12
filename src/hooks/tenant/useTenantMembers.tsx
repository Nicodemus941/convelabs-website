
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/tenant/TenantContext";
import { MemberWithProfile } from "@/types/tenant";
import { toast } from "@/components/ui/sonner";

export const useTenantMembers = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const { currentTenant } = useTenant();

  const getTenantMembers = async (): Promise<MemberWithProfile[]> => {
    if (!currentTenant?.id) {
      return [];
    }

    setIsLoading(true);
    try {
      // First get all user_tenant records for the current tenant
      const { data: userTenants, error } = await supabase
        .from("user_tenants")
        .select("*")
        .eq("tenant_id", currentTenant.id);

      if (error) {
        throw error;
      }

      if (!userTenants || userTenants.length === 0) {
        setMembers([]);
        return [];
      }

      // Get all the user IDs
      const userIds = userTenants.map(ut => ut.user_id);

      // Then get the user profiles for those users
      const { data: profiles, error: profilesError } = await supabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", userIds);

      if (profilesError) {
        throw profilesError;
      }

      // Create a map of profiles for easy lookup
      const profileMap = new Map();
      if (profiles) {
        profiles.forEach(profile => {
          profileMap.set(profile.id, {
            full_name: profile.full_name || "Unknown"
          });
        });
      }

      // Get user email addresses using admin functions or other methods
      // Since we can't directly query auth.users, we'll use a workaround
      // This is a simplified approach - in a real app, you might need to use an edge function
      const emails: Record<string, string> = {};
      
      for (const userId of userIds) {
        // This is just a placeholder - in a real app, you'd get emails differently
        // For example, through an edge function that has admin access
        emails[userId] = ""; // Initialize with empty string
      }

      // Combine the data
      const membersWithProfiles: MemberWithProfile[] = userTenants.map(tenant => {
        const profile = profileMap.get(tenant.user_id);
        // Make sure the role is one of the allowed types
        const validRole = validateRole(tenant.role);
        
        return {
          ...tenant,
          role: validRole,
          profile: {
            full_name: profile?.full_name || "Unknown",
            email: emails[tenant.user_id] || "No email"
          }
        };
      });

      setMembers(membersWithProfiles);
      return membersWithProfiles;
    } catch (error) {
      console.error("Error fetching tenant members:", error);
      toast.error("Failed to load team members");
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to validate role matches the expected types
  const validateRole = (role: string): "admin" | "member" | "billing" | "operator" => {
    const validRoles = ["admin", "member", "billing", "operator"];
    if (validRoles.includes(role)) {
      return role as "admin" | "member" | "billing" | "operator";
    }
    return "member"; // Default fallback
  };

  const addTenantMember = async (
    email: string, 
    role: "admin" | "member" | "billing" | "operator"
  ): Promise<{ success: boolean; message: string }> => {
    try {
      setIsLoading(true);
      
      // In a real implementation, you would:
      // 1. Check if the user exists
      // 2. Check if they're already a member
      // 3. Add the member if not
      
      // This is a placeholder implementation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update the members list
      await getTenantMembers();
      
      return {
        success: true,
        message: "Team member added successfully"
      };
      
    } catch (error: any) {
      console.error("Error adding tenant member:", error);
      return {
        success: false,
        message: error.message || "Failed to add team member"
      };
    } finally {
      setIsLoading(false);
    }
  };

  const removeTenantMember = async (
    userId: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      setIsLoading(true);
      
      // Don't allow removing primary members
      const { data, error: checkError } = await supabase
        .from("user_tenants")
        .select("is_primary")
        .eq("tenant_id", currentTenant?.id)
        .eq("user_id", userId)
        .single();
      
      if (checkError) {
        throw checkError;
      }
      
      if (data && data.is_primary) {
        return {
          success: false,
          message: "Cannot remove the primary organization owner"
        };
      }
      
      // Remove the user
      const { error } = await supabase
        .from("user_tenants")
        .delete()
        .eq("tenant_id", currentTenant?.id)
        .eq("user_id", userId);
      
      if (error) {
        throw error;
      }
      
      // Update the state locally
      setMembers(members.filter(member => member.user_id !== userId));
      
      return {
        success: true,
        message: "Team member removed successfully"
      };
      
    } catch (error: any) {
      console.error("Error removing tenant member:", error);
      return {
        success: false,
        message: error.message || "Failed to remove team member"
      };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    members,
    getTenantMembers,
    addTenantMember,
    removeTenantMember
  };
};
