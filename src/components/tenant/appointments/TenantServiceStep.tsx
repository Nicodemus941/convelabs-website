
import React from 'react';
import { Tenant } from '@/types/tenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';

interface TenantServiceStepProps {
  tenant: Tenant;
  onNext: () => void;
  form?: UseFormReturn<any>;
}

const TenantServiceStep: React.FC<TenantServiceStepProps> = ({ tenant, onNext, form }) => {
  const [selectedService, setSelectedService] = React.useState<string | null>(null);
  
  const services = [
    {
      id: 'service-1',
      name: 'Basic Check-up',
      description: 'A standard health check-up examination',
      price: 99,
      duration: 30,
    },
    {
      id: 'service-2',
      name: 'Comprehensive Evaluation',
      description: 'A thorough health assessment with detailed analysis',
      price: 199,
      duration: 60,
    },
    {
      id: 'service-3',
      name: 'Specialized Consultation',
      description: 'Expert consultation for specific health concerns',
      price: 149,
      duration: 45,
    },
  ];
  
  const handleServiceSelect = (serviceId: string) => {
    setSelectedService(serviceId);
    // If form is provided, update the form values
    if (form) {
      form.setValue('serviceDetails.selectedService', serviceId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        {services.map((service) => (
          <Card
            key={service.id}
            className={`cursor-pointer transition-all border-2 ${
              selectedService === service.id
                ? 'border-primary'
                : 'border-transparent hover:border-gray-200'
            }`}
            onClick={() => handleServiceSelect(service.id)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-lg">{service.name}</h3>
                <p className="text-muted-foreground text-sm">{service.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-medium">${service.price}</span>
                  <span className="text-sm text-muted-foreground">({service.duration} min)</span>
                </div>
              </div>
              
              {selectedService === service.id && (
                <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="flex justify-end pt-4">
        <Button 
          onClick={onNext} 
          disabled={!selectedService}
        >
          Continue
        </Button>
      </div>
    </div>
  );
};

export default TenantServiceStep;
