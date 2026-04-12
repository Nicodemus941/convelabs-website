import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Home, Building2, Heart, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookingFormValues } from '@/types/appointmentTypes';

interface VisitTypeSelectorProps {
  onNext: () => void;
}

const VISIT_TYPES = [
  {
    id: 'mobile',
    name: 'Mobile Blood Draw',
    subtitle: 'We come to you',
    price: 150,
    description: 'A licensed phlebotomist visits your home, office, or hotel. Same-day appointments available.',
    icon: Home,
    color: 'bg-red-50 border-red-200 hover:border-red-400',
    selectedColor: 'bg-red-50 border-red-500 ring-2 ring-red-500/20',
    iconColor: 'text-red-600',
    popular: true,
  },
  {
    id: 'in-office',
    name: 'Office Visit',
    subtitle: 'Visit our partner location',
    price: 55,
    description: 'Walk-in to one of our partner office locations in Central Florida. No travel fee.',
    icon: Building2,
    color: 'bg-blue-50 border-blue-200 hover:border-blue-400',
    selectedColor: 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20',
    iconColor: 'text-blue-600',
  },
  {
    id: 'senior',
    name: 'Senior Blood Draw',
    subtitle: 'Patients 65+',
    price: 100,
    description: 'Discounted mobile visit for patients 65 and older. Same premium service at a reduced rate.',
    icon: Heart,
    color: 'bg-purple-50 border-purple-200 hover:border-purple-400',
    selectedColor: 'bg-purple-50 border-purple-500 ring-2 ring-purple-500/20',
    iconColor: 'text-purple-600',
  },
];

const VisitTypeSelector: React.FC<VisitTypeSelectorProps> = ({ onNext }) => {
  const { watch, setValue } = useFormContext<BookingFormValues>();
  const selectedType = watch('serviceDetails.visitType');

  const handleSelect = (typeId: string) => {
    setValue('serviceDetails.visitType', typeId, { shouldValidate: true });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">How would you like to be seen?</h2>
        <p className="text-muted-foreground mt-2">Choose your preferred visit type</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {VISIT_TYPES.map((type) => {
          const Icon = type.icon;
          const isSelected = selectedType === type.id;

          return (
            <div
              key={type.id}
              onClick={() => handleSelect(type.id)}
              className={`relative border-2 rounded-2xl p-6 cursor-pointer transition-all duration-200 ${
                isSelected ? type.selectedColor : type.color
              }`}
            >
              {type.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}

              {isSelected && (
                <div className="absolute top-3 right-3 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}

              <div className={`h-12 w-12 rounded-xl ${isSelected ? 'bg-white' : 'bg-white/80'} flex items-center justify-center mb-4`}>
                <Icon className={`h-6 w-6 ${type.iconColor}`} />
              </div>

              <h3 className="font-bold text-lg">{type.name}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{type.subtitle}</p>

              <div className="mt-3">
                <span className="text-3xl font-bold">${type.price}</span>
                <span className="text-muted-foreground text-sm ml-1">/ visit</span>
              </div>

              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                {type.description}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center pt-2">
        <Button
          type="button"
          onClick={onNext}
          disabled={!selectedType}
          size="lg"
          className="bg-conve-red hover:bg-conve-red-dark text-white px-8 rounded-xl"
        >
          Continue
        </Button>
      </div>
    </div>
  );
};

export default VisitTypeSelector;
