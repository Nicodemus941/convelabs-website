
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

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

export const useTerritories = () => {
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
            postal_codes,
            franchise_owners (
              id, 
              company_name
            )
          `);
        
        if (error) throw error;
        
        // Convert status to the correct type
        const territories = data?.map(territory => ({
          ...territory,
          status: territory.status as 'available' | 'assigned' | 'pending' | 'unavailable'
        })) || [];
        
        return territories as Territory[];
      } catch (error) {
        console.error("Error fetching territories:", error);
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
      
      // Convert to expected type with franchise owner object
      const territory = data as any;
      
      // If there's no franchise owner, just return the territory
      if (!territory.franchise_owners || territory.franchise_owners.length === 0) {
        return {
          ...territory,
          franchise_owners: null,
          status: territory.status as 'available' | 'assigned' | 'pending' | 'unavailable'
        } as Territory & { franchise_owners: null };
      }
      
      // Return first franchise owner (should be just one)
      return {
        ...territory,
        status: territory.status as 'available' | 'assigned' | 'pending' | 'unavailable',
        franchise_owners: territory.franchise_owners[0]
      } as Territory & { franchise_owners: { id: string, company_name: string, user_id: string } };
    },
    enabled: !!id,
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      queryClient.invalidateQueries({ queryKey: ['territories', variables.id] });
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
