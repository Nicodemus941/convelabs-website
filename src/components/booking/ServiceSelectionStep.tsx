
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Clock, CreditCard } from 'lucide-react';
import { useFormContext } from 'react-hook-form';

interface Service {
  id: string;
  name: string;
  duration: number;
  credits: number | string;
  description?: string;
}

interface ServiceSelectionStepProps {
  services: Service[];
  onNext: () => void;
  onCancel?: () => void;
}

const ServiceSelectionStep: React.FC<ServiceSelectionStepProps> = ({ 
  services,
  onNext,
  onCancel 
}) => {
  const { watch, setValue } = useFormContext();
  const selectedService = watch('serviceDetails.selectedService');
  
  // If no services are provided, use the default list
  const availableServices: Service[] = services.length > 0 ? services : [
    { id: 'routine-blood-draw', name: 'Routine Blood Draws', duration: 10, credits: 1, description: 'Standard blood collection procedure' },
    { id: 'fasting-blood-draw', name: 'Fasting Blood Draws', duration: 10, credits: 1, description: 'Requires 8-12 hours of fasting before collection' },
    { id: 'stat-blood-draw', name: 'STAT Blood Draws', duration: 10, credits: 1, description: 'Urgent blood collection with expedited processing' },
    { id: 'therapeutic-phlebotomy', name: 'Therapeutic Phlebotomy', duration: 30, credits: 1, description: 'Removal of blood for therapeutic purposes' },
    { id: 'glucose-tolerance', name: 'Glucose Tolerance Test (GTT)', duration: 120, credits: 1, description: 'Measures how well your body processes sugar' },
    { id: 'pregnancy-blood-test', name: 'Pregnancy Blood Test', duration: 10, credits: 1, description: 'Blood test to detect pregnancy hormones' },
    { id: 'urine-collection', name: 'Urine Collection', duration: 10, credits: 1, description: 'Collection of urine sample' },
    { id: 'stool-sample', name: 'Stool Sample Pickup', duration: 5, credits: 1, description: 'Collection of prepared stool sample' },
    { id: 'genetic-test', name: 'Genetic Test Kit Collection', duration: 20, credits: 1, description: 'Collection of samples for genetic testing' },
    { id: 'hormone-test', name: 'Hormone Test Kit Collection', duration: 20, credits: 1, description: 'Collection of samples for hormone testing' },
    { id: 'wellness-panel', name: 'Wellness Panel Kit Collection', duration: 20, credits: 1, description: 'Comprehensive wellness testing collection' },
    { id: 'life-insurance', name: 'Life Insurance Exam Collections', duration: 45, credits: 1, description: 'Medical exam required for life insurance' },
    { id: 'specialty-kit', name: 'Specialty Kit Processing', duration: 45, credits: 1, description: 'Processing for specialty kits like DUTCH or Genova' },
  ];
  
  const handleServiceSelect = (serviceId: string) => {
    setValue('serviceDetails.selectedService', serviceId, { shouldValidate: true });
    
    // Find the selected service to get its duration
    const selectedServiceData = availableServices.find(service => service.id === serviceId);
    if (selectedServiceData) {
      // Set the service duration in the form
      setValue('serviceDetails.duration', selectedServiceData.duration);
    }
  };

  // Format duration to display in minutes or hours and minutes
  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 
        ? `${hours} hr ${remainingMinutes} min`
        : `${hours} hr`;
    }
  };
  
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold">Select Service</h2>
            <p className="text-muted-foreground text-sm md:text-base mt-1">
              Choose the lab service you need - each service costs 1 credit
            </p>
          </div>
          
          <div className="grid grid-cols-1 gap-3 mt-6">
            {availableServices.map((service) => (
              <div 
                key={service.id}
                className={`
                  border rounded-lg p-4 transition-all cursor-pointer
                  ${selectedService === service.id 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                  }
                `}
                onClick={() => handleServiceSelect(service.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium">{service.name}</div>
                    <div className="text-sm text-muted-foreground mt-1">{service.description}</div>
                    <div className="mt-2 flex items-center text-sm">
                      <Clock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <span className="text-muted-foreground">{formatDuration(service.duration)}</span>
                      <span className="mx-2 text-muted-foreground">•</span>
                      <CreditCard className="h-3.5 w-3.5 mr-1.5 text-primary" />
                      <span className="font-medium text-primary">1 Credit</span>
                    </div>
                  </div>
                  
                  {selectedService === service.id && (
                    <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex justify-end pt-4 mt-4">
            {onCancel && (
              <Button 
                type="button" 
                variant="ghost" 
                onClick={onCancel}
                className="mr-2"
              >
                Cancel
              </Button>
            )}
            
            <Button 
              type="button" 
              onClick={onNext}
              disabled={!selectedService}
            >
              Continue
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ServiceSelectionStep;
