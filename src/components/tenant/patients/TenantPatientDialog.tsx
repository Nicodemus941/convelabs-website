
import React from 'react';
import { TenantPatient, TenantMembershipPlan } from '@/types/tenant';
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
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenantMembershipPlans } from '@/hooks/tenant/useTenantMembershipPlans';
import { useEffect } from 'react';

interface TenantPatientDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<TenantPatient>) => void;
  patient: TenantPatient | null;
}

const TenantPatientDialog: React.FC<TenantPatientDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  patient
}) => {
  const { register, handleSubmit, setValue, formState: { errors }, watch } = useForm<Partial<TenantPatient>>({
    defaultValues: patient || {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      is_active: true,
      membership_status: 'none'
    }
  });

  const { membershipPlans, getTenantMembershipPlans } = useTenantMembershipPlans();
  
  useEffect(() => {
    if (isOpen) {
      getTenantMembershipPlans();
    }
  }, [isOpen]);
  
  useEffect(() => {
    if (patient) {
      Object.entries(patient).forEach(([key, value]) => {
        setValue(key as keyof TenantPatient, value);
      });
    }
  }, [patient, setValue]);
  
  const onSubmit = (data: Partial<TenantPatient>) => {
    onSave(data);
  };
  
  const handleMembershipChange = (value: string) => {
    setValue('membership_plan_id', value || undefined);
    setValue('membership_status', value ? 'active' : 'none');
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{patient ? 'Edit Patient' : 'Add New Patient'}</DialogTitle>
          <DialogDescription>
            {patient ? 'Update patient information.' : 'Create a new patient record.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                placeholder="John"
                {...register('first_name', { required: 'First name is required' })}
              />
              {errors.first_name && <p className="text-sm text-red-500">{errors.first_name.message}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                placeholder="Doe"
                {...register('last_name', { required: 'Last name is required' })}
              />
              {errors.last_name && <p className="text-sm text-red-500">{errors.last_name.message}</p>}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="john.doe@example.com"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              placeholder="(555) 123-4567"
              {...register('phone')}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="date_of_birth">Date of Birth</Label>
            <Input
              id="date_of_birth"
              type="date"
              {...register('date_of_birth')}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="membership_plan_id">Membership Plan</Label>
            <Select 
              value={watch('membership_plan_id') || ''} 
              onValueChange={handleMembershipChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select membership plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No Membership</SelectItem>
                {membershipPlans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

export default TenantPatientDialog;
