
import React, { useState } from 'react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUserAddOns } from '@/hooks/useUserAddOns';
import { toast } from '@/components/ui/sonner';
import { AddOn } from './MembershipTypes';

interface AddOnSelectorProps {
  addOns: AddOn[] | any[];
  onAddOnSelected: (addOnId: string | null) => void;
  isSupernovaOffer?: boolean;
  isSupernovaMember?: boolean;
  onSelect?: (addOnId: string) => void;
  selectedAddOnId?: string | null;
}

const AddOnSelector: React.FC<AddOnSelectorProps> = ({ 
  addOns, 
  onAddOnSelected,
  isSupernovaOffer = false,
  isSupernovaMember = false,
  onSelect,
  selectedAddOnId
}) => {
  const [selectedAddOn, setSelectedAddOn] = useState<string | null>(selectedAddOnId || null);
  const { hasAddOn } = useUserAddOns();
  
  const handleAddOnChange = (value: string) => {
    setSelectedAddOn(value);
    onAddOnSelected(value);
    if (onSelect) onSelect(value);
  };
  
  return (
    <Card className="border-2 border-gray-200">
      <CardHeader>
        <CardTitle className="text-lg">
          {isSupernovaOffer || isSupernovaMember
            ? "Choose Your FREE Premium Add-On" 
            : "Select an Optional Add-On"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup 
          value={selectedAddOn || ""} 
          onValueChange={handleAddOnChange}
          className="space-y-4"
        >
          {/* No Add-on Option */}
          <div className="flex items-center space-x-3 border p-3 rounded-md">
            <RadioGroupItem value="" id="no-addon" />
            <Label htmlFor="no-addon" className="flex-grow cursor-pointer">
              <div className="font-medium">No add-on</div>
              <div className="text-sm text-gray-500">Continue without an add-on</div>
            </Label>
          </div>
          
          {/* Add-on Options */}
          {addOns.map(addon => {
            // Extract price from different possible structures
            const addonPrice = 'price' in addon ? addon.price : 
              'monthly_price' in addon ? addon.monthly_price / 100 : 0;
            
            const isAlreadyOwned = hasAddOn(addon.id);
            
            return (
              <div 
                key={addon.id} 
                className={`flex items-center space-x-3 border p-3 rounded-md ${
                  isAlreadyOwned ? 'bg-gray-50 opacity-70' : ''
                }`}
              >
                <RadioGroupItem 
                  value={addon.id} 
                  id={`addon-${addon.id}`} 
                  disabled={isAlreadyOwned}
                />
                <Label 
                  htmlFor={`addon-${addon.id}`} 
                  className="flex justify-between w-full cursor-pointer"
                >
                  <div>
                    <div className="font-medium flex items-center">
                      {addon.name}
                      {isAlreadyOwned && (
                        <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                          Already owned
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{addon.description}</div>
                  </div>
                  <div className="text-right">
                    {isSupernovaOffer || isSupernovaMember ? (
                      <div className="text-green-600 font-medium">FREE</div>
                    ) : (
                      <div className="font-medium">${addonPrice}/mo</div>
                    )}
                  </div>
                </Label>
              </div>
            );
          })}
        </RadioGroup>
        
        {(isSupernovaOffer || isSupernovaMember) && (
          <div className="mt-4 bg-amber-50 border border-amber-200 p-3 rounded text-sm">
            <p className="text-amber-800">
              As part of your Supernova Deal, choose one premium add-on at no additional cost. 
              This add-on will remain free for the life of your membership.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AddOnSelector;
