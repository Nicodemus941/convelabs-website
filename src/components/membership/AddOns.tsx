
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserAddOns } from '@/hooks/useUserAddOns';
import { createAddOnCheckoutSession } from '@/services/stripe/addOnCheckout';
import { toast } from '@/components/ui/sonner';
import { Separator } from '@/components/ui/separator';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Package } from 'lucide-react';

interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  features?: string[];
}

const mockAddOns: AddOn[] = [
  {
    id: 'addon-1',
    name: 'Priority Scheduling',
    description: 'Get priority access to appointment slots, even during peak hours.',
    price: 19.99,
    features: [
      'Book appointments up to 24 hours ahead of regular members',
      'Access to emergency slots',
      'Skip the queue for high-demand time slots'
    ]
  },
  {
    id: 'addon-2',
    name: 'Family Add-On',
    description: 'Extend your benefits to one additional family member living at the same address.',
    price: 24.99,
    features: [
      'Share your lab credits with one family member',
      'Manage appointments from a single account',
      'Combined billing for simplicity'
    ]
  },
  {
    id: 'addon-3',
    name: 'Results Dashboard Pro',
    description: 'Enhanced lab results dashboard with trending, alerts, and physician sharing.',
    price: 14.99,
    features: [
      'Historical result trending and graphs',
      'Automatic alerts for out-of-range values',
      'One-click sharing with healthcare providers',
      'Export to PDF or CSV formats'
    ]
  }
];

const AddOns: React.FC = () => {
  const { userAddOns, hasAddOn, addAddOn, removeAddOn, isLoading } = useUserAddOns();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const handlePurchaseAddOn = async (addOnId: string) => {
    setProcessingId(addOnId);
    try {
      // Use the dedicated add-on checkout function
      const result = await createAddOnCheckoutSession(addOnId);
      
      if (result.error) {
        toast.error(result.error);
      } else if (result.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error('Error purchasing add-on:', error);
      toast.error('Failed to process your request. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };
  
  const handleRemoveAddOn = async (addOnId: string) => {
    setProcessingId(addOnId);
    try {
      await removeAddOn.mutateAsync(addOnId);
      toast.success('Add-on removed successfully');
    } catch (error) {
      console.error('Error removing add-on:', error);
      toast.error('Failed to remove add-on. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };
  
  return (
    <div>
      <div className="space-y-2 mb-6">
        <h2 className="text-2xl font-bold">Add-Ons & Enhancements</h2>
        <p className="text-gray-600">
          Customize your membership with these add-ons to enhance your experience.
        </p>
      </div>
      
      <div className="grid md:grid-cols-3 gap-6">
        {mockAddOns.map(addOn => {
          const isOwned = hasAddOn(addOn.id);
          const isProcessing = processingId === addOn.id;
          
          return (
            <Card key={addOn.id} className={`overflow-hidden ${isOwned ? 'border-green-500 border-2' : ''}`}>
              {isOwned && (
                <div className="bg-green-500 text-white py-1 px-4 text-center text-sm font-medium">
                  Active
                </div>
              )}
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  {addOn.name}
                  {isOwned ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <Package className="h-5 w-5 text-gray-400" />
                  )}
                </CardTitle>
                <CardDescription>{addOn.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-4">${addOn.price}/mo</div>
                
                {addOn.features && addOn.features.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {addOn.features.map((feature, index) => (
                      <div key={index} className="flex items-start">
                        <span className="flex-shrink-0 h-5 w-5 bg-green-100 rounded-full flex items-center justify-center mr-2 mt-0.5">
                          <span className="h-1.5 w-1.5 bg-green-600 rounded-full"></span>
                        </span>
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter>
                {isOwned ? (
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => handleRemoveAddOn(addOn.id)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Remove Add-On'}
                  </Button>
                ) : (
                  <Button 
                    className="w-full" 
                    onClick={() => handlePurchaseAddOn(addOn.id)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Add to Membership'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AddOns;
