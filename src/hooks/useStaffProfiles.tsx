
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type StaffProfile = {
  id: string;
  user_id: string;
  pay_rate: number;
  premium_pay_rate: number | null;
  specialty: string | null;
  availability_settings: any | null;
  certification_details: any | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  hired_date: string | null;
  last_review_date: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    full_name?: string;
    role?: string;
    id: string;
  };
};

export interface StaffProfileInput {
  user_id: string;
  pay_rate: number;
  premium_pay_rate?: number | null;
  specialty?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  hired_date?: string | null;
  certification_details?: any | null;
}

export const useStaffProfiles = () => {
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchStaffProfiles = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log("Fetching staff profiles...");
      
      // Step 1: Fetch staff profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('staff_profiles')
        .select('*');

      if (profilesError) {
        console.error("Error fetching staff profiles:", profilesError);
        throw new Error(profilesError.message);
      }

      // Log the profiles returned to help with debugging
      console.log(`Fetched ${profiles?.length || 0} staff profiles:`, profiles);

      if (!profiles || profiles.length === 0) {
        setStaffProfiles([]);
        setIsLoading(false);
        return;
      }

      // Step 2: Extract user_ids to fetch corresponding user data
      const userIds = profiles.map(profile => profile.user_id);

      // Step 3: Fetch user data separately
      const { data: users, error: usersError } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (usersError) {
        console.error("Error fetching user profiles:", usersError);
        // Continue anyway, we'll just have profiles without user data
      }

      // Step 4: Get additional user data from auth.users using admin API for emails
      // Using any type here since TypeScript doesn't have full definition of the admin API
      let authUsers: any = { users: [] };
      try {
        const authResponse = await supabase.auth.admin.listUsers();
        authUsers = authResponse.data;
        if (authResponse.error) {
          console.error("Error fetching auth users:", authResponse.error);
        }
      } catch (authErr) {
        console.error("Exception fetching auth users:", authErr);
      }

      // Step 5: Create a lookup map of user data
      const userMap: Record<string, any> = {};
      
      if (users) {
        users.forEach(userProfile => {
          userMap[userProfile.id] = { 
            ...userProfile,
            id: userProfile.id 
          };
        });
      }

      // Add auth user data to the map
      if (authUsers?.users) {
        authUsers.users.forEach((authUser: any) => {
          if (userMap[authUser.id]) {
            userMap[authUser.id] = {
              ...userMap[authUser.id],
              id: authUser.id,
              email: authUser.email,
              role: authUser.user_metadata?.role,
              firstName: authUser.user_metadata?.firstName,
              lastName: authUser.user_metadata?.lastName,
              full_name: authUser.user_metadata?.full_name || userMap[authUser.id].full_name,
            };
          } else {
            userMap[authUser.id] = {
              id: authUser.id,
              email: authUser.email,
              role: authUser.user_metadata?.role,
              firstName: authUser.user_metadata?.firstName,
              lastName: authUser.user_metadata?.lastName,
              full_name: authUser.user_metadata?.full_name,
            };
          }
        });
      }

      // Step 6: Combine staff profiles with user data
      const formattedProfiles: StaffProfile[] = profiles.map(profile => {
        return {
          ...profile,
          user: userMap[profile.user_id] || { id: profile.user_id }
        };
      });

      console.log("Formatted profiles:", formattedProfiles);
      setStaffProfiles(formattedProfiles);
    } catch (err: any) {
      console.error("Error fetching staff profiles:", err);
      setError(err.message);
      toast.error(`Failed to load staff profiles: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Get staff profile by user ID
  const getStaffProfileByUserId = useCallback((userId: string): StaffProfile | undefined => {
    return staffProfiles.find(profile => profile.user_id === userId);
  }, [staffProfiles]);

  // Updated to require user_id as a non-optional field
  const addStaffProfile = async (staffProfileData: Omit<Partial<StaffProfile>, 'user_id'> & { user_id: string }) => {
    try {
      console.log("Adding staff profile:", staffProfileData);

      const { data, error } = await supabase
        .from('staff_profiles')
        .insert([staffProfileData])
        .select();

      if (error) throw new Error(error.message);
      
      console.log("Added staff profile:", data);
      toast.success("Staff profile added successfully");
      
      // Reload the staff profiles
      fetchStaffProfiles();
      return data?.[0];
    } catch (err: any) {
      console.error("Error adding staff profile:", err);
      toast.error(`Failed to add staff profile: ${err.message}`);
      throw err;
    }
  };

  const updateStaffProfile = async (id: string, updates: Partial<StaffProfile>) => {
    try {
      console.log(`Updating staff profile ${id}:`, updates);
      
      const { error } = await supabase
        .from('staff_profiles')
        .update(updates)
        .eq('id', id);

      if (error) throw new Error(error.message);
      
      console.log("Staff profile updated successfully");
      toast.success("Staff profile updated successfully");
      
      // Reload the staff profiles
      fetchStaffProfiles();
    } catch (err: any) {
      console.error("Error updating staff profile:", err);
      toast.error(`Failed to update staff profile: ${err.message}`);
      throw err;
    }
  };

  // Fetch staff profiles on component mount
  useEffect(() => {
    if (user) {
      fetchStaffProfiles();
    }
  }, [user]);

  return {
    staffProfiles,
    isLoading,
    error,
    fetchStaffProfiles,
    addStaffProfile,
    updateStaffProfile,
    getStaffProfileByUserId,
  };
};
