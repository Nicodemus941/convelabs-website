
import React from 'react';
import { Button } from '@/components/ui/button';
import { LoaderCircle } from 'lucide-react';

interface OrderSummaryProps {
  selectedPlan?: {
    id: string;
    name: string;
    price: number;
  };
  selectedAddOns: Array<{
    id: string;
    name: string;
    price: number;
  }>;
  totalPrice: number;
  onCheckout: () => void;
  isProcessing?: boolean;
}

const OrderSummary: React.FC<OrderSummaryProps> = ({ 
  selectedPlan, 
  selectedAddOns, 
  totalPrice, 
  onCheckout,
  isProcessing = false
}) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <h3 className="text-xl font-semibold border-b pb-4 mb-4">Order Summary</h3>
      
      <div className="space-y-4 mb-6">
        {selectedPlan && (
          <div className="flex justify-between">
            <span className="font-medium">{selectedPlan.name}</span>
            <span>${(selectedPlan.price / 100).toFixed(0)}</span>
          </div>
        )}
        
        {selectedAddOns.length > 0 && (
          <>
            <p className="font-medium">Add-ons:</p>
            {selectedAddOns.map(addon => (
              <div key={addon.id} className="flex justify-between pl-4">
                <span>{addon.name}</span>
                <span>${(addon.price / 100).toFixed(0)}</span>
              </div>
            ))}
          </>
        )}
        
        <div className="flex justify-between border-t pt-4 font-bold">
          <span>Total:</span>
          <span>${(totalPrice / 100).toFixed(0)}</span>
        </div>
      </div>
      
      <div className="flex justify-end">
        <Button 
          onClick={onCheckout}
          disabled={isProcessing}
          size="lg"
        >
          {isProcessing ? (
            <>
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : 'Complete Checkout'}
        </Button>
      </div>
      
      <p className="text-sm text-gray-500 mt-4">
        By proceeding with checkout, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
};

export default OrderSummary;
