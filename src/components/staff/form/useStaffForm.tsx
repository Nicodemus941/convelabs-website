
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useStaffProfiles, StaffProfile } from "@/hooks/useStaffProfiles";
import { supabase } from "@/integrations/supabase/client";

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  full_name?: string;
  role?: string;
}

export const useStaffForm = (
  open: boolean,
  onOpenChange: (open: boolean) => void,
  staffData?: StaffProfile | null
) => {
  const [isLoading, setIsLoading] = useState(false);
  const [existingUsers, setExistingUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [formValues, setFormValues] = useState({
    pay_rate: "0",
    premium_pay_rate: "",
    specialty: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    emergency_contact_relationship: "",
    hired_date: "",
    certification_details: ""
  });

  const { addStaffProfile, updateStaffProfile } = useStaffProfiles();

  // Fetch existing users without staff profiles
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        
        // Get existing staff profiles to exclude them
        const { data: staffProfiles, error: staffError } = await supabase
          .from('staff_profiles')
          .select('user_id');
          
        if (staffError) throw staffError;
        
        // Get array of user IDs that already have staff profiles
        const existingStaffUserIds = staffProfiles.map((profile: any) => profile.user_id);
        
        // Fetch auth.users data through a join with user_profiles
        const { data: users, error } = await supabase
          .from('user_profiles')
          .select(`
            id,
            full_name
          `)
          .not('id', 'in', existingStaffUserIds);

        if (error) throw error;
        
        // For each user profile, get the auth.users email and meta data
        const usersWithDetails = await Promise.all(
          users.map(async (profile: any) => {
            // Get user data from auth via RPC function (would need to create this)
            // For now, we'll just use the profile data
            return {
              id: profile.id,
              email: "Email not available", // We don't have emails from user_profiles
              full_name: profile.full_name || "Unknown User",
              firstName: profile.full_name ? profile.full_name.split(' ')[0] : undefined,
              lastName: profile.full_name ? profile.full_name.split(' ').slice(1).join(' ') : undefined,
              role: "unknown" // We don't have roles from user_profiles
            };
          })
        );

        setExistingUsers(usersWithDetails);
      } catch (err) {
        console.error("Error fetching users:", err);
        toast.error("Failed to load users");
      } finally {
        setIsLoading(false);
      }
    };

    if (open && !staffData) {
      fetchUsers();
    }
  }, [open, staffData]);

  // Initialize form when editing
  useEffect(() => {
    if (staffData) {
      setFormValues({
        pay_rate: (staffData.pay_rate / 100).toString(),
        premium_pay_rate: staffData.premium_pay_rate ? (staffData.premium_pay_rate / 100).toString() : "",
        specialty: staffData.specialty || "",
        emergency_contact_name: staffData.emergency_contact_name || "",
        emergency_contact_phone: staffData.emergency_contact_phone || "",
        emergency_contact_relationship: staffData.emergency_contact_relationship || "",
        hired_date: staffData.hired_date ? format(new Date(staffData.hired_date), 'yyyy-MM-dd') : "",
        certification_details: staffData.certification_details 
          ? JSON.stringify(staffData.certification_details, null, 2) 
          : ""
      });
    } else {
      setFormValues({
        pay_rate: "0",
        premium_pay_rate: "",
        specialty: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        emergency_contact_relationship: "",
        hired_date: "",
        certification_details: ""
      });
    }
  }, [staffData]);

  // Update selectedUser when selectedUserId changes
  useEffect(() => {
    if (selectedUserId) {
      const user = existingUsers.find(user => user.id === selectedUserId);
      setSelectedUser(user || null);
    } else {
      setSelectedUser(null);
    }
  }, [selectedUserId, existingUsers]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let certificationDetails;
      try {
        certificationDetails = formValues.certification_details 
          ? JSON.parse(formValues.certification_details) 
          : null;
      } catch (err) {
        toast.error("Invalid JSON in certification details");
        setIsLoading(false);
        return;
      }

      const staffProfileData = {
        user_id: staffData?.user_id || selectedUserId,
        pay_rate: Math.round(parseFloat(formValues.pay_rate) * 100),
        premium_pay_rate: formValues.premium_pay_rate ? Math.round(parseFloat(formValues.premium_pay_rate) * 100) : null,
        specialty: formValues.specialty || null,
        emergency_contact_name: formValues.emergency_contact_name || null,
        emergency_contact_phone: formValues.emergency_contact_phone || null,
        emergency_contact_relationship: formValues.emergency_contact_relationship || null,
        hired_date: formValues.hired_date || null,
        certification_details: certificationDetails
      };

      if (staffData) {
        // Update existing staff profile
        await updateStaffProfile(staffData.id, staffProfileData);
        toast.success("Staff profile updated successfully");
      } else {
        // Add new staff profile
        if (!selectedUserId) {
          toast.error("Please select a user");
          setIsLoading(false);
          return;
        }
        await addStaffProfile(staffProfileData);
        toast.success("Staff profile added successfully");
      }

      onOpenChange(false);
    } catch (err) {
      console.error("Error saving staff profile:", err);
      toast.error("Failed to save staff profile");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    existingUsers,
    selectedUserId,
    selectedUser,
    formValues,
    setSelectedUserId,
    handleInputChange,
    handleSelectChange,
    handleSubmit
  };
};
