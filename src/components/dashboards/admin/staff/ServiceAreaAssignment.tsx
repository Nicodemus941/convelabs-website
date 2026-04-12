
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/sonner';
import { LoaderIcon } from 'lucide-react';
import { 
  getServiceAreas, 
  getPhlebotomistServiceAreas, 
  assignServiceAreasToPhlebotomist,
  ServiceArea 
} from '@/services/phlebotomistAssignmentService';

interface ServiceAreaAssignmentProps {
  phlebotomistId: string;
}

const ServiceAreaAssignment: React.FC<ServiceAreaAssignmentProps> = ({ phlebotomistId }) => {
  const [allServiceAreas, setAllServiceAreas] = useState<ServiceArea[]>([]);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load all service areas
        const areas = await getServiceAreas();
        setAllServiceAreas(areas);
        
        // Load phlebotomist's assigned areas
        const assignedAreas = await getPhlebotomistServiceAreas(phlebotomistId);
        setSelectedAreaIds(assignedAreas.map(area => area.id));
      } catch (error) {
        console.error("Error loading service areas:", error);
        toast.error("Failed to load service areas");
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [phlebotomistId]);

  const handleCheckboxChange = (areaId: string, checked: boolean) => {
    if (checked) {
      setSelectedAreaIds(prev => [...prev, areaId]);
    } else {
      setSelectedAreaIds(prev => prev.filter(id => id !== areaId));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await assignServiceAreasToPhlebotomist(phlebotomistId, selectedAreaIds);
      if (success) {
        toast.success("Service areas updated successfully");
      } else {
        toast.error("Failed to update service areas");
      }
    } catch (error) {
      console.error("Error saving service areas:", error);
      toast.error("An error occurred while saving service areas");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Service Area Assignment</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center p-6">
          <LoaderIcon className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service Area Assignment</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {allServiceAreas.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No service areas defined. Please create service areas first.
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {allServiceAreas.map((area) => (
                  <div key={area.id} className="flex items-center space-x-3">
                    <Checkbox 
                      id={`area-${area.id}`} 
                      checked={selectedAreaIds.includes(area.id)}
                      onCheckedChange={(checked) => handleCheckboxChange(area.id, checked === true)}
                    />
                    <label 
                      htmlFor={`area-${area.id}`}
                      className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center justify-between"
                    >
                      <span>{area.name}</span>
                      <Badge variant="outline" className="ml-2">
                        {area.zipcode_list ? area.zipcode_list.length : 0} zipcodes
                      </Badge>
                    </label>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t">
                <Button 
                  onClick={handleSave} 
                  disabled={isSaving}
                  className="w-full"
                >
                  {isSaving ? (
                    <>
                      <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Service Area Assignments"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ServiceAreaAssignment;
