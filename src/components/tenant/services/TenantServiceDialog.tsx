
import React from 'react';
import { TenantService } from '@/types/tenant';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface TenantServiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<TenantService>) => void;
  service: TenantService | null;
}

const TenantServiceDialog: React.FC<TenantServiceDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  service
}) => {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<Partial<TenantService>>({
    defaultValues: service || {
      name: '',
      description: '',
      duration: 30,
      price: undefined,
      category: '',
      available_for_nonmembers: true,
      scheduling_interval: 15,
      is_enabled: true
    }
  });
  
  React.useEffect(() => {
    if (service) {
      Object.entries(service).forEach(([key, value]) => {
        setValue(key as keyof TenantService, value);
      });
    }
  }, [service, setValue]);
  
  const onSubmit = (data: Partial<TenantService>) => {
    onSave({
      ...data,
      price: data.price ? Number(data.price) * 100 : undefined, // Convert to cents
    });
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{service ? 'Edit Service' : 'Add New Service'}</DialogTitle>
          <DialogDescription>
            {service ? 'Update the details of your service.' : 'Create a new service for your organization.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Service Name</Label>
            <Input
              id="name"
              placeholder="Blood Draw"
              {...register('name', { required: 'Service name is required' })}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              placeholder="Lab Services"
              {...register('category')}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the service..."
              {...register('description')}
              rows={3}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="5"
                step="5"
                {...register('duration', {
                  required: 'Duration is required',
                  valueAsNumber: true
                })}
              />
              {errors.duration && <p className="text-sm text-red-500">{errors.duration.message}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="scheduling_interval">Scheduling Interval</Label>
              <Input
                id="scheduling_interval"
                type="number"
                min="5"
                step="5"
                {...register('scheduling_interval', {
                  required: 'Interval is required',
                  valueAsNumber: true
                })}
              />
              {errors.scheduling_interval && <p className="text-sm text-red-500">{errors.scheduling_interval.message}</p>}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="price">Price ($)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register('price', {
                valueAsNumber: true
              })}
            />
            <p className="text-xs text-muted-foreground">Leave blank for membership-only services</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="available_for_nonmembers" 
              {...register('available_for_nonmembers')}
              defaultChecked={service?.available_for_nonmembers ?? true}
            />
            <Label htmlFor="available_for_nonmembers">Available for non-members</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="is_enabled" 
              {...register('is_enabled')}
              defaultChecked={service?.is_enabled ?? true}
            />
            <Label htmlFor="is_enabled">Active</Label>
          </div>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TenantServiceDialog;
