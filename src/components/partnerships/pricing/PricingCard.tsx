
import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';

interface PricingCardProps {
  plan: {
    id: string;
    name: string;
    price: number;
    description: string;
    features: string[];
    deliveryTime: string;
    isPopular: boolean;
  };
  isSelected: boolean;
  isProcessing?: boolean;
  onCheckout: () => void;
}

const PricingCard: React.FC<PricingCardProps> = ({ plan, isSelected, isProcessing = false, onCheckout }) => {
  const { name, price, description, features, deliveryTime, isPopular } = plan;
  
  return (
    <div
      className={`${
        isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
      } bg-white p-6 rounded-lg shadow-sm border transition-all hover:shadow-md relative`}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span className="bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}
      <h3 className="text-xl font-bold mb-2">{name}</h3>
      <div className="mb-4">
        <span className="text-3xl font-bold">${(price / 100).toFixed(0)}</span>
      </div>
      <p className="text-gray-600 mb-6">{description}</p>
      
      <div className="mb-6">
        <h4 className="font-semibold mb-2">Features:</h4>
        <ul className="space-y-2">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" />
              <span className="text-gray-700">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="mb-6">
        <h4 className="font-semibold mb-2">Delivery Time:</h4>
        <p className="text-gray-700">{deliveryTime}</p>
      </div>
      
      <Button
        onClick={onCheckout}
        disabled={isProcessing}
        className="w-full"
        variant={isSelected ? "default" : "outline"}
      >
        {isProcessing ? (
          <>
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : isSelected ? (
          'Proceed to Checkout'
        ) : (
          'Select Plan'
        )}
      </Button>
    </div>
  );
};

export default PricingCard;
