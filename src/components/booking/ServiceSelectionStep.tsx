
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Clock, ChevronDown, ChevronUp, Syringe, FlaskConical, TestTube, Baby, FileHeart, Pill, Zap, Moon } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { BookingFormValues } from '@/types/appointmentTypes';

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
  'fasting-blood-draw': Moon,
  'stat-blood-draw': Zap,
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

const SERVICE_COLORS: Record<string, { bg: string; border: string; selectedBg: string; selectedBorder: string; iconColor: string }> = {
  'routine-blood-draw': { bg: 'bg-blue-50', border: 'border-blue-200', selectedBg: 'bg-blue-50', selectedBorder: 'border-blue-500 ring-2 ring-blue-500/20', iconColor: 'text-blue-600' },
  'fasting-blood-draw': { bg: 'bg-indigo-50', border: 'border-indigo-200', selectedBg: 'bg-indigo-50', selectedBorder: 'border-indigo-500 ring-2 ring-indigo-500/20', iconColor: 'text-indigo-600' },
  'stat-blood-draw': { bg: 'bg-red-50', border: 'border-red-200', selectedBg: 'bg-red-50', selectedBorder: 'border-red-500 ring-2 ring-red-500/20', iconColor: 'text-red-600' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-50', border: 'border-gray-200', selectedBg: 'bg-primary/5', selectedBorder: 'border-primary ring-2 ring-primary/20', iconColor: 'text-muted-foreground' };

// Services shown for Mobile and Senior visit types
const MOBILE_SENIOR_SERVICES = ['routine-blood-draw', 'fasting-blood-draw', 'stat-blood-draw'];

// All services for other visit types
const ALL_SERVICES: Service[] = [
  { id: 'routine-blood-draw', name: 'Routine Blood Draw', duration: 60, credits: 1, description: 'Standard blood collection. Available 9 AM - 1:30 PM.' },
  { id: 'fasting-blood-draw', name: 'Fasting Blood Draw', duration: 60, credits: 1, description: 'Requires 8-12 hours of fasting. Available any time.' },
  { id: 'stat-blood-draw', name: 'STAT / Same-Day', duration: 60, credits: 1, description: 'Next available slot. +$100 surcharge.' },
  { id: 'therapeutic-phlebotomy', name: 'Therapeutic Phlebotomy', duration: 75, credits: 1, description: 'Blood removal per doctor order. 1hr 15min.' },
  { id: 'glucose-tolerance', name: 'Glucose Tolerance Test (GTT)', duration: 120, credits: 1, description: 'Measures how your body processes sugar.' },
  { id: 'pregnancy-blood-test', name: 'Pregnancy Blood Test', duration: 60, credits: 1, description: 'Blood test to detect pregnancy hormones.' },
  { id: 'urine-collection', name: 'Urine Collection', duration: 60, credits: 1, description: 'Collection of urine sample.' },
  { id: 'stool-sample', name: 'Stool Sample Pickup', duration: 60, credits: 1, description: 'Collection of prepared stool sample.' },
  { id: 'genetic-test', name: 'Genetic Test Kit', duration: 60, credits: 1, description: 'Collection of samples for genetic testing.' },
  { id: 'hormone-test', name: 'Hormone Test Kit', duration: 60, credits: 1, description: 'Collection for hormone testing.' },
  { id: 'wellness-panel', name: 'Wellness Panel Kit', duration: 60, credits: 1, description: 'Comprehensive wellness testing.' },
  { id: 'life-insurance', name: 'Life Insurance Exam', duration: 60, credits: 1, description: 'Medical exam for life insurance.' },
  { id: 'specialty-kit', name: 'Specialty Kit Processing', duration: 75, credits: 1, description: 'DUTCH, Genova and specialty kits.' },
];

const ServiceSelectionStep: React.FC<ServiceSelectionStepProps> = ({
  services,
  onNext,
  onCancel
}) => {
  const { watch, setValue } = useFormContext<BookingFormValues>();
  const selectedService = watch('serviceDetails.selectedService');
  const visitType = watch('serviceDetails.visitType') || '';
  const [showAll, setShowAll] = useState(false);

  // Filter services based on visit type
  const isMobileOrSenior = ['mobile', 'senior'].includes(visitType);
  // Always use fallback ALL_SERVICES for consistent IDs in the booking flow
  const baseServices = ALL_SERVICES;

  let displayedServices: Service[];
  if (isMobileOrSenior) {
    displayedServices = baseServices.filter(s => MOBILE_SENIOR_SERVICES.includes(s.id));
  } else {
    const topIds = ['routine-blood-draw', 'fasting-blood-draw', 'stat-blood-draw', 'therapeutic-phlebotomy', 'glucose-tolerance'];
    const topServices = baseServices.filter(s => topIds.includes(s.id));
    const otherServices = baseServices.filter(s => !topIds.includes(s.id));
    displayedServices = showAll ? baseServices : topServices;
  }

  const handleServiceSelect = (serviceId: string) => {
    setValue('serviceDetails.selectedService', serviceId, { shouldValidate: true });
    const svc = baseServices.find(s => s.id === serviceId);
    if (svc) setValue('serviceDetails.duration', svc.duration);
    // Auto-set sameDay for STAT
    if (serviceId === 'stat-blood-draw') {
      setValue('serviceDetails.sameDay', true);
    } else {
      setValue('serviceDetails.sameDay', false);
    }
    // Auto-advance after selection
    setTimeout(() => onNext(), 300);
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  };

  const hasMore = !isMobileOrSenior && !showAll && baseServices.length > 5;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-bold">Select Your Service</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {isMobileOrSenior
            ? 'What type of blood draw do you need?'
            : 'What type of lab work do you need?'}
        </p>
      </div>

      {/* Card grid for Mobile/Senior (3 cards) or list for others */}
      {isMobileOrSenior ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {displayedServices.map((service) => {
            const isSelected = selectedService === service.id;
            const Icon = SERVICE_ICONS[service.id] || Syringe;
            const colors = SERVICE_COLORS[service.id] || DEFAULT_COLOR;

            return (
              <div
                key={service.id}
                onClick={() => handleServiceSelect(service.id)}
                className={`relative border-2 rounded-2xl p-5 cursor-pointer transition-all duration-200 text-center ${
                  isSelected ? `${colors.selectedBg} ${colors.selectedBorder}` : `${colors.bg} ${colors.border} hover:border-primary/40`
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                )}

                <div className={`h-12 w-12 rounded-xl bg-white/80 flex items-center justify-center mx-auto mb-3`}>
                  <Icon className={`h-6 w-6 ${colors.iconColor}`} />
                </div>

                <h3 className="font-bold text-base">{service.name}</h3>

                <div className="flex items-center justify-center gap-1 mt-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDuration(service.duration)}
                </div>

                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  {service.description}
                </p>

                {service.id === 'stat-blood-draw' && (
                  <div className="mt-2 text-xs font-medium text-red-600">+$100 surcharge</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* List view for other visit types */
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
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 mx-auto"
        >
          <ChevronDown className="h-4 w-4" />
          Show more services
        </button>
      )}

      {!isMobileOrSenior && showAll && (
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
          <Button type="button" variant="ghost" onClick={onCancel}>Back</Button>
        )}
        {!isMobileOrSenior && (
          <Button
            type="button"
            onClick={onNext}
            disabled={!selectedService}
            className="ml-auto bg-conve-red hover:bg-conve-red-dark text-white rounded-xl"
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
};

export default ServiceSelectionStep;
