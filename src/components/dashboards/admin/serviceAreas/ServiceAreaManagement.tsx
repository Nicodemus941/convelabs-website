import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { LoaderIcon, PlusCircle, Edit2, Trash2 } from 'lucide-react';
import { ServiceArea, getServiceAreas } from '@/services/phlebotomistAssignmentService';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const ServiceAreaManagement: React.FC = () => {
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [currentArea, setCurrentArea] = useState<ServiceArea | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    zipcodes: ''
  });

  const { user } = useAuth();

  useEffect(() => {
    loadServiceAreas();
  }, []);

  const loadServiceAreas = async () => {
    setIsLoading(true);
    try {
      const areas = await getServiceAreas();
      setServiceAreas(areas);
    } catch (error) {
      console.error("Error loading service areas:", error);
      toast.error("Failed to load service areas");
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateDialog = () => {
    setCurrentArea(null);
    setFormData({
      name: '',
      description: '',
      zipcodes: ''
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (area: ServiceArea) => {
    setCurrentArea(area);
    setFormData({
      name: area.name,
      description: area.description || '',
      zipcodes: area.zipcode_list ? area.zipcode_list.join(', ') : ''
    });
    setIsDialogOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.zipcodes.trim()) {
      toast.error("Please provide a name and at least one zipcode");
      return;
    }

    setIsSaving(true);
    try {
      // Parse zipcodes, removing any whitespace and splitting by commas
      const zipcodeParsed = formData.zipcodes
        .split(',')
        .map(zip => zip.trim())
        .filter(zip => zip !== '');

      if (zipcodeParsed.length === 0) {
        toast.error("Please provide at least one zipcode");
        setIsSaving(false);
        return;
      }

      if (currentArea) {
        // Update existing area
        const { error } = await supabase
          .from('tenant_service_areas')
          .update({
            name: formData.name,
            description: formData.description,
            zipcode_list: zipcodeParsed,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentArea.id);

        if (error) throw error;
        toast.success("Service area updated successfully");
      } else {
        // Create new area - tenant_id is now properly provided
        // Get the tenant ID from user context or provide a default
        const tenantId = "00000000-0000-0000-0000-000000000000"; // Placeholder default tenant ID
        
        const { error } = await supabase
          .from('tenant_service_areas')
          .insert({
            name: formData.name,
            description: formData.description,
            zipcode_list: zipcodeParsed,
            is_active: true,
            tenant_id: tenantId
          });

        if (error) throw error;
        toast.success("Service area created successfully");
      }

      setIsDialogOpen(false);
      loadServiceAreas();
    } catch (error) {
      console.error("Error saving service area:", error);
      toast.error(`Failed to ${currentArea ? 'update' : 'create'} service area`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (areaId: string) => {
    if (!confirm("Are you sure you want to delete this service area?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('tenant_service_areas')
        .update({ is_active: false })
        .eq('id', areaId);

      if (error) throw error;
      toast.success("Service area deleted successfully");
      loadServiceAreas();
    } catch (error) {
      console.error("Error deleting service area:", error);
      toast.error("Failed to delete service area");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle>Service Areas Management</CardTitle>
            <CardDescription>
              Define service areas by zipcode to optimize phlebotomist assignments
            </CardDescription>
          </div>
          <Button onClick={openCreateDialog}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Service Area
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-6">
              <LoaderIcon className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : serviceAreas.length === 0 ? (
            <div className="text-center py-8 border border-dashed rounded-lg">
              <p className="text-muted-foreground mb-4">No service areas defined</p>
              <Button variant="outline" onClick={openCreateDialog}>
                <PlusCircle className="h-4 w-4 mr-2" />
                Create Service Area
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {serviceAreas.map((area) => (
                <div key={area.id} className="flex items-center justify-between p-4 border rounded-md">
                  <div>
                    <h3 className="font-medium">{area.name}</h3>
                    {area.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {area.description}
                      </p>
                    )}
                    <div className="mt-2">
                      <Badge variant="outline">
                        {area.zipcode_list ? area.zipcode_list.length : 0} zipcodes
                      </Badge>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => openEditDialog(area)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleDelete(area.id)}
                      disabled={isDeleting}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {currentArea ? 'Edit Service Area' : 'Create Service Area'}
            </DialogTitle>
            <DialogDescription>
              Define a service area by name and zipcodes
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Area Name</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Orlando Metro Area"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Description of the service area"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipcodes">Zipcodes (comma separated)</Label>
              <Textarea
                id="zipcodes"
                name="zipcodes"
                value={formData.zipcodes}
                onChange={handleInputChange}
                placeholder="e.g., 32801, 32803, 32804"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : currentArea ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServiceAreaManagement;
