import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Home, Building2, Heart, Check, FlaskConical, Syringe, Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookingFormValues } from '@/types/appointmentTypes';

interface VisitTypeSelectorProps {
  onNext: () => void;
}

const PROVIDER_PARTNERS = [
  { id: 'restoration-place', name: 'Restoration Place', price: 125 },
  { id: 'elite-medical-concierge', name: 'Elite Medical Concierge', price: 72.25 },
  { id: 'naturamed', name: 'NaturaMed', price: 85 },
  { id: 'aristotle-education', name: 'Aristotle Education', price: 185 },
];

const VISIT_TYPES = [
  {
    id: 'mobile',
    name: 'Mobile Blood Draw',
    subtitle: 'We come to you',
    price: 150,
    description: 'A licensed phlebotomist visits your home, office, or hotel. Lab order and insurance required.',
    icon: Home,
    color: 'bg-red-50 border-red-200 hover:border-red-400',
    selectedColor: 'bg-red-50 border-red-500 ring-2 ring-red-500/20',
    iconColor: 'text-red-600',
    popular: true,
  },
  {
    id: 'in-office',
    name: 'Office Visit',
    subtitle: 'Standard blood draw',
    price: 55,
    description: 'Walk-in to our partner office. We draw your labs — no shipping or delivery needed.',
    icon: Building2,
    color: 'bg-blue-50 border-blue-200 hover:border-blue-400',
    selectedColor: 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20',
    iconColor: 'text-blue-600',
  },
  {
    id: 'specialty-kit',
    name: 'Specialty Collection Kit',
    subtitle: 'DUTCH, Genova, etc.',
    price: 185,
    description: 'For specialty kits that require shipping via UPS or FedEx.',
    icon: FlaskConical,
    color: 'bg-amber-50 border-amber-200 hover:border-amber-400',
    selectedColor: 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20',
    iconColor: 'text-amber-600',
  },
  {
    id: 'senior',
    name: 'Senior Blood Draw',
    subtitle: 'Patients 65+',
    price: 100,
    description: 'Discounted mobile visit for patients 65 and older. Lab order and insurance required.',
    icon: Heart,
    color: 'bg-purple-50 border-purple-200 hover:border-purple-400',
    selectedColor: 'bg-purple-50 border-purple-500 ring-2 ring-purple-500/20',
    iconColor: 'text-purple-600',
  },
  {
    id: 'therapeutic',
    name: 'Therapeutic Phlebotomy',
    subtitle: "Doctor's order required",
    price: 200,
    description: "Blood removal per doctor's order specifying volume. 1hr 15min appointment.",
    icon: Syringe,
    color: 'bg-teal-50 border-teal-200 hover:border-teal-400',
    selectedColor: 'bg-teal-50 border-teal-500 ring-2 ring-teal-500/20',
    iconColor: 'text-teal-600',
  },
  {
    id: 'provider-partner',
    name: 'Provider Partners',
    subtitle: 'Select your provider',
    price: null, // Dynamic based on partner
    description: 'Booking through one of our partner practices? Select your provider for special pricing.',
    icon: Handshake,
    color: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400',
    selectedColor: 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20',
    iconColor: 'text-emerald-600',
  },
];

const VisitTypeSelector: React.FC<VisitTypeSelectorProps> = ({ onNext }) => {
  const { watch, setValue } = useFormContext<BookingFormValues>();
  const selectedType = watch('serviceDetails.visitType');
  const [selectedPartner, setSelectedPartner] = useState('');
  const [showPartnerSelect, setShowPartnerSelect] = useState(false);

  const handleSelect = (typeId: string) => {
    if (typeId === 'provider-partner') {
      // Show partner dropdown instead of auto-advancing
      setShowPartnerSelect(true);
      setValue('serviceDetails.visitType', typeId, { shouldValidate: true });
      return;
    }

    setValue('serviceDetails.visitType', typeId, { shouldValidate: true });
    // Auto-advance after a brief visual feedback
    setTimeout(() => onNext(), 300);
  };

  const handlePartnerSelect = (partnerId: string) => {
    setSelectedPartner(partnerId);
    const partner = PROVIDER_PARTNERS.find(p => p.id === partnerId);
    if (partner) {
      setValue('serviceDetails.visitType', `partner-${partnerId}`, { shouldValidate: true });
      // Auto-advance
      setTimeout(() => onNext(), 300);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">How would you like to be seen?</h2>
        <p className="text-muted-foreground mt-2">Choose your preferred visit type</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {VISIT_TYPES.map((type) => {
          const Icon = type.icon;
          const isSelected = selectedType === type.id || (type.id === 'provider-partner' && selectedType?.startsWith('partner-'));

          return (
            <div
              key={type.id}
              onClick={() => handleSelect(type.id)}
              className={`relative border-2 rounded-2xl p-5 cursor-pointer transition-all duration-200 ${
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

              <div className="h-11 w-11 rounded-xl bg-white/80 flex items-center justify-center mb-3">
                <Icon className={`h-5 w-5 ${type.iconColor}`} />
              </div>

              <h3 className="font-bold text-base">{type.name}</h3>
              <p className="text-xs text-muted-foreground">{type.subtitle}</p>

              <div className="mt-2">
                {type.price !== null ? (
                  <>
                    <span className="text-2xl font-bold">${type.price}</span>
                    <span className="text-muted-foreground text-xs ml-1">/ visit</span>
                  </>
                ) : (
                  <span className="text-lg font-bold text-emerald-700">From $72.25</span>
                )}
              </div>

              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {type.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Provider Partner dropdown */}
      {showPartnerSelect && (
        <div className="max-w-md mx-auto space-y-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <label className="text-sm font-medium">Select your provider</label>
          <Select value={selectedPartner} onValueChange={handlePartnerSelect}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Choose provider..." />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_PARTNERS.map((partner) => (
                <SelectItem key={partner.id} value={partner.id}>
                  {partner.name} — ${partner.price}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};

export default VisitTypeSelector;
