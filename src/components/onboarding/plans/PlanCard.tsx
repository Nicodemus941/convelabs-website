
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Check, X } from 'lucide-react';
import { Plan, ServiceOffering } from './PlanTypes';
import { Icons } from '@/components/ui/icons';

interface PlanCardProps {
  plan: Plan;
  isSelected: boolean;
  onSelect: (plan: Plan) => void;
  renderPriceDisplay: (plan: Plan) => React.ReactNode;
}

const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  isSelected,
  onSelect,
  renderPriceDisplay
}) => {
  return (
    <Card 
      key={plan.id} 
      className={`
        relative overflow-hidden cursor-pointer transition-all
        ${isSelected ? 'border-primary shadow-md' : ''}
        ${plan.isBestValue ? 'border-amber-400' : ''}
      `}
      onClick={() => onSelect(plan)}
    >
      {plan.isBestValue && (
        <div className="absolute top-0 right-0">
          <div className="bg-amber-400 text-xs px-3 py-1 rounded-bl-md font-medium">
            BEST VALUE
          </div>
        </div>
      )}
      
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold">{plan.name}</h3>
            <p className="text-sm text-muted-foreground">{plan.description}</p>
          </div>
          {isSelected && (
            <Check className="h-5 w-5 text-primary" />
          )}
        </div>
        
        {renderPriceDisplay(plan)}
        
        <ul className="mt-4 space-y-2">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        
        {/* Service Offerings Section */}
        <div className="mt-6 pt-4 border-t">
          <h4 className="text-sm font-semibold mb-3">Services Included</h4>
          <ul className="space-y-2">
            {plan.serviceOfferings.map((service, i) => {
              // Get the icon component dynamically
              const IconComponent = Icons[service.icon];
              
              return (
                <li key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {IconComponent && <IconComponent className="h-4 w-4 text-primary" />}
                    <span>{service.name}</span>
                  </div>
                  {service.included ? 
                    <Check className="h-4 w-4 text-green-500" /> : 
                    <X className="h-4 w-4 text-gray-300" />
                  }
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default PlanCard;
