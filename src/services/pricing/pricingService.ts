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
  /**
   * Hormozi specialty-kit bundle pricing. When set, OVERRIDES the ad-hoc
   * additionalSpecialtyKits + additionalPatientCount handling for any
   * `specialty-kit*` service. The bundle calculator routes through
   * `calculateSpecialtyKitBundle()` to apply volume discounts + couple/family
   * bundle cuts and surface the savings as a separate line item the patient
   * sees ("Couple Wellness Stack · save $75").
   */
  specialtyKitBundle?: SpecialtyKitBundle;
}

/**
 * Per-patient kit count for a specialty-kit booking.
 * `kits` is the number of kits THIS patient is having drawn (1 = the
 * default visit, 2+ = additional kits on the same draw). The first patient
 * is treated as the primary; subsequent entries are companions.
 */
export interface SpecialtyKitBundle {
  patients: Array<{ kits: number }>;     // length 1 = solo, 2+ = couple/family
  isGenova?: boolean;                     // applies Genova base + per-kit rates
}

export interface PriceBreakdown {
  servicePrice: number;
  surcharges: { label: string; amount: number }[];
  surchargeTotal: number;
  subtotal: number;
  tip: number;
  total: number;
  /**
   * Specialty-kit bundle "save vs unbundled" amount, in dollars. Only set
   * when calculateSpecialtyKitBundle() ran. Surface this as a chip
   * ("Couple Wellness Stack · save $75") on the booking summary — the
   * `total` field is already the discounted price.
   */
  bundleSavings?: number;
  bundleLabel?: string;
}

// Membership tiers
export type MembershipTier = 'none' | 'member' | 'vip' | 'concierge';

// Per-service pricing by membership tier.
// Hormozi rule: member's tier price is the floor — they never pay more than
// their tier price on ANY service, including partner visits. Combined with
// the server-side `lowest_wins` stacking rule on each partner org, this
// guarantees every member sees their $99/$199/$399/yr benefit on every
// single visit, regardless of referral source.
const TIER_PRICING: Record<string, Record<MembershipTier, number>> = {
  'dev-testing':        { none: 1,   member: 1,   vip: 1,   concierge: 1 },
  'mobile':             { none: 150, member: 130, vip: 115, concierge: 99 },
  'in-office':          { none: 55,  member: 49,  vip: 45,  concierge: 39 },
  'senior':             { none: 100, member: 85,  vip: 75,  concierge: 65 },
  'specialty-kit':      { none: 185, member: 165, vip: 150, concierge: 135 },
  'specialty-kit-genova': { none: 200, member: 180, vip: 165, concierge: 150 },
  'therapeutic':        { none: 200, member: 180, vip: 165, concierge: 150 },
  'additional':         { none: 75,  member: 55,  vip: 45,  concierge: 35 },
  // Partner services — members must see a discount here too, otherwise the
  // $199/yr VIP fee feels worthless when referred in by a partner practice.
  'partner-restoration-place':       { none: 125,   member: 115,   vip: 99,    concierge: 85 },
  'partner-naturamed':               { none: 85,    member: 80,    vip: 75,    concierge: 65 },
  'partner-nd-wellness':             { none: 85,    member: 80,    vip: 75,    concierge: 65 },
  'partner-elite-medical-concierge': { none: 72.25, member: 72.25, vip: 72.25, concierge: 72.25 }, // org_covers — patient pays 0; this is for display only
  'partner-aristotle-education':     { none: 185,   member: 185,   vip: 185,   concierge: 185 },   // org_covers — patient pays 0
};

// Membership annual fees
export const MEMBERSHIP_FEES: Record<string, { name: string; fee: number; label: string }> = {
  member: { name: 'Member', fee: 99, label: '$99/year' },
  vip: { name: 'VIP', fee: 199, label: '$199/year' },
  concierge: { name: 'Concierge', fee: 399, label: '$399/year' },
};

// Provider partner pricing (flat, no tiers).
// CRITICAL: every partner referenced in VisitTypeSelector.PROVIDER_PARTNERS
// must be in this map. Missing entries fall back to $125 (the default in
// getServicePrice), which causes ND-Wellness/NaturaMed referrals to display
// the wrong price at checkout.
const PARTNER_PRICING: Record<string, number> = {
  'partner-restoration-place': 125,
  'partner-elite-medical-concierge': 72.25,
  'partner-naturamed': 85,
  'partner-nd-wellness': 85,
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
  'clermont', 'montverde', 'deltona', 'geneva', 'tavares',
  'mount dora', 'leesburg', 'groveland', 'mascotte', 'minneola',
  'daytona beach', 'deland', 'debary', 'orange city',
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
  { id: 'dev-testing', name: 'Development Testing', description: 'Testing service ($1)', basePrice: 1 },
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
  // Specialty-kit bundle override — short-circuits the ad-hoc per-kit + per-
  // patient stacking when a structured bundle is supplied. Lets the booking
  // flow render: "Couple Wellness Stack · 6 kits · save $75".
  if (options.specialtyKitBundle && (serviceId.startsWith('specialty-kit'))) {
    return calculateSpecialtyKitBundle(serviceId, options, tipAmount, tier);
  }

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

// ──────────────────────────────────────────────────────────────────────
// Specialty-kit bundle pricing (Hormozi-grade)
// ──────────────────────────────────────────────────────────────────────
//
// The offer ladder:
//
//   Solo · 1 kit                         $185 (Genova $200) — base
//   Solo · 2 kits                        +$35 each kit beyond #1
//   Solo · 3 kits                        +$35 each (Wellness Stack tier)
//   Solo · 4+ kits                       +$30 each beyond #3 (Power Stack)
//
//   Couple companion (with their own kit) +$50 per companion (was $75)
//   Companion's additional kits           same volume curve as primary
//
//   Family (3+ patients)                  +$50 per companion
//   Family Wellness Stack (6+ kits total) per-kit rate caps at $30
//
// The bundle ALWAYS reports the unbundled-equivalent in the "savings" line
// so the patient sees the discount loud-and-clear. Hormozi: the discount
// only works if the customer can SEE it.
//
// Member/VIP/Concierge tier discount applies to the BASE service price only,
// not to per-kit add-ons. Keeps the volume narrative clean and the math
// auditable.

const KIT_VOLUME_CURVE = {
  // Marginal cost of each additional kit on the same patient (after the 1st)
  // index: 0 = 2nd kit, 1 = 3rd kit, 2 = 4th+
  perKitAfterFirst: [35, 35, 30],   // standard specialty
  perKitGenova:     [50, 50, 45],   // Genova adds a premium per kit
};

const COMPANION_WITH_KIT_PRICE = 50;       // was $75 ad-hoc — Hormozi cut
const COMPANION_WITH_KIT_GENOVA = 65;      // Genova companion premium

/**
 * Calculate per-patient kit subtotal:
 *   1st kit     → 0 (included in base/companion price)
 *   2nd kit     → curve[0]
 *   3rd kit     → curve[1]
 *   4th+ kit    → curve[2] each
 */
function pricePerPatientKits(kits: number, isGenova: boolean): number {
  if (kits <= 1) return 0;
  const curve = isGenova ? KIT_VOLUME_CURVE.perKitGenova : KIT_VOLUME_CURVE.perKitAfterFirst;
  const additional = kits - 1;
  let total = 0;
  for (let i = 0; i < additional; i++) {
    total += curve[Math.min(i, curve.length - 1)];
  }
  return total;
}

/** What the customer would pay if everything was line-item-billed without the bundle. */
function pricePerPatientUnbundled(kits: number, isCompanion: boolean, isGenova: boolean, baseSolo: number, oldCompanionRate: number): number {
  // Pre-bundle "unbundled" equivalent — used to compute the savings line.
  // Primary: base + (kits-1) × $45 (or $75 Genova)
  // Companion: $75 + (kits-1) × $45 (or $75 Genova)
  const oldKitRate = isGenova ? 75 : 45;
  const start = isCompanion ? oldCompanionRate : baseSolo;
  return start + Math.max(0, kits - 1) * oldKitRate;
}

/**
 * Hormozi bundle calculator for specialty kits + companions + multi-kits.
 * Returns a PriceBreakdown where the surcharges list is human-readable
 * (one line per patient) and includes a savings line whenever the bundle
 * beats the unbundled total.
 */
export function calculateSpecialtyKitBundle(
  serviceId: string,
  options: SurchargeOptions,
  tipAmount: number,
  tier: MembershipTier
): PriceBreakdown {
  const bundle = options.specialtyKitBundle!;
  const isGenova = bundle.isGenova || serviceId === 'specialty-kit-genova';
  const baseService: 'specialty-kit-genova' | 'specialty-kit' = isGenova ? 'specialty-kit-genova' : 'specialty-kit';
  const tieredBase = getServicePrice(baseService, tier);

  // Old companion rate used for "unbundled" comparison
  const oldCompanionRate = isGenova ? 75 : 75; // additional-patient rate (specialty-kit visits)

  const surcharges: { label: string; amount: number }[] = [];
  let bundleTotal = tieredBase;
  let unbundledTotal = getServicePrice(baseService, 'none');

  // Primary patient additional kits
  const primaryKits = bundle.patients[0]?.kits || 1;
  if (primaryKits > 1) {
    const addTotal = pricePerPatientKits(primaryKits, isGenova);
    surcharges.push({
      label: `${primaryKits} kits for primary patient`,
      amount: addTotal,
    });
    bundleTotal += addTotal;
  }
  unbundledTotal += pricePerPatientKits(primaryKits, isGenova) > 0
    ? Math.max(0, primaryKits - 1) * (isGenova ? 75 : 45)
    : 0;

  // Companions
  const companions = bundle.patients.slice(1);
  for (let i = 0; i < companions.length; i++) {
    const comp = companions[i];
    const compKits = comp.kits || 1;
    const compBase = isGenova ? COMPANION_WITH_KIT_GENOVA : COMPANION_WITH_KIT_PRICE;
    const compKitAdd = compKits > 1 ? pricePerPatientKits(compKits, isGenova) : 0;
    const compTotal = compBase + compKitAdd;

    surcharges.push({
      label: `Companion ${i + 1}: ${compKits} kit${compKits > 1 ? 's' : ''}`,
      amount: compTotal,
    });
    bundleTotal += compTotal;
    unbundledTotal += pricePerPatientUnbundled(compKits, true, isGenova, getServicePrice(baseService, 'none'), oldCompanionRate);
  }

  // Other (non-specialty-kit) surcharges still apply: same-day, weekend, etc.
  const stdSurcharges = calculateSurcharges({
    ...options,
    additionalGenovaKits: 0,
    additionalSpecialtyKits: 0,
    specialtyKitBundle: undefined,
  });
  for (const s of stdSurcharges) {
    surcharges.push(s);
    bundleTotal += s.amount;
    unbundledTotal += s.amount;
  }

  // bundleTotal IS the discounted price the patient pays. The "savings"
  // amount is purely for display — it tells the patient how much they
  // saved vs the old unbundled flat-rate. Surfaced as `bundleSavings` +
  // `bundleLabel` so the UI can render a green chip.
  const savings = parseFloat((unbundledTotal - bundleTotal).toFixed(2));
  const showSavings = savings >= 5;

  const surchargeTotal = surcharges.reduce((sum, s) => sum + s.amount, 0);
  const subtotal = parseFloat((tieredBase + surchargeTotal).toFixed(2));

  return {
    servicePrice: tieredBase,
    surcharges,
    surchargeTotal,
    subtotal,
    tip: tipAmount,
    total: parseFloat((subtotal + tipAmount).toFixed(2)),
    bundleSavings: showSavings ? savings : undefined,
    bundleLabel: showSavings ? bundleLabel(bundle, savings) : undefined,
  };
}

/** Marketing label for the bundle — Hormozi-style scarcity + naming */
function bundleLabel(bundle: SpecialtyKitBundle, savings: number): string {
  const totalKits = bundle.patients.reduce((s, p) => s + (p.kits || 1), 0);
  const patients = bundle.patients.length;

  if (patients === 1) {
    if (totalKits >= 4) return `Power Stack · save $${savings.toFixed(0)}`;
    if (totalKits === 3) return `Wellness Stack · save $${savings.toFixed(0)}`;
    return `Bundle savings · save $${savings.toFixed(0)}`;
  }
  if (patients === 2) {
    if (totalKits >= 6) return `Couple Wellness Stack · save $${savings.toFixed(0)}`;
    if (totalKits >= 4) return `Couple Stack · save $${savings.toFixed(0)}`;
    return `Couple Bundle · save $${savings.toFixed(0)}`;
  }
  // Family (3+ patients)
  if (totalKits >= 6) return `Family Wellness Stack · save $${savings.toFixed(0)}`;
  return `Family Pack · save $${savings.toFixed(0)}`;
}
