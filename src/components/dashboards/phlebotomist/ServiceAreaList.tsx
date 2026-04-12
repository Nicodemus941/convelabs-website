
import React, { useState, useEffect } from 'react';
import { getPhlebotomistServiceAreas, ServiceArea } from '@/services/phlebotomistAssignmentService';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Loader2 } from 'lucide-react';

const ServiceAreaList: React.FC = () => {
  const { user } = useAuth();
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadServiceAreas = async () => {
      if (!user?.id) return;
      
      setIsLoading(true);
      try {
        const areas = await getPhlebotomistServiceAreas(user.id);
        setServiceAreas(areas);
      } catch (error) {
        console.error("Error loading service areas:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadServiceAreas();
  }, [user?.id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <MapPin className="mr-2 h-5 w-5" /> 
          My Service Areas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : serviceAreas.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            No specific service areas assigned. You can serve all areas.
          </div>
        ) : (
          <div className="space-y-3">
            {serviceAreas.map((area) => (
              <div key={area.id} className="p-3 border rounded-md">
                <h3 className="font-medium">{area.name}</h3>
                {area.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {area.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="bg-primary/10">
                    {area.zipcode_list?.length || 0} zipcodes
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceAreaList;
