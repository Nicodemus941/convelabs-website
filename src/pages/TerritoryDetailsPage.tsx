
import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Import components
import PageHeader from '@/components/ui/page-header';
import LoadingState from '@/components/ui/loading-state';
import ErrorBoundary from '@/components/ui/error-boundary';
// Import other necessary components

const TerritoryDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  
  const { data: territory, isLoading, error } = useQuery({
    queryKey: ['territory', id],
    queryFn: async () => {
      if (!id) throw new Error("Territory ID is required");
      
      const { data, error } = await supabase
        .from('territories')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    }
  });
  
  if (isLoading) {
    return <LoadingState message="Loading territory details..." />;
  }
  
  if (error) {
    return (
      <div className="p-4 border border-red-200 rounded-md">
        <h3 className="text-red-800 font-medium">Error loading territory details</h3>
        <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6 px-4">
      <PageHeader
        title={territory?.name || 'Territory Details'}
        description={`Details for ${territory?.name || 'this territory'}`}
      />
      
      {/* Territory details content would go here */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-4">Territory Information</h3>
          <div className="space-y-2">
            <p><span className="font-medium">Name:</span> {territory?.name}</p>
            <p><span className="font-medium">State:</span> {territory?.state}</p>
            <p><span className="font-medium">City:</span> {territory?.city || 'N/A'}</p>
            <p><span className="font-medium">Status:</span> {territory?.status}</p>
            <p><span className="font-medium">Description:</span> {territory?.description || 'No description available'}</p>
          </div>
        </div>
        
        {/* Additional panels for territory data would go here */}
      </div>
    </div>
  );
};

export default TerritoryDetailsPage;
