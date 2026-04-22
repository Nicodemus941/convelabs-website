import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Home, Building2, Heart, Check, FlaskConical, Syringe, Handshake, ChevronDown, ChevronUp } from 'lucide-react';
import { BookingFormValues } from '@/types/appointmentTypes';

interface VisitTypeSelectorProps {
  onNext: () => void;
}

const PROVIDER_PARTNERS = [
  { id: 'restoration-place', name: 'Restoration Place', price: 125 },
  { id: 'elite-medical-concierge', name: 'Elite Medical Concierge', price: 72.25 },
  { id: 'naturamed', name: 'NaturaMed', price: 85 },
  { id: 'nd-wellness', name: 'ND Wellness', price: 85 },
  { id: 'aristotle-education', name: 'Aristotle Education', price: 185 },
];

const VISIT_TYPES = [
  {
    id: 'dev-testing',
    name: 'Development Testing',
    subtitle: 'For testing only',
    price: 1,
    description: 'Development and QA testing service. Do not use for real appointments.',
    icon: FlaskConical,
    gradient: 'from-gray-500/10 to-gray-600/5',
    borderColor: 'border-gray-200 hover:border-gray-400',
    selectedBorder: 'border-gray-500 ring-2 ring-gray-500/20',
    iconBg: 'bg-gray-500/10',
    iconColor: 'text-gray-600',
    priceColor: 'text-gray-700',
    hidden: true, // QA-only — never shown to public
  },
  {
    id: 'mobile',
    name: 'Mobile Blood Draw',
    subtitle: 'We come to you',
    price: 150,
    description: 'A licensed phlebotomist visits your home, office, or hotel. Lab order and insurance required.',
    icon: Home,
    gradient: 'from-[#B91C1C]/10 to-[#991B1B]/5',
    borderColor: 'border-[#B91C1C]/20 hover:border-[#B91C1C]/50',
    selectedBorder: 'border-[#B91C1C] ring-2 ring-[#B91C1C]/20',
    iconBg: 'bg-[#B91C1C]/10',
    iconColor: 'text-[#B91C1C]',
    priceColor: 'text-[#B91C1C]',
    popular: true,
    primary: true,
  },
  {
    id: 'provider-partner',
    name: 'Is your doctor one of these?',
    subtitle: 'Discounted rate — partnered practices',
    price: null,
    description: 'Restoration Place, Elite Medical Concierge, NaturaMed, ND Wellness, Aristotle Education. Tap to pick yours.',
    icon: Handshake,
    gradient: 'from-emerald-500/10 to-emerald-600/5',
    borderColor: 'border-emerald-200 hover:border-emerald-400',
    selectedBorder: 'border-emerald-500 ring-2 ring-emerald-500/20',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600',
    priceColor: 'text-emerald-700',
    primary: true,
  },
  {
    id: 'specialty-kit',
    name: 'Specialty Collection Kit',
    subtitle: 'DUTCH, Genova, etc.',
    price: 185,
    description: 'For specialty kits that require shipping via UPS or FedEx.',
    icon: FlaskConical,
    gradient: 'from-amber-500/10 to-amber-600/5',
    borderColor: 'border-amber-200 hover:border-amber-400',
    selectedBorder: 'border-amber-500 ring-2 ring-amber-500/20',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600',
    priceColor: 'text-amber-700',
  },
  {
    id: 'in-office',
    name: 'Office Visit',
    subtitle: 'Standard blood draw',
    price: 55,
    description: 'Walk-in to our partner office. We draw your labs — no shipping or delivery needed.',
    icon: Building2,
    gradient: 'from-blue-500/10 to-blue-600/5',
    borderColor: 'border-blue-200 hover:border-blue-400',
    selectedBorder: 'border-blue-500 ring-2 ring-blue-500/20',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600',
    priceColor: 'text-blue-700',
  },
  {
    id: 'senior',
    name: 'Senior Blood Draw',
    subtitle: 'Patients 65+',
    price: 100,
    description: 'Discounted mobile visit for patients 65 and older. Lab order and insurance required.',
    icon: Heart,
    gradient: 'from-purple-500/10 to-purple-600/5',
    borderColor: 'border-purple-200 hover:border-purple-400',
    selectedBorder: 'border-purple-500 ring-2 ring-purple-500/20',
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-600',
    priceColor: 'text-purple-700',
  },
  {
    id: 'therapeutic',
    name: 'Therapeutic Phlebotomy',
    subtitle: "Doctor's order required",
    price: 200,
    description: "Blood removal per doctor's order specifying volume. 1hr 15min appointment.",
    icon: Syringe,
    gradient: 'from-teal-500/10 to-teal-600/5',
    borderColor: 'border-teal-200 hover:border-teal-400',
    selectedBorder: 'border-teal-500 ring-2 ring-teal-500/20',
    iconBg: 'bg-teal-500/10',
    iconColor: 'text-teal-600',
    priceColor: 'text-teal-700',
  },
];

const VisitTypeSelector: React.FC<VisitTypeSelectorProps> = ({ onNext }) => {
  const { watch, setValue } = useFormContext<BookingFormValues>();
  const selectedType = watch('serviceDetails.visitType');
  const [selectedPartner, setSelectedPartner] = useState('');
  const [showPartnerSelect, setShowPartnerSelect] = useState(false);
  const [showOtherServices, setShowOtherServices] = useState(false);

  // If user lands with a secondary type already selected (e.g. resuming a flow), auto-expand
  const secondaryIds = ['specialty-kit', 'in-office', 'senior', 'therapeutic'];
  const hasSecondarySelected = selectedType && secondaryIds.includes(selectedType);
  const expandSecondary = showOtherServices || hasSecondarySelected;

  const handleSelect = (typeId: string) => {
    if (typeId === 'provider-partner') {
      setShowPartnerSelect(true);
      setValue('serviceDetails.visitType', typeId, { shouldValidate: true });
      return;
    }

    setValue('serviceDetails.visitType', typeId, { shouldValidate: true });
    setTimeout(() => onNext(), 300);
  };

  const handlePartnerSelect = (partnerId: string) => {
    setSelectedPartner(partnerId);
    const partner = PROVIDER_PARTNERS.find(p => p.id === partnerId);
    if (partner) {
      setValue('serviceDetails.visitType', `partner-${partnerId}`, { shouldValidate: true });
      setTimeout(() => onNext(), 300);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">How would you like to be seen?</h2>
        <p className="text-muted-foreground mt-2">Choose your preferred visit type</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {VISIT_TYPES.filter((t) => (t as any).primary && !(t as any).hidden).map((type) => {
          const Icon = type.icon;
          const isSelected = selectedType === type.id || (type.id === 'provider-partner' && selectedType?.startsWith('partner-'));
          const isPartnerCardExpanded = type.id === 'provider-partner' && (isSelected || showPartnerSelect);

          return (
            <div
              key={type.id}
              onClick={() => handleSelect(type.id)}
              className={`relative border-2 rounded-2xl p-5 cursor-pointer transition-all duration-300 backdrop-blur-sm ${
                type.id === 'provider-partner' && isPartnerCardExpanded ? 'sm:col-span-2' : ''
              } ${
                isSelected
                  ? `bg-gradient-to-br ${type.gradient} ${type.selectedBorder} shadow-lg`
                  : `bg-white/70 ${type.borderColor} hover:shadow-md`
              }`}
              style={{
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              {type.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#B91C1C] to-[#991B1B] text-white text-xs font-semibold px-4 py-1 rounded-full shadow-md">
                  Most Popular
                </div>
              )}

              {isSelected && (
                <div className="absolute top-3 right-3 h-7 w-7 rounded-full bg-gradient-to-br from-[#B91C1C] to-[#991B1B] flex items-center justify-center shadow-md">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}

              <div className={`h-12 w-12 rounded-xl ${type.iconBg} flex items-center justify-center mb-3 backdrop-blur-sm`}>
                <Icon className={`h-6 w-6 ${type.iconColor}`} />
              </div>

              <h3 className="font-bold text-base text-gray-900">{type.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{type.subtitle}</p>

              <div className="mt-3">
                {type.price !== null ? (
                  <>
                    <span className={`text-2xl font-bold ${type.priceColor}`}>${type.price}</span>
                    <span className="text-muted-foreground text-xs ml-1">/ visit</span>
                  </>
                ) : (
                  <span className="text-lg font-bold text-emerald-700">From $72.25</span>
                )}
              </div>

              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {type.description}
              </p>

              {/* INLINE partner picker — expands INSIDE the selected card (no scrolling on mobile) */}
              {isPartnerCardExpanded && (
                <div
                  className="mt-4 pt-4 border-t-2 border-emerald-200 space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <label className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                    <Check className="h-4 w-4" /> Which practice is yours?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PROVIDER_PARTNERS.map((partner) => {
                      const isPicked = selectedPartner === partner.id || selectedType === `partner-${partner.id}`;
                      return (
                        <button
                          key={partner.id}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handlePartnerSelect(partner.id); }}
                          className={`text-left p-3 rounded-lg border-2 transition-all active:scale-[0.98] ${
                            isPicked
                              ? 'border-emerald-500 bg-white shadow-md'
                              : 'border-emerald-200 bg-white/80 hover:border-emerald-400 hover:bg-white'
                          }`}
                        >
                          <div className="font-semibold text-sm text-gray-900">{partner.name}</div>
                          <div className="text-emerald-700 font-bold text-base mt-0.5">${partner.price}<span className="text-xs text-gray-500 font-normal"> / visit</span></div>
                          {isPicked && (
                            <div className="inline-flex items-center gap-1 text-[10px] text-emerald-700 mt-1 font-semibold"><Check className="h-3 w-3" /> Selected</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-emerald-800 bg-emerald-50 rounded-lg p-2">
                    <strong>Not sure?</strong> If your doctor's office isn't listed, tap outside and pick <strong>Mobile Blood Draw</strong> instead.
                  </p>
                </div>
              )}

              {/* Subtle glass shine effect — hidden when expanded to not overlap content */}
              {!isPartnerCardExpanded && (
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>

      {/* Secondary services — collapsed by default so the primary choice isn't drowned out */}
      <div className="border-t pt-4">
        <button
          type="button"
          onClick={() => setShowOtherServices((v) => !v)}
          className="w-full flex items-center justify-between text-left px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {expandSecondary ? 'Hide other services' : 'See other services'}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Senior 65+, Specialty Kits (DUTCH/Genova), Office Visit, Therapeutic Phlebotomy
            </div>
          </div>
          {expandSecondary ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
        </button>

        {expandSecondary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {VISIT_TYPES.filter((t) => !(t as any).primary && !(t as any).hidden).map((type) => {
              const Icon = type.icon;
              const isSelected = selectedType === type.id;
              return (
                <div
                  key={type.id}
                  onClick={() => handleSelect(type.id)}
                  className={`relative border-2 rounded-2xl p-5 cursor-pointer transition-all duration-300 backdrop-blur-sm ${
                    isSelected
                      ? `bg-gradient-to-br ${type.gradient} ${type.selectedBorder} shadow-lg`
                      : `bg-white/70 ${type.borderColor} hover:shadow-md`
                  }`}
                  style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 h-7 w-7 rounded-full bg-gradient-to-br from-[#B91C1C] to-[#991B1B] flex items-center justify-center shadow-md">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div className={`h-12 w-12 rounded-xl ${type.iconBg} flex items-center justify-center mb-3 backdrop-blur-sm`}>
                    <Icon className={`h-6 w-6 ${type.iconColor}`} />
                  </div>
                  <h3 className="font-bold text-base text-gray-900">{type.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{type.subtitle}</p>
                  <div className="mt-3">
                    <span className={`text-2xl font-bold ${type.priceColor}`}>${type.price}</span>
                    <span className="text-muted-foreground text-xs ml-1">/ visit</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{type.description}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default VisitTypeSelector;
