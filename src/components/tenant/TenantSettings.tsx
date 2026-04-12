
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Tenant } from '@/types/tenant';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface TenantSettingsProps {
  tenant: Tenant;
}

const TenantSettings: React.FC<TenantSettingsProps> = ({ tenant }) => {
  const { updateTenant } = useTenant();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Initialize form with tenant data
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      name: tenant.name,
      contact_email: tenant.contact_email,
      contact_phone: tenant.contact_phone || '',
      description: tenant.description || '',
      branding: {
        primary_color: tenant.branding.primary_color,
        secondary_color: tenant.branding.secondary_color
      }
    }
  });
  
  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      await updateTenant(tenant.id, {
        name: data.name,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone || null,
        description: data.description,
        branding: {
          primary_color: data.branding.primary_color,
          secondary_color: data.branding.secondary_color,
          logo_path: tenant.branding.logo_path
        }
      });
      toast.success("Settings updated successfully");
    } catch (error) {
      console.error("Error updating tenant:", error);
      toast.error("Failed to update settings");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Organization Settings</CardTitle>
            <CardDescription>
              Update your organization's basic information and branding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Organization Name</Label>
                  <Input 
                    id="name" 
                    {...register('name', { required: 'Name is required' })}
                  />
                  {errors.name && (
                    <p className="text-sm text-red-500">{errors.name.message as string}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="contact_email">Contact Email</Label>
                  <Input 
                    id="contact_email" 
                    type="email" 
                    {...register('contact_email', { 
                      required: 'Email is required',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Invalid email address'
                      }
                    })}
                  />
                  {errors.contact_email && (
                    <p className="text-sm text-red-500">{errors.contact_email.message as string}</p>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="contact_phone">Contact Phone (optional)</Label>
                <Input 
                  id="contact_phone" 
                  {...register('contact_phone')}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea 
                  id="description" 
                  rows={4} 
                  {...register('description')}
                  placeholder="Describe your organization"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primary_color">Primary Color</Label>
                  <div className="flex space-x-2">
                    <Input 
                      id="primary_color" 
                      type="color" 
                      className="w-12 h-10 p-1" 
                      {...register('branding.primary_color')}
                    />
                    <Input 
                      id="primary_color_text" 
                      className="flex-1" 
                      {...register('branding.primary_color')}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="secondary_color">Secondary Color</Label>
                  <div className="flex space-x-2">
                    <Input 
                      id="secondary_color" 
                      type="color" 
                      className="w-12 h-10 p-1" 
                      {...register('branding.secondary_color')}
                    />
                    <Input 
                      id="secondary_color_text" 
                      className="flex-1" 
                      {...register('branding.secondary_color')}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default TenantSettings;
