import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tenant, TenantContext as TenantContextType, UserTenant } from '@/types/tenant';
import { toast } from 'sonner';

// Create the context with a default value
const TenantContext = createContext<TenantContextType>({
  currentTenant: null,
  userTenants: [],
  isLoading: true,
  error: null,
  setCurrentTenant: () => {},
  createTenant: async () => ({ id: '', name: '', slug: '', status: 'pending', owner_id: '', branding: { primary_color: '', secondary_color: '' }, contact_email: '', created_at: '', updated_at: '' }),
  updateTenant: async () => ({ id: '', name: '', slug: '', status: 'pending', owner_id: '', branding: { primary_color: '', secondary_color: '' }, contact_email: '', created_at: '', updated_at: '' }),
  loadUserTenants: async () => [],
  switchTenant: async () => {},
});

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, session } = useAuth();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [userTenants, setUserTenants] = useState<UserTenant[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Load user's tenants when authentication state changes (skip for patients)
  useEffect(() => {
    if (user && user.role !== 'patient') {
      loadUserTenants().catch(err => {
        console.error("Error loading user tenants:", err);
        setError(err as Error);
      });
    } else {
      // Reset state when user logs out
      setCurrentTenant(null);
      setUserTenants([]);
    }
  }, [user?.id]);

  // Load tenant from localStorage on initial load
  useEffect(() => {
    const savedTenantId = localStorage.getItem('currentTenantId');
    if (savedTenantId && user) {
      supabase
        .from('tenants')
        .select('*')
        .eq('id', savedTenantId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("Error fetching saved tenant:", error);
            localStorage.removeItem('currentTenantId');
          } else if (data) {
            // Cast the status and other fields to ensure they match our enum
            const typedTenant: Tenant = {
              ...data,
              status: data.status as 'pending' | 'active' | 'suspended' | 'inactive',
              subscription_tier: data.subscription_tier as 'basic' | 'professional' | 'enterprise' | undefined,
              subscription_status: data.subscription_status as 'active' | 'past_due' | 'canceled' | 'trialing' | undefined,
              branding: data.branding as Tenant['branding']
            };
            setCurrentTenant(typedTenant);
          }
        });
    }
  }, [user]);

  const loadUserTenants = async () => {
    if (!user) return [] as UserTenant[];
    // Patients and super_admins don't have tenant memberships — skip the query
    if (user.role === 'patient' || user.role === 'super_admin') { setIsLoading(false); return [] as UserTenant[]; }
    
    setIsLoading(true);
    try {
      // Get tenants where user is a member
      const { data: userTenantData, error: userTenantError } = await supabase
        .from('user_tenants')
        .select('*, tenants(*)')
        .eq('user_id', user.id);

      if (userTenantError) throw userTenantError;

      if (userTenantData && userTenantData.length > 0) {
        const userTenants: UserTenant[] = userTenantData.map(ut => ({
          id: ut.id,
          user_id: ut.user_id,
          tenant_id: ut.tenant_id,
          role: ut.role as 'admin' | 'member' | 'billing' | 'operator',
          is_primary: ut.is_primary,
          created_at: ut.created_at,
          updated_at: ut.updated_at,
          name: ut.tenants?.name
        }));

        setUserTenants(userTenants);

        // If we have tenant data and no current tenant is set, set the first one
        if (!currentTenant && userTenantData.length > 0 && userTenantData[0].tenants) {
          const firstTenant = userTenantData[0].tenants;
          const typedTenant: Tenant = {
            ...firstTenant,
            status: firstTenant.status as 'pending' | 'active' | 'suspended' | 'inactive',
            subscription_tier: firstTenant.subscription_tier as 'basic' | 'professional' | 'enterprise' | undefined,
            subscription_status: firstTenant.subscription_status as 'active' | 'past_due' | 'canceled' | 'trialing' | undefined,
            branding: firstTenant.branding as Tenant['branding']
          };
          
          setCurrentTenant(typedTenant);
          localStorage.setItem('currentTenantId', firstTenant.id);
        }
        
        return userTenants;
      } else {
        setUserTenants([]);
        return [] as UserTenant[];
      }
    } catch (err) {
      console.error("Error in loadUserTenants:", err);
      setError(err as Error);
      return [] as UserTenant[];
    } finally {
      setIsLoading(false);
    }
  };

  const createTenant = async (tenantData: Partial<Tenant>): Promise<Tenant> => {
    if (!user) throw new Error("You must be logged in to create a tenant");
    
    setIsLoading(true);
    try {
      // Generate a slug from the name
      const slug = tenantData.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || '';
      
      // Create new tenant
      const { data, error } = await supabase
        .from('tenants')
        .insert([{
          name: tenantData.name,
          slug,
          status: 'active',
          owner_id: user.id,
          branding: tenantData.branding || {
            primary_color: '#5a67d8',
            secondary_color: '#4c51bf'
          },
          contact_email: tenantData.contact_email || user.email,
          description: tenantData.description || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      // Add user as an admin member of this tenant
      const { error: userTenantError } = await supabase
        .from('user_tenants')
        .insert([{
          user_id: user.id,
          tenant_id: data.id,
          role: 'admin',
          is_primary: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      if (userTenantError) throw userTenantError;

      // Cast the data to match our Tenant type
      const typedTenant: Tenant = {
        ...data,
        status: data.status as 'pending' | 'active' | 'suspended' | 'inactive',
        subscription_tier: data.subscription_tier as 'basic' | 'professional' | 'enterprise' | undefined,
        branding: data.branding as Tenant['branding']
      };

      // Set as current tenant
      setCurrentTenant(typedTenant);
      localStorage.setItem('currentTenantId', data.id);

      // Reload user tenants
      await loadUserTenants();

      toast.success("Organization created successfully!");
      return typedTenant;
    } catch (err) {
      console.error("Error in createTenant:", err);
      toast.error("Failed to create organization. Please try again.");
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateTenant = async (id: string, tenantData: Partial<Tenant>): Promise<Tenant> => {
    if (!user) throw new Error("You must be logged in to update a tenant");
    
    setIsLoading(true);
    try {
      // First check if user has permission to update this tenant
      const { data: userTenantData, error: userTenantError } = await supabase
        .from('user_tenants')
        .select('role')
        .eq('user_id', user.id)
        .eq('tenant_id', id)
        .single();

      if (userTenantError) throw new Error("You don't have permission to update this organization");
      if (!['admin', 'owner'].includes(userTenantData.role)) {
        throw new Error("You don't have permission to update this organization");
      }

      // Generate a new slug if name has changed
      let slug = tenantData.slug;
      if (tenantData.name && !tenantData.slug) {
        slug = tenantData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      }

      // Update tenant
      const { data, error } = await supabase
        .from('tenants')
        .update({
          ...tenantData,
          slug,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Cast the data to match our Tenant type
      const typedTenant: Tenant = {
        ...data,
        status: data.status as 'pending' | 'active' | 'suspended' | 'inactive',
        subscription_tier: data.subscription_tier as 'basic' | 'professional' | 'enterprise' | undefined,
        subscription_status: data.subscription_status as 'active' | 'past_due' | 'canceled' | 'trialing' | undefined,
        branding: data.branding as Tenant['branding']
      };

      // If this is the current tenant, update state
      if (currentTenant && currentTenant.id === id) {
        setCurrentTenant(typedTenant);
      }

      // Reload user tenants
      await loadUserTenants();

      toast.success("Organization updated successfully!");
      return typedTenant;
    } catch (err) {
      console.error("Error in updateTenant:", err);
      toast.error("Failed to update organization. Please try again.");
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const switchTenant = async (tenantId: string) => {
    setIsLoading(true);
    try {
      // Check if user has access to this tenant
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (error) throw error;

      // Cast the data to match our Tenant type
      const typedTenant: Tenant = {
        ...data,
        status: data.status as 'pending' | 'active' | 'suspended' | 'inactive',
        subscription_tier: data.subscription_tier as 'basic' | 'professional' | 'enterprise' | undefined,
        subscription_status: data.subscription_status as 'active' | 'past_due' | 'canceled' | 'trialing' | undefined,
        branding: data.branding as Tenant['branding']
      };

      // Update state and localStorage
      setCurrentTenant(typedTenant);
      localStorage.setItem('currentTenantId', tenantId);
    } catch (err) {
      console.error("Error switching tenant:", err);
      toast.error("Failed to switch organization. Please try again.");
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        userTenants,
        isLoading,
        error,
        setCurrentTenant,
        createTenant,
        updateTenant,
        loadUserTenants,
        switchTenant
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);
