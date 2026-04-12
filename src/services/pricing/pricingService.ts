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
  hasExtraLabDestination?: boolean;
  multipleLabOrderDoctors?: number;
}

export interface PriceBreakdown {
  servicePrice: number;
  surcharges: { label: string; amount: number }[];
  surchargeTotal: number;
  subtotal: number;
  tip: number;
  total: number;
}

// Membership tiers
export type MembershipTier = 'none' | 'member' | 'vip' | 'concierge';

// Per-service pricing by membership tier
const TIER_PRICING: Record<string, Record<MembershipTier, number>> = {
  'mobile':             { none: 150, member: 130, vip: 115, concierge: 99 },
  'in-office':          { none: 55,  member: 49,  vip: 45,  concierge: 39 },
  'senior':             { none: 100, member: 85,  vip: 75,  concierge: 65 },
  'specialty-kit':      { none: 185, member: 165, vip: 150, concierge: 135 },
  'specialty-kit-genova': { none: 200, member: 180, vip: 165, concierge: 150 },
  'therapeutic':        { none: 200, member: 180, vip: 165, concierge: 150 },
  'additional':         { none: 75,  member: 55,  vip: 45,  concierge: 35 },
};

// Membership annual fees
export const MEMBERSHIP_FEES: Record<string, { name: string; fee: number; label: string }> = {
  member: { name: 'Member', fee: 99, label: '$99/year' },
  vip: { name: 'VIP', fee: 199, label: '$199/year' },
  concierge: { name: 'Concierge', fee: 399, label: '$399/year' },
};

// Provider partner pricing (flat, no tiers)
const PARTNER_PRICING: Record<string, number> = {
  'partner-restoration-place': 125,
  'partner-elite-medical-concierge': 72.25,
  'partner-naturamed': 85,
  'partner-aristotle-education': 185,
};

const SURCHARGES = {
  sameDay: { label: 'Same-Day / STAT Appointment', amount: 100 },
  weekend: { label: 'Weekend Service', amount: 75 },
  extendedHours: { label: 'Extended Hours', amount: 50 },
  extendedArea: { label: 'Extended Service Area', amount: 75 },
};

// Additional patient pricing by tier
function getAdditionalPatientPrice(visitType: string, tier: MembershipTier = 'none'): number {
  if (visitType.startsWith('partner-')) return 45;
  return TIER_PRICING['additional']?.[tier] ?? 75;
}

// Cities that incur extended area surcharge
export const EXTENDED_AREA_CITIES = [
  'lake nona', 'celebration', 'kissimmee', 'sanford', 'eustis',
  'clermont', 'montverde', 'deltona', 'geneva',
];

export const DEFAULT_APPOINTMENT_DURATION = 60;
export const EXTENDED_AREA_EXTRA_DURATION = 30;

export const VISIT_DURATIONS: Record<string, number> = {
  'mobile': 60,
  'in-office': 60,
  'senior': 60,
  'therapeutic': 75,
  'specialty-kit': 75,
  'specialty-kit-genova': 80,
};

export function isExtendedArea(city: string): boolean {
  return EXTENDED_AREA_CITIES.includes(city.toLowerCase().trim());
}

// Service catalog (non-member prices as base)
const SERVICE_CATALOG: ServiceOption[] = [
  { id: 'mobile', name: 'Mobile Blood Draw (At Home)', description: 'Licensed phlebotomist comes to your location', basePrice: 150 },
  { id: 'in-office', name: 'Office Visit (Standard)', description: 'Visit our partner office location', basePrice: 55 },
  { id: 'specialty-kit', name: 'Specialty Collection Kit', description: 'Specialty kits shipped via UPS/FedEx', basePrice: 185 },
  { id: 'specialty-kit-genova', name: 'Genova Diagnostics Kit', description: 'Genova specialty collection', basePrice: 200 },
  { id: 'senior', name: 'Senior Blood Draw (65+)', description: 'Discounted mobile visit for 65+', basePrice: 100 },
  { id: 'therapeutic', name: 'Therapeutic Phlebotomy', description: 'Blood removal per doctor order', basePrice: 200 },
  { id: 'additional', name: 'Additional Patient (Same Location)', description: 'Add another patient at the same visit', basePrice: 75 },
];

export function getServiceCatalog(): ServiceOption[] {
  return SERVICE_CATALOG;
}

export function getServiceById(serviceId: string): ServiceOption | undefined {
  return SERVICE_CATALOG.find(s => s.id === serviceId);
}

export function getServicePrice(serviceId: string, tier: MembershipTier = 'none'): number {
  if (serviceId.startsWith('partner-')) {
    return PARTNER_PRICING[serviceId] ?? 125;
  }
  return TIER_PRICING[serviceId]?.[tier] ?? TIER_PRICING['mobile']?.[tier] ?? 150;
}

export function calculateBasePrice(serviceId: string): number {
  return getServicePrice(serviceId, 'none');
}

export function calculateSurcharges(options: SurchargeOptions): { label: string; amount: number }[] {
  const items: { label: string; amount: number }[] = [];
  if (options.sameDay) items.push(SURCHARGES.sameDay);
  if (options.weekend) items.push(SURCHARGES.weekend);
  if (options.extendedHours) items.push(SURCHARGES.extendedHours);
  if (options.extendedArea) items.push(SURCHARGES.extendedArea);

  if (options.additionalGenovaKits && options.additionalGenovaKits > 0) {
    items.push({ label: `Additional Genova Kit${options.additionalGenovaKits > 1 ? 's' : ''} (${options.additionalGenovaKits})`, amount: options.additionalGenovaKits * 75 });
  }
  if (options.additionalSpecialtyKits && options.additionalSpecialtyKits > 0) {
    items.push({ label: `Additional Specialty Kit${options.additionalSpecialtyKits > 1 ? 's' : ''} (${options.additionalSpecialtyKits})`, amount: options.additionalSpecialtyKits * 45 });
  }
  if (options.hasExtraLabDestination) {
    items.push({ label: 'Additional Lab Destination', amount: 55 });
  }
  if (options.multipleLabOrderDoctors && options.multipleLabOrderDoctors > 0) {
    items.push({ label: `Multiple Doctor Orders (${options.multipleLabOrderDoctors} extra)`, amount: parseFloat((options.multipleLabOrderDoctors * 5.99).toFixed(2)) });
  }
  return items;
}

export function calculateTotal(
  serviceId: string,
  options: SurchargeOptions,
  tipAmount: number = 0,
  additionalPatientCount: number = 0,
  tier: MembershipTier = 'none'
): PriceBreakdown {
  const servicePrice = getServicePrice(serviceId, tier);
  const surcharges = calculateSurcharges(options);

  if (additionalPatientCount > 0) {
    const perPatient = getAdditionalPatientPrice(serviceId, tier);
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
