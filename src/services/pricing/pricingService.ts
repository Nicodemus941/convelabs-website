export interface ServiceOption {
  id: string;
  name: string;
  description: string;
  basePrice: number;
}

export interface SurchargeOptions {
  sameDay?: boolean;
  weekend?: boolean;
  extendedHours?: boolean;
  extendedArea?: boolean;
  isGenovaKit?: boolean;
  additionalGenovaKits?: number;
  additionalSpecialtyKits?: number;
  hasExtraLabDestination?: boolean; // specialty kit + separate lab order
  multipleLabOrderDoctors?: number; // number of EXTRA doctors (0 = single doctor)
}

export interface PriceBreakdown {
  servicePrice: number;
  surcharges: { label: string; amount: number }[];
  surchargeTotal: number;
  subtotal: number;
  tip: number;
  total: number;
}

const SERVICE_CATALOG: ServiceOption[] = [
  { id: 'mobile', name: 'Mobile Blood Draw (At Home)', description: 'Licensed phlebotomist comes to your location', basePrice: 150 },
  { id: 'in-office', name: 'Office Visit (Standard)', description: 'Visit our partner office location', basePrice: 55 },
  { id: 'specialty-kit', name: 'Specialty Collection Kit', description: 'Specialty kits shipped via UPS/FedEx', basePrice: 185 },
  { id: 'specialty-kit-genova', name: 'Genova Diagnostics Kit', description: 'Genova specialty collection', basePrice: 200 },
  { id: 'senior', name: 'Senior Blood Draw (65+)', description: 'Discounted mobile visit for 65+', basePrice: 100 },
  { id: 'therapeutic', name: 'Therapeutic Phlebotomy', description: 'Blood removal per doctor order', basePrice: 200 },
  { id: 'additional', name: 'Additional Patient (Same Location)', description: 'Add another patient at the same visit', basePrice: 75 },
];

const SURCHARGES = {
  sameDay: { label: 'Same-Day / STAT Appointment', amount: 100 },
  weekend: { label: 'Weekend Service', amount: 75 },
  extendedHours: { label: 'Extended Hours', amount: 50 },
  extendedArea: { label: 'Extended Service Area', amount: 75 },
};

// Provider partner pricing
const PARTNER_PRICING: Record<string, number> = {
  'partner-restoration-place': 125,
  'partner-elite-medical-concierge': 72.25,
  'partner-naturamed': 85,
  'partner-aristotle-education': 185,
};

// Additional patient pricing by visit type
const ADDITIONAL_PATIENT_PRICING: Record<string, number> = {
  'mobile': 75,
  'senior': 75,
  'in-office': 75,
  'therapeutic': 75,
  'specialty-kit': 45,
  'specialty-kit-genova': 75,
};

// Default additional patient price for provider partners
const PARTNER_ADDITIONAL_PATIENT_PRICE = 45;

// Cities/areas that incur the extended service area surcharge (+$75, +30min)
export const EXTENDED_AREA_CITIES = [
  'lake nona', 'celebration', 'kissimmee', 'sanford', 'eustis',
  'clermont', 'montverde', 'deltona', 'geneva',
];

export const DEFAULT_APPOINTMENT_DURATION = 60; // 1 hour
export const EXTENDED_AREA_EXTRA_DURATION = 30; // +30 min for extended areas

// Duration by visit type (minutes)
export const VISIT_DURATIONS: Record<string, number> = {
  'mobile': 60,
  'in-office': 60,
  'senior': 60,
  'therapeutic': 75, // 1hr 15min
  'specialty-kit': 75, // 1hr 15min
  'specialty-kit-genova': 80, // 1hr 20min
};

export function isExtendedArea(city: string): boolean {
  return EXTENDED_AREA_CITIES.includes(city.toLowerCase().trim());
}

export function getServiceCatalog(): ServiceOption[] {
  return SERVICE_CATALOG;
}

export function getServiceById(serviceId: string): ServiceOption | undefined {
  return SERVICE_CATALOG.find(s => s.id === serviceId);
}

export function calculateBasePrice(serviceId: string): number {
  if (serviceId.startsWith('partner-')) {
    return PARTNER_PRICING[serviceId] ?? 125;
  }
  const service = getServiceById(serviceId);
  return service?.basePrice ?? 150;
}

export function getAdditionalPatientPrice(visitType: string): number {
  if (visitType.startsWith('partner-')) return PARTNER_ADDITIONAL_PATIENT_PRICE;
  return ADDITIONAL_PATIENT_PRICING[visitType] ?? 75;
}

export function calculateSurcharges(options: SurchargeOptions): { label: string; amount: number }[] {
  const items: { label: string; amount: number }[] = [];
  if (options.sameDay) items.push(SURCHARGES.sameDay);
  if (options.weekend) items.push(SURCHARGES.weekend);
  if (options.extendedHours) items.push(SURCHARGES.extendedHours);
  if (options.extendedArea) items.push(SURCHARGES.extendedArea);

  // Additional Genova kits: +$75 each
  if (options.additionalGenovaKits && options.additionalGenovaKits > 0) {
    items.push({
      label: `Additional Genova Kit${options.additionalGenovaKits > 1 ? 's' : ''} (${options.additionalGenovaKits})`,
      amount: options.additionalGenovaKits * 75,
    });
  }

  // Additional non-Genova specialty kits: +$45 each
  if (options.additionalSpecialtyKits && options.additionalSpecialtyKits > 0) {
    items.push({
      label: `Additional Specialty Kit${options.additionalSpecialtyKits > 1 ? 's' : ''} (${options.additionalSpecialtyKits})`,
      amount: options.additionalSpecialtyKits * 45,
    });
  }

  // Specialty kit patient also has a separate lab order going to LabCorp/Quest/hospital
  if (options.hasExtraLabDestination) {
    items.push({ label: 'Additional Lab Destination', amount: 55 });
  }

  // Multiple lab orders from different doctors: +$5.99 per extra
  if (options.multipleLabOrderDoctors && options.multipleLabOrderDoctors > 0) {
    items.push({
      label: `Multiple Doctor Orders (${options.multipleLabOrderDoctors} extra)`,
      amount: parseFloat((options.multipleLabOrderDoctors * 5.99).toFixed(2)),
    });
  }

  return items;
}

export function calculateTotal(
  serviceId: string,
  options: SurchargeOptions,
  tipAmount: number = 0,
  additionalPatientCount: number = 0
): PriceBreakdown {
  const servicePrice = calculateBasePrice(serviceId);
  const surcharges = calculateSurcharges(options);

  if (additionalPatientCount > 0) {
    const perPatient = getAdditionalPatientPrice(serviceId);
    surcharges.push({
      label: `Additional Patient${additionalPatientCount > 1 ? 's' : ''} (${additionalPatientCount} × $${perPatient})`,
      amount: additionalPatientCount * perPatient,
    });
  }

  const surchargeTotal = surcharges.reduce((sum, s) => sum + s.amount, 0);
  const subtotal = parseFloat((servicePrice + surchargeTotal).toFixed(2));

  return {
    servicePrice,
    surcharges,
    surchargeTotal,
    subtotal,
    tip: tipAmount,
    total: parseFloat((subtotal + tipAmount).toFixed(2)),
  };
}
