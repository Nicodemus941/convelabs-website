import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ArrowRight, CheckCircle, Star } from 'lucide-react';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';

interface PreQualificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface ServiceOption {
  id: string;
  name: string;
  price: string;
  tag?: string;
  description: string;
  benefits?: string[];
  highlighted?: boolean;
}

const serviceOptions: ServiceOption[] = [
  {
    id: 'single',
    name: 'Single Visit (Non-Member)',
    price: '$150',
    tag: 'No Commitment',
    description: 'One-time blood draw, Mon-Fri 8:30 AM - 1:30 PM'
  },
  {
    id: 'proactive',
    name: 'Proactive Health Membership',
    price: '$149/mo',
    tag: 'MOST POPULAR',
    description: '12 visits/year with priority scheduling',
    highlighted: true,
    benefits: [
      '$125 effective per visit (save $25/visit)',
      'Same-day scheduling available',
      'Health insights dashboard',
      'Credit rollover up to 3 months'
    ]
  },
  {
    id: 'concierge',
    name: 'Concierge Elite',
    price: '$299/mo',
    tag: 'VIP',
    description: 'Unlimited visits with dedicated phlebotomist'
  }
];

export const PreQualificationModal: React.FC<PreQualificationModalProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const [step, setStep] = useState<'service' | 'location'>('service');
  const [selectedService, setSelectedService] = useState<string>('');
  const [location, setLocation] = useState('');
  
  const { setServiceSelection, setLocationPreference, trackServiceInterest } = useConversionOptimization();
  
  const handleServiceSelect = (serviceId: string) => {
    setSelectedService(serviceId);
    setServiceSelection(serviceId);
    trackServiceInterest(serviceId);
    setStep('location');
  };
  
  const handleLocationSubmit = () => {
    if (location.trim()) {
      setLocationPreference(location);
      onComplete();
    }
  };
  
  const selectedServiceData = serviceOptions.find(s => s.id === selectedService);
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            {step === 'service' ? "Let's Find Your Perfect Service" : 'Great Choice!'}
          </DialogTitle>
        </DialogHeader>
        
        {step === 'service' && (
          <div className="space-y-6">
            <p className="text-center text-muted-foreground">
              Which service best fits your health and wellness goals?
            </p>
            
            <div className="grid gap-4 md:grid-cols-3">
              {serviceOptions.map((service) => (
                <Card
                  key={service.id}
                  className={`p-6 cursor-pointer transition-all hover:shadow-lg border-2 ${
                    service.highlighted 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => handleServiceSelect(service.id)}
                >
                  {service.tag && (
                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3 ${
                      service.highlighted 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-secondary text-secondary-foreground'
                    }`}>
                      {service.tag}
                    </div>
                  )}
                  
                  <h3 className="font-bold text-lg mb-2">{service.name}</h3>
                  <p className="text-2xl font-bold text-primary mb-2">{service.price}</p>
                  <p className="text-muted-foreground mb-4">{service.description}</p>
                  
                  {service.benefits && (
                    <ul className="space-y-1">
                      {service.benefits.map((benefit, index) => (
                        <li key={index} className="flex items-center text-sm">
                          <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
            
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex items-center justify-center space-x-4 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <Star className="h-4 w-4 text-yellow-500 mr-1" />
                  <span>5-star rated service</span>
                </div>
                <div>🕐 Same-day appointments</div>
                <div>Specimen delivery confirmation sent to you</div>
              </div>
            </div>
          </div>
        )}
        
        {step === 'location' && selectedServiceData && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="bg-green-100 text-green-800 inline-block px-4 py-2 rounded-full mb-4">
                ✓ {selectedServiceData.name} Selected
              </div>
              <h3 className="text-xl font-semibold mb-2">Where would you like us to come to you?</h3>
              <p className="text-muted-foreground">
                We provide mobile services throughout Central Florida
              </p>
            </div>
            
            <div className="max-w-md mx-auto space-y-4">
              <Input
                type="text"
                placeholder="ZIP code, neighborhood, or address"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="text-center"
                autoFocus
              />
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <button
                  onClick={() => setLocation('Winter Park')}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                >
                  Winter Park
                </button>
                <button
                  onClick={() => setLocation('Windermere')}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                >
                  Windermere
                </button>
                <button
                  onClick={() => setLocation('Dr. Phillips')}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                >
                  Dr. Phillips
                </button>
                <button
                  onClick={() => setLocation('Lake Nona')}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                >
                  Lake Nona
                </button>
              </div>
              
              <Button
                onClick={handleLocationSubmit}
                disabled={!location.trim()}
                className="w-full"
                size="lg"
              >
                Check Availability <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              
              <div className="text-center text-sm text-muted-foreground">
                <p>🚗 Free travel within service area for members</p>
                <p>⏰ Members: Mon-Sun, 6 AM - 1:30 PM</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
