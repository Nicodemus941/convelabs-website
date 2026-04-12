import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ServiceEnhanced } from '@/types/adminTypes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ServiceStaffSection from './ServiceStaffSection';
import ServiceAddOnsSection from './ServiceAddOnsSection';

interface ServiceFormProps {
  service?: ServiceEnhanced;
  onSubmit: (serviceData: Partial<ServiceEnhanced>) => Promise<void>;
}

const ServiceForm: React.FC<ServiceFormProps> = ({ service, onSubmit }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    service_type: 'individual' | 'package' | 'add_on';
    category: string;
    base_price: number;
    duration_minutes: number;
    is_active: boolean;
    requires_lab_order: boolean;
  }>({
    name: '',
    description: '',
    service_type: 'individual',
    category: '',
    base_price: 0,
    duration_minutes: 30,
    is_active: true,
    requires_lab_order: false
  });

  const [staffAssignments, setStaffAssignments] = useState([]);
  const [addOns, setAddOns] = useState([]);

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name || '',
        description: service.description || '',
        service_type: service.service_type || 'individual',
        category: service.category || '',
        base_price: service.base_price || 0,
        duration_minutes: service.duration_minutes || 30,
        is_active: service.is_active ?? true,
        requires_lab_order: service.requires_lab_order || false
      });
    }
  }, [service]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const serviceData = {
        ...formData,
        base_price: formData.base_price,
        staff_assignments: staffAssignments,
        add_ons: addOns
      };
      
      await onSubmit(serviceData);
    } catch (error) {
      console.error('Error submitting service:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="staff">Staff Assignment</TabsTrigger>
          <TabsTrigger value="addons">Add-ons</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Service Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="name">Service Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="category">Category *</Label>
                  <Input
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="service_type">Service Type *</Label>
                  <Select 
                    value={formData.service_type} 
                    onValueChange={(value: 'individual' | 'package' | 'add_on') => 
                      setFormData(prev => ({ ...prev, service_type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select service type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual Service</SelectItem>
                      <SelectItem value="package">Service Package</SelectItem>
                      <SelectItem value="add_on">Add-on Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="base_price">Base Price ($)</Label>
                  <Input
                    id="base_price"
                    name="base_price"
                    type="number"
                    step="0.01"
                    value={formData.base_price}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      base_price: Number(e.target.value)
                    }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="duration_minutes">Duration (minutes)</Label>
                  <Input
                    id="duration_minutes"
                    name="duration_minutes"
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: Number(e.target.value) }))}
                    required
                  />
                </div>

                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(value) => setFormData(prev => ({ ...prev, is_active: value }))}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="staff">
          <ServiceStaffSection
            serviceId={service?.id}
            assignments={staffAssignments}
            onAssignmentsChange={setStaffAssignments}
          />
        </TabsContent>
        
        <TabsContent value="addons">
          <ServiceAddOnsSection
            serviceId={service?.id}
            addOns={addOns}
            onAddOnsChange={setAddOns}
          />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end space-x-2 pt-4 border-t">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : (service ? 'Update Service' : 'Create Service')}
        </Button>
      </div>
    </form>
  );
};

export default ServiceForm;