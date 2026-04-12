
import React, { useState, useEffect } from 'react';
import { Tenant, TenantService } from '@/types/tenant';
import { useTenantServiceManagement } from '@/hooks/tenant/useTenantServiceManagement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, Search } from 'lucide-react';
import TenantServiceDialog from './TenantServiceDialog';

interface TenantServicesProps {
  tenant: Tenant;
}

const TenantServices: React.FC<TenantServicesProps> = ({ tenant }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentService, setCurrentService] = useState<TenantService | null>(null);
  const { 
    services, 
    isLoading, 
    getTenantServices, 
    addTenantService, 
    updateTenantService,
    deleteTenantService 
  } = useTenantServiceManagement();

  useEffect(() => {
    getTenantServices();
  }, []);

  const handleAddService = () => {
    setCurrentService(null);
    setIsDialogOpen(true);
  };

  const handleEditService = (service: TenantService) => {
    setCurrentService(service);
    setIsDialogOpen(true);
  };

  const handleSaveService = async (serviceData: Partial<TenantService>) => {
    if (currentService) {
      await updateTenantService(currentService.id, serviceData);
    } else {
      await addTenantService(serviceData);
    }
    setIsDialogOpen(false);
  };

  const handleToggleStatus = async (service: TenantService) => {
    await updateTenantService(service.id, { 
      is_enabled: !service.is_enabled 
    });
  };

  const filteredServices = services.filter(service => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return service.name?.toLowerCase().includes(query) || 
           service.description?.toLowerCase().includes(query) ||
           service.category?.toLowerCase().includes(query);
  });

  const formatPrice = (price?: number) => {
    if (!price) return '-';
    return `$${(price / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Services</h2>
        <Button onClick={handleAddService}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Service
        </Button>
      </div>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search services..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No services found. Add your first service to get started.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className="grid grid-cols-6 gap-4 bg-secondary/50 p-4 font-medium">
            <div>Service</div>
            <div>Duration</div>
            <div>Price</div>
            <div>Category</div>
            <div>Status</div>
            <div>Actions</div>
          </div>
          {filteredServices.map((service) => (
            <div key={service.id} className="grid grid-cols-6 gap-4 p-4 hover:bg-secondary/20 border-t">
              <div className="font-medium">{service.name}</div>
              <div>{service.duration} min</div>
              <div>{formatPrice(service.price)}</div>
              <div>{service.category || '-'}</div>
              <div>
                <Switch 
                  checked={service.is_enabled} 
                  onCheckedChange={() => handleToggleStatus(service)} 
                  className="mr-2"
                />
                <Badge variant={service.is_enabled ? "success" : "secondary"}>
                  {service.is_enabled ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleEditService(service)}
                >
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <TenantServiceDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSave={handleSaveService}
        service={currentService}
      />
    </div>
  );
};

export default TenantServices;
