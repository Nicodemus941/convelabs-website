import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Territory {
  id: string;
  name: string;
  state: string;
  city?: string;
  description?: string;
  postal_codes?: string[];
  franchise_owner_id?: string;
  status: 'available' | 'assigned' | 'pending' | 'unavailable';
  created_at: string;
  updated_at?: string;
  assigned_at?: string;
}

export interface FranchiseOwner {
  id: string;
  user_id: string;
  company_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  territory_ids?: string[];
  created_at: string;
  updated_at?: string;
}

export const useTerritories = () => {
  return useQuery({
    queryKey: ['territories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('territories')
        .select('*');
      
      if (error) throw error;
      return data as Territory[];
    },
  });
};

export const useTerritoryById = (id: string | undefined) => {
  return useQuery({
    queryKey: ['territories', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('territories')
        .select(`
          *,
          franchise_owners (
            id,
            company_name,
            user_id
          )
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      // Convert to expected type with single franchise owner object
      const territory = data as any;
      
      // If there's no franchise owner, just return the territory
      if (!territory.franchise_owners || territory.franchise_owners.length === 0) {
        return {
          ...territory,
          franchise_owners: null
        } as Territory & { franchise_owners: null };
      }
      
      // Return first franchise owner (should be just one)
      return {
        ...territory,
        franchise_owners: territory.franchise_owners[0]
      } as Territory & { franchise_owners: { id: string, company_name: string, user_id: string } };
    },
    enabled: !!id,
  });
};

export const useFranchiseOwners = () => {
  return useQuery({
    queryKey: ['franchise_owners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('franchise_owners')
        .select(`
          id,
          user_id,
          company_name,
          contact_email,
          contact_phone,
          address,
          created_at,
          updated_at
        `);
      
      if (error) throw error;
      
      return data as FranchiseOwner[];
    },
  });
};

export const useFranchiseOwnerById = (id: string | undefined) => {
  return useQuery({
    queryKey: ['franchise_owners', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('franchise_owners')
        .select(`
          *,
          territories (
            id,
            name,
            state,
            city,
            status
          )
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
};

export const useCreateTerritory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (territory: Omit<Territory, 'id' | 'created_at'>) => {
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
    },
  });
};

export const useUpdateTerritory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, territory }: { id: string, territory: Partial<Territory> }) => {
      const { data, error } = await supabase
        .from('territories')
        .update(territory)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      queryClient.invalidateQueries({ queryKey: ['territories', variables.id] });
    },
  });
};

export const useAssignTerritory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ territory_id, franchise_owner_id }: { territory_id: string, franchise_owner_id: string }) => {
      const { data, error } = await supabase
        .from('territories')
        .update({ 
          franchise_owner_id, 
          status: 'assigned',
          assigned_at: new Date().toISOString()
        })
        .eq('id', territory_id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      queryClient.invalidateQueries({ queryKey: ['franchise_owners'] });
    },
  });
};

export const useFranchisePerformance = (franchiseOwnerId: string | undefined, timeRange = 90) => {
  return useQuery({
    queryKey: ['franchise_performance', franchiseOwnerId, timeRange],
    queryFn: async () => {
      if (!franchiseOwnerId) return null;
      
      const { data, error } = await supabase
        .from('franchise_performance')
        .select('*')
        .eq('franchise_owner_id', franchiseOwnerId)
        .gte('date', new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000).toISOString())
        .order('date', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!franchiseOwnerId,
  });
};

export const useFranchiseStaff = (franchiseOwnerId: string | undefined) => {
  return useQuery({
    queryKey: ['franchise_staff', franchiseOwnerId],
    queryFn: async () => {
      if (!franchiseOwnerId) return [];
      
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
      return data;
    },
    enabled: !!franchiseOwnerId,
  });
};
