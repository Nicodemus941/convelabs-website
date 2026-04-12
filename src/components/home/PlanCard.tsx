
import React from "react";
import { Link } from "react-router-dom";

interface Feature {
  text: string;
}

interface PriceOption {
  quarterly: string;
  annually: string;
}

interface PlanCardProps {
  title: string;
  price: string;
  description: string;
  features: Feature[];
  priceOptions: PriceOption;
  popular?: boolean;
}

const PlanCard = ({ title, price, description, features, priceOptions, popular = false }: PlanCardProps) => {
  return (
    <div className={`luxury-card flex flex-col h-full ${popular ? 'relative border-conve-gold' : ''}`}>
      {popular && (
        <div className="absolute -top-4 inset-x-0 mx-auto w-36 bg-conve-gold text-white text-sm py-1 rounded-full text-center font-medium shadow-md">
          <span className="font-bold">Most Popular</span>
        </div>
      )}
      <div className="p-6 border-b">
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <div className="flex items-baseline mb-4">
          <span className="text-3xl font-bold">{price}</span>
          <span className="text-gray-600 ml-1">/month</span>
        </div>
        <p className="text-gray-700">{description}</p>
      </div>
      <div className="p-6 flex-grow">
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{feature.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="p-6 mt-auto border-t">
        <div className="text-center text-sm mb-4">
          <p>Also available:</p>
          <div className="font-medium">
            <span className="text-conve-gold">{priceOptions.quarterly}</span> quarterly | 
            <span className="text-conve-gold"> {priceOptions.annually}</span> annually
          </div>
        </div>
        <Link to="/signup" className="block text-center luxury-button w-full">
          Select Plan
        </Link>
      </div>
    </div>
  );
};

export default PlanCard;
