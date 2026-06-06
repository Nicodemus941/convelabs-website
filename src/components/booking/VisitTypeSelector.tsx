import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Home, Building2, Heart, Check, FlaskConical, Syringe, Handshake } from 'lucide-react';
import { BookingFormValues } from '@/types/appointmentTypes';
import { useServiceCatalog } from '@/hooks/useServiceCatalog';

interface VisitTypeSelectorProps {
  onNext: () => void;
}

// Provider partners shown to patients on the public booking flow.
// Each entry can opt out of the public list via `hidden: true` — used
// for orgs that ONLY book through their own portal or via admin manual
// scheduling (e.g. Aristotle Education books all their patients through
// their own dashboard). Sorted alphabetically by name so the list stays
// scannable as we add partners.
const PROVIDER_PARTNERS_ALL = [
  { id: 'restoration-place',         name: 'Restoration Place',         price: 125 },
  { id: 'elite-medical-concierge',   name: 'Elite Medical Concierge',   price: 72.25 },
  { id: 'naturamed',                 name: 'NaturaMed',                 price: 85 },
  { id: 'nd-wellness',               name: 'ND Wellness',               price: 85 },
  { id: 'aristotle-education',       name: 'Aristotle Education',       price: 185, hidden: true },
];

const PROVIDER_PARTNERS = PROVIDER_PARTNERS_ALL
  .filter(p => !p.hidden)
  .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

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
  },
  {
    id: 'provider-partner',
    name: 'Is your doctor one of these?',
    subtitle: 'Discounted rate — partnered practices',
    price: null,
    description: 'Elite Medical Concierge, NaturaMed, ND Wellness, Restoration Place. Tap to pick yours.',
    icon: Handshake,
    gradient: 'from-emerald-500/10 to-emerald-600/5',
    borderColor: 'border-emerald-200 hover:border-emerald-400',
    selectedBorder: 'border-emerald-500 ring-2 ring-emerald-500/20',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600',
    priceColor: 'text-emerald-700',
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

  // Pull admin-created services from services_enhanced and surface them as
  // additional visit-type cards alongside the legacy hardcoded options.
  // Falls back gracefully when the RPC isn't reachable (legacy still works).
  const { services: dynamicServices } = useServiceCatalog();

  // Build a price lookup from services_enhanced. Admin price edits land
  // here and need to flow to the front-end cards immediately.
  const dynamicPriceByCode = new Map<string, number>();
  for (const d of dynamicServices) {
    const noneCents = typeof d.tier_pricing?.none === 'number' ? d.tier_pricing.none : 0;
    if (noneCents > 0) {
      dynamicPriceByCode.set(d.service_code, Math.round(noneCents / 100));
    }
  }

  // The $1 "Development Testing" card is an internal test tool — hide it from
  // real patients. Still reachable for the owner via ?dev=1 (or a Vite dev build).
  const devMode = (typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('dev') === '1')
    || (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true);

  // Override hardcoded VISIT_TYPES prices with live DB prices when present.
  const VISIT_TYPES_SYNCED = VISIT_TYPES
    .filter(v => v.id !== 'dev-testing' || devMode)
    .map(v => {
      const dbPrice = dynamicPriceByCode.get(v.id);
      return dbPrice && dbPrice > 0 ? { ...v, price: dbPrice } : v;
    });

  // Procedure-level service_types are NOT standalone visit types — they're
  // sub-procedures of a mobile/office draw. Surfacing them here as priced
  // cards caused patients who wanted a $55 Office Visit to instead pick a
  // $150 "Routine/Fasting Blood Draw" card. They belong in the procedure
  // step, not the "how do you want to be seen?" grid.
  const PROCEDURE_SERVICE_TYPES = new Set(['routine', 'fasting', 'stat']);

  const dynamicCards = dynamicServices
    // Drop entries whose service_code collides with a hardcoded id — legacy
    // card wins for layout/iconography; price already merged above.
    .filter(d => !VISIT_TYPES.some(v => v.id === d.service_code))
    // Only TRUE visit types belong in this grid. Exclude:
    //  • QA / dev test services (qa-*) — accidental public leak
    //  • procedure rows (routine/fasting/stat) — see note above
    //  • lone specimen-collection rows (a procedure, not a visit type)
    //  • partner rows — shown via the dedicated "Is your doctor one of these?" picker
    // Genuine admin-added visit types and intentional packages still appear.
    .filter(d =>
      !d.service_code.startsWith('qa-') &&
      d.service_code !== 'dev-testing' &&
      !d.service_code.startsWith('specimen-collection') &&
      d.category !== 'partner' &&
      !PROCEDURE_SERVICE_TYPES.has(d.service_type || '')
    )
    .map(d => {
      // For packages: build a short "2× Wellness · 1× Lipid" preview line.
      // For non-packages: fall back to the description.
      let subtitleLine = d.description ? d.description.substring(0, 60) : 'Custom service';
      if (d.is_package && d.package_items && d.package_items.length > 0) {
        subtitleLine = d.package_items
          .map(p => `${p.quantity > 1 ? `${p.quantity}× ` : ''}${p.child_service_name.replace(/^QA\s+/, '').replace(/\s+Add-on$/i, '')}`)
          .join(' + ')
          .substring(0, 80);
      }
      return {
        id: d.service_code,
        name: d.name,
        subtitle: subtitleLine,
        price: typeof d.tier_pricing?.none === 'number' ? Math.round(d.tier_pricing.none / 100) : null,
        description: d.description || '',
        icon: d.is_package ? Handshake : FlaskConical,
        gradient: d.is_package ? 'from-purple-500/10 to-purple-600/5' : 'from-slate-500/10 to-slate-600/5',
        borderColor: d.is_package ? 'border-purple-200 hover:border-purple-400' : 'border-slate-200 hover:border-slate-400',
        selectedBorder: d.is_package ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-500 ring-2 ring-slate-500/20',
        iconBg: d.is_package ? 'bg-purple-500/10' : 'bg-slate-500/10',
        iconColor: d.is_package ? 'text-purple-600' : 'text-slate-600',
        priceColor: d.is_package ? 'text-purple-700' : 'text-slate-700',
      };
    });

  const VISIT_TYPES_WITH_DYNAMIC = [...VISIT_TYPES_SYNCED, ...dynamicCards];

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {VISIT_TYPES_WITH_DYNAMIC.map((type) => {
          const Icon = type.icon;
          const isSelected = selectedType === type.id || (type.id === 'provider-partner' && selectedType?.startsWith('partner-'));
          const isPartnerCardExpanded = type.id === 'provider-partner' && (isSelected || showPartnerSelect);

          return (
            <div
              key={type.id}
              onClick={() => handleSelect(type.id)}
              className={`relative border-2 rounded-2xl p-5 cursor-pointer transition-all duration-300 backdrop-blur-sm ${
                type.id === 'provider-partner' && isPartnerCardExpanded ? 'sm:col-span-2 lg:col-span-3' : ''
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
                    {PROVIDER_PARTNERS.map((partnerRaw) => {
                      const dbPrice = dynamicPriceByCode.get(`partner-${partnerRaw.id}`);
                      const partner = dbPrice && dbPrice > 0 ? { ...partnerRaw, price: dbPrice } : partnerRaw;
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
    </div>
  );
};

export default VisitTypeSelector;
