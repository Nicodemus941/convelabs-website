/**
 * Phleb Dashboard Helpers
 *
 * Pure utilities used by the phleb appointment card for pre-flight checks,
 * fasting detection, and lab-route lookups. Keep deterministic — no side effects.
 */

// ─────────────────────────────────────────────────────────────
// 1. PRE-FLIGHT READINESS
// ─────────────────────────────────────────────────────────────

export type Readiness = 'ready' | 'warning' | 'blocked' | 'na';

export interface ReadinessResult {
  status: Readiness;
  label: string;
  reasons: string[];
  colorClass: string;
}

// Services that don't require specimen delivery (drawn and left at the partner site)
const NON_DELIVERY_SERVICES = new Set([
  'in-office',
  'partner-nd-wellness',
  'partner-restoration-place',
  'partner-elite-medical-concierge',
  'partner-naturamed',
  'partner-aristotle-education',
]);

export function computeReadiness(appointment: {
  service_type: string;
  lab_order_file_path?: string | null;
  lab_destination?: string | null;
  address?: string | null;
  notes?: string | null;
}): ReadinessResult {
  const reasons: string[] = [];
  const isDeliveryVisit = !NON_DELIVERY_SERVICES.has(appointment.service_type);

  // Partner/in-office visits have their own workflow — readiness doesn't apply
  if (!isDeliveryVisit) {
    return {
      status: 'na',
      label: 'In-Office',
      reasons: [],
      colorClass: 'bg-gray-100 text-gray-600 border-gray-200',
    };
  }

  if (!appointment.lab_destination) reasons.push('No lab destination');
  if (!appointment.lab_order_file_path) {
    // Check notes for mention of "lab order provided in person" or similar
    const n = (appointment.notes || '').toLowerCase();
    if (!/lab order|requisition|provided|paper|bring/.test(n)) {
      reasons.push('No lab order uploaded');
    }
  }
  if (!appointment.address || appointment.address === 'Pending') {
    reasons.push('Address not set');
  }

  if (reasons.length === 0) {
    return { status: 'ready', label: 'READY', reasons: [], colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  }
  if (reasons.length >= 2) {
    return { status: 'blocked', label: 'BLOCKED', reasons, colorClass: 'bg-red-100 text-red-800 border-red-300' };
  }
  return { status: 'warning', label: 'CHECK', reasons, colorClass: 'bg-amber-100 text-amber-800 border-amber-300' };
}

// ─────────────────────────────────────────────────────────────
// 2. FASTING DETECTION
// ─────────────────────────────────────────────────────────────

/**
 * Returns a fasting warning string if the service looks like it requires fasting,
 * or null if not. This is a best-effort heuristic — always defer to the lab order.
 */
export function detectFastingRequirement(appointment: {
  service_name?: string | null;
  service_type?: string | null;
  notes?: string | null;
}): { required: boolean; reason?: string } {
  const haystack = [
    appointment.service_name || '',
    appointment.service_type || '',
    appointment.notes || '',
  ].join(' ').toLowerCase();

  if (/\bfasting\b|\bfasted\b|\bnpo\b/.test(haystack)) {
    return { required: true, reason: 'Fasting indicated in order' };
  }

  // Common fasting panels
  const fastingPanels = [
    { re: /lipid\s*panel|cholesterol/, label: 'Lipid Panel' },
    { re: /\bcmp\b|comprehensive\s*metabolic/, label: 'CMP' },
    { re: /\bbmp\b|basic\s*metabolic/, label: 'BMP' },
    { re: /\bglucose\b/, label: 'Glucose' },
    { re: /fasting\s*insulin/, label: 'Fasting Insulin' },
    { re: /lactic\s*acid/, label: 'Lactic Acid' },
  ];

  for (const panel of fastingPanels) {
    if (panel.re.test(haystack)) {
      return { required: true, reason: `${panel.label} typically requires fasting` };
    }
  }
  return { required: false };
}

// ─────────────────────────────────────────────────────────────
// 3. LAB ROUTE LOOKUP
// ─────────────────────────────────────────────────────────────

/**
 * Builds a Maps URL for the phleb to route to the specimen drop-off.
 * Strategy: use lab name + patient's zip code so Maps picks the nearest branch.
 * The phleb sees a "near me" list in Maps and picks the closest location they
 * haven't already been to today.
 */
export function buildLabRouteUrl(labDestination: string | null | undefined, patientZip?: string | null): string | null {
  if (!labDestination) return null;
  const normalized = labDestination.trim();

  // Shipping services route to the UPS/FedEx drop, not a lab address
  if (/ups/i.test(normalized)) return buildMapsUrl(`UPS drop off near ${patientZip || 'me'}`);
  if (/fedex/i.test(normalized)) return buildMapsUrl(`FedEx drop off near ${patientZip || 'me'}`);

  // Genova ships via UPS
  if (/genova/i.test(normalized)) return buildMapsUrl(`UPS drop off near ${patientZip || 'me'}`);

  // Lab destinations — search for the brand near patient
  const labBrand = (() => {
    if (/labcorp/i.test(normalized)) return 'LabCorp';
    if (/quest/i.test(normalized)) return 'Quest Diagnostics';
    if (/adventhealth/i.test(normalized)) return 'AdventHealth Lab';
    if (/orlando\s*health/i.test(normalized)) return 'Orlando Health Lab';
    return normalized;
  })();

  return buildMapsUrl(`${labBrand} near ${patientZip || 'me'}`);
}

function buildMapsUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

// ─────────────────────────────────────────────────────────────
// 4. DELAY MESSAGE TEMPLATES
// ─────────────────────────────────────────────────────────────

export function buildDelayMessage(patientFirstName: string, delayMinutes: number): string {
  const first = patientFirstName?.split(' ')[0] || 'there';
  if (delayMinutes <= 5) {
    return `Hi ${first}, this is your ConveLabs phlebotomist — I'm about 5 min behind. See you shortly! If you need anything, reply here.`;
  }
  if (delayMinutes <= 15) {
    return `Hi ${first}, running approximately ${delayMinutes} minutes behind schedule. I'll text you when I'm 5 minutes away. Apologies for the wait. — ConveLabs`;
  }
  return `Hi ${first}, I'm running about ${delayMinutes} minutes late due to an unexpected delay with my prior visit. I'll text you a fresh ETA in a few. If you need to reschedule, just reply here — thank you for your patience. — ConveLabs`;
}
