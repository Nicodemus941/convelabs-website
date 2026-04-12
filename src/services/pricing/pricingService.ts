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
  { id: 'in-office', name: 'Doctor Office Blood Draw', description: 'Visit our partner office location', basePrice: 55 },
  { id: 'senior', name: 'Senior Blood Draw (65+)', description: 'Discounted rate for patients 65 and older', basePrice: 100 },
  { id: 'additional', name: 'Additional Patient (Same Location)', description: 'Add another patient at the same visit', basePrice: 75 },
];

const SURCHARGES = {
  sameDay: { label: 'Same-Day Appointment', amount: 50 },
  weekend: { label: 'Weekend Service', amount: 75 },
  extendedHours: { label: 'Extended Hours', amount: 50 },
};

export function getServiceCatalog(): ServiceOption[] {
  return SERVICE_CATALOG;
}

export function getServiceById(serviceId: string): ServiceOption | undefined {
  return SERVICE_CATALOG.find(s => s.id === serviceId);
}

export function calculateBasePrice(serviceId: string): number {
  const service = getServiceById(serviceId);
  return service?.basePrice ?? 150; // default to mobile price
}

export function calculateSurcharges(options: SurchargeOptions): { label: string; amount: number }[] {
  const items: { label: string; amount: number }[] = [];
  if (options.sameDay) items.push(SURCHARGES.sameDay);
  if (options.weekend) items.push(SURCHARGES.weekend);
  if (options.extendedHours) items.push(SURCHARGES.extendedHours);
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
