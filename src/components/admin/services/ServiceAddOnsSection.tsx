import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, X, DollarSign, Clock, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ServiceAddOn {
  id?: string;
  name: string;
  description: string;
  additional_price: number;
  additional_duration_minutes: number;
  is_required: boolean;
  is_active: boolean;
  display_order: number;
}

interface ServiceAddOnsSectionProps {
  serviceId?: string;
  addOns: ServiceAddOn[];
  onAddOnsChange: (addOns: ServiceAddOn[]) => void;
}

const ServiceAddOnsSection: React.FC<ServiceAddOnsSectionProps> = ({
  serviceId,
  addOns,
  onAddOnsChange
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [newAddOn, setNewAddOn] = useState<ServiceAddOn>({
    name: '',
    description: '',
    additional_price: 0,
    additional_duration_minutes: 0,
    is_required: false,
    is_active: true,
    display_order: 0
  });

  useEffect(() => {
    if (serviceId) {
      fetchExistingAddOns();
    }
  }, [serviceId]);

  const fetchExistingAddOns = async () => {
    if (!serviceId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_add_ons')
        .select('*')
        .eq('parent_service_id', serviceId)
        .order('display_order');

      if (error) throw error;

      onAddOnsChange(data || []);
    } catch (error) {
      console.error('Error fetching add-ons:', error);
      toast.error('Failed to fetch service add-ons');
    } finally {
      setIsLoading(false);
    }
  };

  const addNewAddOn = () => {
    if (!newAddOn.name.trim()) {
      toast.error('Add-on name is required');
      return;
    }

    const addOnToAdd: ServiceAddOn = {
      ...newAddOn,
      display_order: addOns.length,
      additional_price: Math.round(newAddOn.additional_price * 100) // Convert to cents
    };

    onAddOnsChange([...addOns, addOnToAdd]);
    
    // Reset form
    setNewAddOn({
      name: '',
      description: '',
      additional_price: 0,
      additional_duration_minutes: 0,
      is_required: false,
      is_active: true,
      display_order: 0
    });
  };

  const removeAddOn = (index: number) => {
    const updatedAddOns = addOns.filter((_, i) => i !== index);
    // Update display order
    const reorderedAddOns = updatedAddOns.map((addOn, i) => ({
      ...addOn,
      display_order: i
    }));
    onAddOnsChange(reorderedAddOns);
  };

  const updateAddOn = (index: number, field: keyof ServiceAddOn, value: any) => {
    const updatedAddOns = addOns.map((addOn, i) =>
      i === index
        ? { ...addOn, [field]: value }
        : addOn
    );
    onAddOnsChange(updatedAddOns);
  };

  const moveAddOn = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= addOns.length) return;

    const updatedAddOns = [...addOns];
    [updatedAddOns[index], updatedAddOns[newIndex]] = [updatedAddOns[newIndex], updatedAddOns[index]];
    
    // Update display order
    const reorderedAddOns = updatedAddOns.map((addOn, i) => ({
      ...addOn,
      display_order: i
    }));
    
    onAddOnsChange(reorderedAddOns);
  };

  const formatPrice = (priceInCents: number) => {
    return (priceInCents / 100).toFixed(2);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Service Add-ons
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Add-on Form */}
        <Card className="p-4 bg-gray-50">
          <h4 className="font-medium mb-3">Add New Service Add-on</h4>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="addon-name">Add-on Name *</Label>
              <Input
                id="addon-name"
                value={newAddOn.name}
                onChange={(e) => setNewAddOn(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Rush Processing"
              />
            </div>
            
            <div>
              <Label htmlFor="addon-price">Additional Price ($)</Label>
              <Input
                id="addon-price"
                type="number"
                step="0.01"
                value={newAddOn.additional_price}
                onChange={(e) => setNewAddOn(prev => ({ 
                  ...prev, 
                  additional_price: Number(e.target.value) 
                }))}
                placeholder="0.00"
              />
            </div>
          </div>
          
          <div className="mb-4">
            <Label htmlFor="addon-description">Description</Label>
            <Textarea
              id="addon-description"
              value={newAddOn.description}
              onChange={(e) => setNewAddOn(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what this add-on provides..."
              rows={2}
            />
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="addon-duration">Additional Duration (minutes)</Label>
              <Input
                id="addon-duration"
                type="number"
                value={newAddOn.additional_duration_minutes}
                onChange={(e) => setNewAddOn(prev => ({ 
                  ...prev, 
                  additional_duration_minutes: Number(e.target.value) 
                }))}
                placeholder="0"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                checked={newAddOn.is_required}
                onCheckedChange={(value) => setNewAddOn(prev => ({ ...prev, is_required: value }))}
              />
              <Label>Required</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                checked={newAddOn.is_active}
                onCheckedChange={(value) => setNewAddOn(prev => ({ ...prev, is_active: value }))}
              />
              <Label>Active</Label>
            </div>
          </div>
          
          <Button onClick={addNewAddOn} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Service Add-on
          </Button>
        </Card>

        {/* Current Add-ons */}
        <div className="space-y-4">
          <h4 className="font-medium">Current Add-ons ({addOns.length})</h4>
          
          {isLoading ? (
            <div className="text-center py-4">Loading add-ons...</div>
          ) : addOns.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No add-ons configured for this service yet.
            </div>
          ) : (
            addOns.map((addOn, index) => (
              <Card key={index} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h5 className="font-medium">{addOn.name}</h5>
                    <div className="flex gap-1">
                      {addOn.is_required && (
                        <Badge variant="destructive" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Required
                        </Badge>
                      )}
                      {!addOn.is_active && (
                        <Badge variant="secondary" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveAddOn(index, 'up')}
                      disabled={index === 0}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveAddOn(index, 'down')}
                      disabled={index === addOns.length - 1}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeAddOn(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <Label>Add-on Name</Label>
                    <Input
                      value={addOn.name}
                      onChange={(e) => updateAddOn(index, 'name', e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <Label>Additional Price ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formatPrice(addOn.additional_price)}
                      onChange={(e) => updateAddOn(
                        index, 
                        'additional_price', 
                        Math.round(Number(e.target.value) * 100)
                      )}
                    />
                  </div>
                </div>
                
                <div className="mb-3">
                  <Label>Description</Label>
                  <Textarea
                    value={addOn.description}
                    onChange={(e) => updateAddOn(index, 'description', e.target.value)}
                    rows={2}
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Additional Duration (min)</Label>
                    <Input
                      type="number"
                      value={addOn.additional_duration_minutes}
                      onChange={(e) => updateAddOn(
                        index, 
                        'additional_duration_minutes', 
                        Number(e.target.value)
                      )}
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={addOn.is_required}
                      onCheckedChange={(value) => updateAddOn(index, 'is_required', value)}
                    />
                    <Label>Required</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={addOn.is_active}
                      onCheckedChange={(value) => updateAddOn(index, 'is_active', value)}
                    />
                    <Label>Active</Label>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 mt-3 pt-3 border-t text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    +${formatPrice(addOn.additional_price)}
                  </div>
                  {addOn.additional_duration_minutes > 0 && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      +{addOn.additional_duration_minutes} min
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ServiceAddOnsSection;