
import React from 'react';
import { TenantMembershipPlan } from '@/types/tenant';
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
import { Switch } from '@/components/ui/switch';

interface TenantMembershipPlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<TenantMembershipPlan>) => void;
  plan: TenantMembershipPlan | null;
}

const TenantMembershipPlanDialog: React.FC<TenantMembershipPlanDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  plan
}) => {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<Partial<TenantMembershipPlan>>({
    defaultValues: plan || {
      name: '',
      description: '',
      monthly_price: 0,
      quarterly_price: undefined,
      annual_price: undefined,
      credits_per_interval: 1,
      max_users: 1,
      is_active: true
    }
  });
  
  React.useEffect(() => {
    if (plan) {
      Object.entries(plan).forEach(([key, value]) => {
        setValue(key as any, value);
      });
    }
  }, [plan, setValue]);
  
  const onSubmit = (data: Partial<TenantMembershipPlan>) => {
    onSave({
      ...data,
      monthly_price: data.monthly_price ? Number(data.monthly_price) * 100 : 0,
      quarterly_price: data.quarterly_price ? Number(data.quarterly_price) * 100 : undefined,
      annual_price: data.annual_price ? Number(data.annual_price) * 100 : undefined,
    });
  };
  
  const formatPriceForInput = (price?: number): number | undefined => {
    return price !== undefined ? price / 100 : undefined;
  };
  
  React.useEffect(() => {
    if (plan) {
      setValue('monthly_price', formatPriceForInput(plan.monthly_price));
      setValue('quarterly_price', formatPriceForInput(plan.quarterly_price));
      setValue('annual_price', formatPriceForInput(plan.annual_price));
    }
  }, [plan, setValue]);
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plan ? 'Edit Membership Plan' : 'Add New Membership Plan'}</DialogTitle>
          <DialogDescription>
            {plan ? 'Update the details of your membership plan.' : 'Create a new membership plan for your organization.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Plan Name</Label>
            <Input
              id="name"
              placeholder="Basic Membership"
              {...register('name', { required: 'Plan name is required' })}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the membership plan..."
              {...register('description')}
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="monthly_price">Monthly Price ($)</Label>
            <Input
              id="monthly_price"
              type="number"
              step="0.01"
              min="0"
              {...register('monthly_price', {
                required: 'Monthly price is required',
                valueAsNumber: true
              })}
            />
            {errors.monthly_price && <p className="text-sm text-red-500">{errors.monthly_price.message}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="annual_price">Annual Price ($)</Label>
            <Input
              id="annual_price"
              type="number"
              step="0.01"
              min="0"
              {...register('annual_price', {
                valueAsNumber: true
              })}
            />
            <p className="text-xs text-muted-foreground">Leave blank for monthly-only plan</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="credits_per_interval">Credits Per Interval</Label>
              <Input
                id="credits_per_interval"
                type="number"
                min="0"
                step="1"
                {...register('credits_per_interval', {
                  required: 'Credits are required',
                  valueAsNumber: true
                })}
              />
              {errors.credits_per_interval && <p className="text-sm text-red-500">{errors.credits_per_interval.message}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="max_users">Max Users</Label>
              <Input
                id="max_users"
                type="number"
                min="1"
                step="1"
                {...register('max_users', {
                  required: 'Max users is required',
                  valueAsNumber: true
                })}
              />
              {errors.max_users && <p className="text-sm text-red-500">{errors.max_users.message}</p>}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="is_active" 
              {...register('is_active')}
              defaultChecked={plan?.is_active ?? true}
            />
            <Label htmlFor="is_active">Active</Label>
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

export default TenantMembershipPlanDialog;
