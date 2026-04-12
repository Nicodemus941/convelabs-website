
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Clock, ChevronDown, ChevronUp, Syringe, FlaskConical, TestTube, Baby, FileHeart, Pill } from 'lucide-react';
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

const SERVICE_ICONS: Record<string, any> = {
  'routine-blood-draw': Syringe,
  'fasting-blood-draw': Syringe,
  'stat-blood-draw': Syringe,
  'therapeutic-phlebotomy': Syringe,
  'glucose-tolerance': FlaskConical,
  'pregnancy-blood-test': Baby,
  'urine-collection': TestTube,
  'stool-sample': TestTube,
  'genetic-test': FlaskConical,
  'hormone-test': Pill,
  'wellness-panel': FileHeart,
  'life-insurance': FileHeart,
  'specialty-kit': FlaskConical,
};

const TOP_SERVICES = ['routine-blood-draw', 'fasting-blood-draw', 'stat-blood-draw', 'therapeutic-phlebotomy', 'glucose-tolerance'];

const ServiceSelectionStep: React.FC<ServiceSelectionStepProps> = ({
  services,
  onNext,
  onCancel
}) => {
  const { watch, setValue } = useFormContext();
  const selectedService = watch('serviceDetails.selectedService');
  const [showAll, setShowAll] = useState(false);

  const availableServices: Service[] = services.length > 0 ? services : [
    { id: 'routine-blood-draw', name: 'Routine Blood Draws', duration: 10, credits: 1, description: 'Standard blood collection procedure' },
    { id: 'fasting-blood-draw', name: 'Fasting Blood Draws', duration: 10, credits: 1, description: 'Requires 8-12 hours of fasting' },
    { id: 'stat-blood-draw', name: 'STAT Blood Draws', duration: 10, credits: 1, description: 'Urgent collection with expedited processing' },
    { id: 'therapeutic-phlebotomy', name: 'Therapeutic Phlebotomy', duration: 30, credits: 1, description: 'Removal of blood for therapeutic purposes' },
    { id: 'glucose-tolerance', name: 'Glucose Tolerance Test (GTT)', duration: 120, credits: 1, description: 'Measures how your body processes sugar' },
    { id: 'pregnancy-blood-test', name: 'Pregnancy Blood Test', duration: 10, credits: 1, description: 'Blood test to detect pregnancy hormones' },
    { id: 'urine-collection', name: 'Urine Collection', duration: 10, credits: 1, description: 'Collection of urine sample' },
    { id: 'stool-sample', name: 'Stool Sample Pickup', duration: 5, credits: 1, description: 'Collection of prepared stool sample' },
    { id: 'genetic-test', name: 'Genetic Test Kit Collection', duration: 20, credits: 1, description: 'Collection of samples for genetic testing' },
    { id: 'hormone-test', name: 'Hormone Test Kit Collection', duration: 20, credits: 1, description: 'Collection for hormone testing' },
    { id: 'wellness-panel', name: 'Wellness Panel Kit Collection', duration: 20, credits: 1, description: 'Comprehensive wellness testing' },
    { id: 'life-insurance', name: 'Life Insurance Exam', duration: 45, credits: 1, description: 'Medical exam for life insurance' },
    { id: 'specialty-kit', name: 'Specialty Kit Processing', duration: 45, credits: 1, description: 'DUTCH, Genova and specialty kits' },
  ];

  const topServices = availableServices.filter(s => TOP_SERVICES.includes(s.id));
  const otherServices = availableServices.filter(s => !TOP_SERVICES.includes(s.id));
  const displayedServices = showAll ? availableServices : topServices;

  const handleServiceSelect = (serviceId: string) => {
    setValue('serviceDetails.selectedService', serviceId, { shouldValidate: true });
    const svc = availableServices.find(s => s.id === serviceId);
    if (svc) setValue('serviceDetails.duration', svc.duration);
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-bold">Select Your Service</h2>
        <p className="text-muted-foreground text-sm mt-1">
          What type of lab work do you need?
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {displayedServices.map((service) => {
          const isSelected = selectedService === service.id;
          const Icon = SERVICE_ICONS[service.id] || Syringe;

          return (
            <div
              key={service.id}
              onClick={() => handleServiceSelect(service.id)}
              className={`border rounded-xl p-4 transition-all cursor-pointer flex items-center gap-4 ${
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/40 hover:bg-muted/30'
              }`}
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isSelected ? 'bg-primary/10' : 'bg-muted'
              }`}>
                <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-medium">{service.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  {formatDuration(service.duration)}
                  <span className="text-muted-foreground/40">|</span>
                  {service.description}
                </div>
              </div>

              {isSelected && (
                <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!showAll && otherServices.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 mx-auto"
        >
          <ChevronDown className="h-4 w-4" />
          Show {otherServices.length} more services
        </button>
      )}

      {showAll && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mx-auto"
        >
          <ChevronUp className="h-4 w-4" />
          Show less
        </button>
      )}

      <div className="flex justify-between pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        )}
        <Button
          type="button"
          onClick={onNext}
          disabled={!selectedService}
          className="ml-auto bg-conve-red hover:bg-conve-red-dark text-white rounded-xl"
        >
          Continue
        </Button>
      </div>
    </div>
  );
};

export default ServiceSelectionStep;
