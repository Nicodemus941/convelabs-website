
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  subdomain?: string;
  description?: string;
  status: 'pending' | 'active' | 'suspended' | 'inactive';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  subscription_tier?: 'basic' | 'professional' | 'enterprise' | string;
  subscription_status?: 'active' | 'past_due' | 'canceled' | 'trialing' | string;
  subscription_tier_id?: string;
  subscription_start_date?: string;
  trial_ends_at?: string;
  owner_id: string;
  branding: {
    primary_color: string;
    secondary_color: string;
    logo_path?: string | null;
  };
  contact_email: string;
  contact_phone?: string;
  created_at: string;
  updated_at: string;
}

export interface UserTenant {
  id: string;
  user_id: string;
  tenant_id: string;
  role: 'admin' | 'member' | 'billing' | 'operator';
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  name?: string;
}

export interface TenantService {
  id: string;
  tenant_id: string;
  service_id: string;
  name: string;
  price?: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  duration: number;
  description?: string;
  category?: string;
  available_for_nonmembers: boolean;
  scheduling_interval: number;
}

export interface TenantServiceArea {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  zipcode_list: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantContext {
  currentTenant: Tenant | null;
  userTenants: UserTenant[];
  isLoading: boolean;
  error: Error | null;
  setCurrentTenant: (tenant: Tenant) => void;
  createTenant: (tenantData: Partial<Tenant>) => Promise<Tenant>;
  updateTenant: (id: string, tenantData: Partial<Tenant>) => Promise<Tenant>;
  loadUserTenants: () => Promise<UserTenant[]>;
  switchTenant: (tenantId: string) => Promise<void>;
}

export interface MemberWithProfile extends UserTenant {
  profile: {
    full_name: string | null;
    email: string;
  };
}

export interface AppointmentData {
  id: string;
  patient_id: string;
  appointment_date: string;
  status: string;
  address: string;
  notes?: string;
  patient_name?: string;
  patient_phone?: string;
}

export interface TenantMembershipPlan {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  monthly_price: number;
  quarterly_price?: number;
  annual_price?: number;
  credits_per_interval: number;
  max_users: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantServiceCombination {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  services_included: {
    id: string;
    name: string;
  }[];
  price?: number;
  discount_percentage?: number;
  duration: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantPatient {
  id: string;
  tenant_id: string;
  user_id?: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  date_of_birth?: string;
  membership_plan_id?: string;
  membership_status?: string;
  membership_start_date?: string;
  membership_end_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
