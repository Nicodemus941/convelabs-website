
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface StaffProfile {
  id: string;
  user_id: string;
  pay_rate: number;
  premium_pay_rate: number | null;
  specialty: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  hired_date: string | null;
  certification_details: any | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    full_name: string;
    role?: string;
  };
}

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

export interface StaffFilters {
  specialty?: string;
  role?: string;
  status?: string;
}

export const useStaffProfiles = () => {
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StaffFilters>({});

  // Fetch all staff profiles
  const getStaffProfiles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('Fetching staff profiles...');
      
      // Fetch staff profiles with user details using join
      const { data, error } = await supabase
        .from('staff_profiles')
        .select(`
          *,
          user:user_id (
            id,
            email,
            full_name,
            role
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      console.log('Fetched staff profiles:', data);
      
      // Safely cast data with proper type handling
      const processedData = data?.map(profile => {
        // Fix: Add null check for user property
        const { user, ...rest } = profile;
        
        // Handle potential error state or null user in join
        let processedUser = { id: '', email: '', full_name: '', role: undefined };
        
        // Explicitly create a non-null version of the user to satisfy TypeScript
        // Use an intermediate variable with type assertion
        const safeUser = user as { 
          id?: string | null; 
          email?: string | null; 
          full_name?: string | null; 
          role?: string | null;
        } | null;

        // More explicit type guard with the intermediate variable
        if (safeUser && typeof safeUser === 'object' && !('error' in safeUser)) {
          processedUser = {
            id: typeof safeUser.id === 'string' ? safeUser.id : '',
            email: typeof safeUser.email === 'string' ? safeUser.email : '',
            full_name: typeof safeUser.full_name === 'string' ? safeUser.full_name : '',
            role: safeUser.role || undefined
          };
        }
        
        return {
          ...rest,
          user: processedUser
        } as StaffProfile;
      }) || [];
      
      setStaffProfiles(processedData);
      return processedData;
    } catch (error) {
      console.error('Error fetching staff profiles:', error);
      setError(error.message);
      toast.error('Failed to load staff data');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add a new staff profile
  const addStaffProfile = useCallback(async (profileData: StaffProfileInput) => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('staff_profiles')
        .insert(profileData)
        .select();

      if (error) throw error;
      
      // Refresh the staff profiles list
      await getStaffProfiles();
      
      return data;
    } catch (error) {
      console.error('Error adding staff profile:', error);
      setError(error.message);
      toast.error('Failed to add staff member');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [getStaffProfiles]);

  // Update an existing staff profile
  const updateStaffProfile = useCallback(async (profileId: string, profileData: Partial<StaffProfileInput>) => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('staff_profiles')
        .update(profileData)
        .eq('id', profileId)
        .select();

      if (error) throw error;
      
      // Refresh the staff profiles list
      await getStaffProfiles();
      
      return data;
    } catch (error) {
      console.error('Error updating staff profile:', error);
      setError(error.message);
      toast.error('Failed to update staff member');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [getStaffProfiles]);

  // Delete a staff profile
  const deleteStaffProfile = useCallback(async (profileId: string) => {
    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('staff_profiles')
        .delete()
        .eq('id', profileId);

      if (error) throw error;
      
      // Update local state by removing the deleted profile
      setStaffProfiles(current => 
        current.filter(profile => profile.id !== profileId)
      );
      
      return true;
    } catch (error) {
      console.error('Error deleting staff profile:', error);
      setError(error.message);
      toast.error('Failed to delete staff member');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get staff profile by user ID
  const getStaffProfileByUserId = useCallback((userId: string): StaffProfile | undefined => {
    return staffProfiles.find(profile => profile.user_id === userId);
  }, [staffProfiles]);
  
  // Alias getStaffProfiles as loadStaffProfiles for backward compatibility
  const loadStaffProfiles = getStaffProfiles;

  return {
    staffProfiles,
    isLoading,
    error,
    filters,
    setFilters,
    getStaffProfiles,
    loadStaffProfiles,
    addStaffProfile,
    updateStaffProfile,
    deleteStaffProfile,
    getStaffProfileByUserId
  };
};
