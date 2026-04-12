
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthToken } from '@/integrations/supabase/client';

export const useFetchTerritories = () => {
  const { toast } = useToast();
  
  return useQuery({
    queryKey: ['territories'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('territories')
          .select(`
            id,
            name,
            state,
            city,
            description,
            status,
            franchise_owner_id,
            created_at,
            updated_at,
            assigned_at,
            franchise_owners (
              id, 
              company_name
            )
          `);
        
        if (error) throw error;
        return data || [];
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch territories",
          variant: "destructive"
        });
        return [];
      }
    }
  });
};

export const useFetchFranchiseOwners = () => {
  const { toast } = useToast();
  
  return useQuery({
    queryKey: ['franchise_owners'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('franchise_owners')
          .select(`
            id, 
            user_id,
            company_name,
            contact_email,
            contact_phone
          `);
        
        if (error) throw error;
        return data || [];
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch franchise owners",
          variant: "destructive"
        });
        return [];
      }
    }
  });
};

export const useFetchFranchiseStaff = (franchiseOwnerId: string | null) => {
  const { toast } = useToast();
  
  return useQuery({
    queryKey: ['franchise_staff', franchiseOwnerId],
    queryFn: async () => {
      if (!franchiseOwnerId) return [];
      
      try {
        const { data, error } = await supabase
          .from('franchise_staff')
          .select(`
            id,
            full_name,
            role,
            email,
            territory_id,
            territories (name)
          `)
          .eq('franchise_owner_id', franchiseOwnerId);
        
        if (error) throw error;
        return data || [];
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch franchise staff",
          variant: "destructive"
        });
        return [];
      }
    },
    enabled: !!franchiseOwnerId
  });
};

export const useCreateTerritory = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (territory: {
      name: string;
      state: string;
      city?: string;
      description?: string;
      status: 'available' | 'assigned' | 'pending' | 'unavailable';
    }) => {
      const { data, error } = await supabase
        .from('territories')
        .insert([territory])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      toast({
        title: "Success",
        description: "Territory created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create territory: ${error.message}`,
        variant: "destructive"
      });
    }
  });
};

export const useUpdateTerritory = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({
      id,
      territory
    }: {
      id: string;
      territory: {
        name?: string;
        state?: string;
        city?: string;
        description?: string;
        status?: 'available' | 'assigned' | 'pending' | 'unavailable';
      };
    }) => {
      const { data, error } = await supabase
        .from('territories')
        .update(territory)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      toast({
        title: "Success",
        description: "Territory updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update territory: ${error.message}`,
        variant: "destructive"
      });
    }
  });
};

export const useAssignTerritory = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({
      territoryId,
      franchiseOwnerId
    }: {
      territoryId: string;
      franchiseOwnerId: string;
    }) => {
      const { data, error } = await supabase
        .from('territories')
        .update({
          franchise_owner_id: franchiseOwnerId,
          status: 'assigned',
          assigned_at: new Date().toISOString(),
        })
        .eq('id', territoryId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      queryClient.invalidateQueries({ queryKey: ['franchise_owners'] });
      toast({
        title: "Success",
        description: "Territory assigned successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to assign territory: ${error.message}`,
        variant: "destructive"
      });
    }
  });
};

export const useCheckUserRole = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user_role', user?.id],
    queryFn: async () => {
      if (!user?.id) return { isAdmin: false };
      
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();
        
        if (error) throw error;
        
        const isAdmin = data?.role === 'admin' || data?.role === 'super_admin';
        return { isAdmin, role: data?.role };
      } catch (error) {
        console.error("Error checking user role:", error);
        return { isAdmin: false };
      }
    },
    enabled: !!user?.id
  });
};

export const useFetchCurrentFranchiseOwner = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  return useQuery({
    queryKey: ['current_franchise_owner', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      try {
        const { data, error } = await supabase
          .from('franchise_owners')
          .select(`
            id, 
            company_name,
            contact_email,
            contact_phone,
            address
          `)
          .eq('user_id', user.id)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') {
            return null; // No matching record found
          }
          throw error;
        }
        
        return data;
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch franchise owner details",
          variant: "destructive"
        });
        return null;
      }
    },
    enabled: !!user?.id
  });
};
