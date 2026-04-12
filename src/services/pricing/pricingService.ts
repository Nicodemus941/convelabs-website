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

// Cities/areas that incur the extended service area surcharge (+$75, +30min)
export const EXTENDED_AREA_CITIES = [
  'lake nona', 'celebration', 'kissimmee', 'sanford', 'eustis',
  'clermont', 'montverde', 'deltona', 'geneva',
];

export const DEFAULT_APPOINTMENT_DURATION = 60; // 1 hour
export const EXTENDED_AREA_EXTRA_DURATION = 30; // +30 min for extended areas

export function isExtendedArea(city: string): boolean {
  return EXTENDED_AREA_CITIES.includes(city.toLowerCase().trim());
}

export function getServiceCatalog(): ServiceOption[] {
  return SERVICE_CATALOG;
}

export function getServiceById(serviceId: string): ServiceOption | undefined {
  return SERVICE_CATALOG.find(s => s.id === serviceId);
}

// Provider partner pricing
const PARTNER_PRICING: Record<string, number> = {
  'partner-restoration-place': 125,
  'partner-elite-medical-concierge': 72.25,
  'partner-naturamed': 85,
  'partner-aristotle-education': 185,
};

export function calculateBasePrice(serviceId: string): number {
  // Check for partner pricing first
  if (serviceId.startsWith('partner-')) {
    return PARTNER_PRICING[serviceId] ?? 125;
  }
  const service = getServiceById(serviceId);
  return service?.basePrice ?? 150;
}

export function calculateSurcharges(options: SurchargeOptions): { label: string; amount: number }[] {
  const items: { label: string; amount: number }[] = [];
  if (options.sameDay) items.push(SURCHARGES.sameDay);
  if (options.weekend) items.push(SURCHARGES.weekend);
  if (options.extendedHours) items.push(SURCHARGES.extendedHours);
  if (options.extendedArea) items.push(SURCHARGES.extendedArea);
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
    surcharges.push({
      label: `Additional Patient${additionalPatientCount > 1 ? 's' : ''} (${additionalPatientCount})`,
      amount: additionalPatientCount * 75,
    });
  }

  const surchargeTotal = surcharges.reduce((sum, s) => sum + s.amount, 0);
  const subtotal = servicePrice + surchargeTotal;

  return {
    servicePrice,
    surcharges,
    surchargeTotal,
    subtotal,
    tip: tipAmount,
    total: subtotal + tipAmount,
  };
}
