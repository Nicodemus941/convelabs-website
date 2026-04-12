
import { Database } from "@/integrations/supabase/types";

// Define a type for user profiles from the database schema
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'] & {
  phone?: string;
};

// Add other custom types as needed
export type Agreement = Database['public']['Tables']['agreements']['Row'];
export type UserMembership = Database['public']['Tables']['user_memberships']['Row'] & {
  founding_member?: boolean;
  founding_member_signup_date?: string | null;
  next_billing_override?: string | null;
};

// Helper function to handle the user profile data safely
export const getUserProfileProperties = (profile: any) => {
  return {
    full_name: profile?.full_name || '',
    date_of_birth: profile?.date_of_birth ? new Date(profile.date_of_birth) : undefined,
    address_street: profile?.address_street || '',
    address_city: profile?.address_city || '',
    address_state: profile?.address_state || '',
    address_zipcode: profile?.address_zipcode || '',
    insurance_provider: profile?.insurance_provider || '',
    insurance_id: profile?.insurance_id || '',
    lab_orders_uploaded: profile?.lab_orders_uploaded || false,
    phone: profile?.phone || '',
  };
};
