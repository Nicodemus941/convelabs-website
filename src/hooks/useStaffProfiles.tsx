
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

      // Step 2: Try to fetch user profile data (may fail due to RLS)
      const userIds = profiles.map(profile => profile.user_id).filter(Boolean);
      let userMap: Record<string, any> = {};

      if (userIds.length > 0) {
        try {
          const { data: users } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', userIds);

          if (users) {
            users.forEach(u => { userMap[u.id] = { ...u }; });
          }
        } catch {
          // RLS may block — continue without user data
        }
      }

      // Combine staff profiles with user data
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
