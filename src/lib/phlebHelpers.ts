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
  booking_source?: string | null;
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

  // (2026-04-20) Admin-booked visits skip readiness checks entirely.
  // The online booking flow REQUIRES the patient to upload a lab order + pick
  // a lab destination before they can pay — so for online bookings, a missing
  // field means something's actually wrong. Admin-scheduled visits (booking_
  // source='manual') often have the order on paper, a known partner workflow,
  // or the admin has the info offline. Showing BLOCKED for those is noise.
  const isOnlineBooking = appointment.booking_source === 'online';
  if (!isOnlineBooking) {
    return {
      status: 'na',
      label: '',
      reasons: [],
      colorClass: '',
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
 *
 * Reads from multiple signals, strongest first:
 *   1. lab_order_panels (structured, from OCR)
 *   2. lab_order_ocr_text (OCR text)
 *   3. service_name / service_type / notes (legacy text fields)
 */
export function detectFastingRequirement(appointment: {
  service_name?: string | null;
  service_type?: string | null;
  notes?: string | null;
  lab_order_ocr_text?: string | null;
  lab_order_panels?: string[] | any;
}): { required: boolean; reason?: string } {
  // Strongest signal: structured panels extracted by OCR
  if (Array.isArray(appointment.lab_order_panels)) {
    const lower = (appointment.lab_order_panels as string[]).map(p => String(p).toLowerCase());
    const panels = [
      { match: (s: string) => /lipid|cholesterol/.test(s), label: 'Lipid Panel' },
      { match: (s: string) => /\bcmp\b|comprehensive\s*metabolic/.test(s), label: 'CMP' },
      { match: (s: string) => /\bbmp\b|basic\s*metabolic/.test(s), label: 'BMP' },
      { match: (s: string) => /\bglucose\b/.test(s), label: 'Glucose' },
      { match: (s: string) => /fasting\s*insulin/.test(s), label: 'Fasting Insulin' },
    ];
    for (const p of panels) {
      if (lower.some(p.match)) {
        return { required: true, reason: `${p.label} detected in lab order — typically requires fasting` };
      }
    }
  }

  const haystack = [
    appointment.service_name || '',
    appointment.service_type || '',
    appointment.notes || '',
    appointment.lab_order_ocr_text || '', // include OCR'd text
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
// 4. PANEL BADGES (from OCR)
// ─────────────────────────────────────────────────────────────

/**
 * Returns a cleaned, deduped list of panels to show as chips on the phleb card.
 * Caps at 8 so the card doesn't become a wall of text.
 */
export function extractPanelBadges(labOrderPanels: any): string[] {
  if (!Array.isArray(labOrderPanels)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labOrderPanels) {
    const clean = String(raw).trim().substring(0, 40);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 5. PRE-VISIT PREP REQUIREMENT ANALYZER (patient-side)
// ─────────────────────────────────────────────────────────────

/**
 * Analyzes OCR-extracted panels + text from a patient's uploaded lab order
 * and returns a structured set of prep requirements. Used by the post-upload
 * modal AND the appointment confirmation email to tell the patient exactly
 * what to do before their visit.
 */

export interface PrepRequirement {
  key: string;
  title: string;
  body: string;
  icon: 'fasting' | 'urine' | 'glucose' | 'hydrate' | 'timing' | 'info';
}

export interface PrepAnalysis {
  hasAnyPrep: boolean;
  requirements: PrepRequirement[];
  detectedPanels: string[];
}

export function analyzePrepRequirements(
  labOrderPanels: string[] | null | undefined,
  ocrText: string | null | undefined
): PrepAnalysis {
  const panels = Array.isArray(labOrderPanels) ? labOrderPanels : [];
  const textLower = (ocrText || '').toLowerCase();
  const panelsLower = panels.map(p => String(p).toLowerCase());
  const everything = [...panelsLower, textLower].join(' ');

  const requirements: PrepRequirement[] = [];
  const seen = new Set<string>();
  const push = (r: PrepRequirement) => {
    if (seen.has(r.key)) return;
    seen.add(r.key);
    requirements.push(r);
  };

  // Fasting detection
  if (/\bfasting\b|\bfasted\b|\bnpo\b|lipid|cholesterol|\bcmp\b|comprehensive\s*metabolic|\bbmp\b|basic\s*metabolic|\bglucose\b(?!\s*tolerance)|fasting\s*insulin|iron\s*panel|ferritin|\bhepatic\b/.test(everything)) {
    push({
      key: 'fasting',
      title: 'Please fast 8–12 hours before your visit',
      body: 'Water and black coffee (no cream, no sugar) are OK. Stop eating no later than 8 hours before your appointment time. If you take medications, continue them unless your doctor told you otherwise.',
      icon: 'fasting',
    });
  }

  // Urine collection
  if (/\burine\b|\burinalysis\b|\bua\b|urine\s*culture|\bmicroalbumin\b|\b24[-\s]*hour\s*urine\b|creatinine\s*clearance/.test(everything)) {
    const is24Hour = /\b24[-\s]*hour/.test(everything);
    if (is24Hour) {
      push({
        key: 'urine-24h',
        title: 'Your order includes a 24-hour urine collection',
        body: "This is a special collection — your phlebotomist will bring a large container and explain the process. You'll collect every drop of urine over 24 hours starting the morning of your draw. Please call us at (941) 527-9169 ahead of time so we can coordinate the exact start time.",
        icon: 'urine',
      });
    } else {
      push({
        key: 'urine',
        title: 'Your order includes a urine test',
        body: "Your phlebotomist will arrive with a sterile collection cup and walk you through the clean-catch technique. Please try to hold off using the restroom for 30–60 minutes before your appointment so you're ready to collect.",
        icon: 'urine',
      });
    }
  }

  // Glucose tolerance test (GTT)
  if (/glucose\s*tolerance|\bgtt\b|oral\s*glucose/.test(everything)) {
    push({
      key: 'gtt',
      title: 'Glucose Tolerance Test — plan to be available 2–3 hours',
      body: 'This test requires a baseline draw, drinking a glucose solution, and additional draws at timed intervals (usually 1 hr and 2 hr after). Please fast 8–12 hours beforehand. Block 2–3 hours of time at home, and avoid exercise or smoking during the test.',
      icon: 'glucose',
    });
  }

  // Hydration for standard draw
  if (requirements.length === 0 && panels.length > 0) {
    // Any detected test gets the gentle "hydrate" recommendation
    push({
      key: 'hydrate',
      title: 'Stay well hydrated before your visit',
      body: 'Drink an extra 16oz of water this morning and tomorrow — it makes finding the vein faster and the draw less painful. No other special prep is needed for the tests your doctor ordered.',
      icon: 'hydrate',
    });
  }

  return {
    hasAnyPrep: requirements.length > 0,
    requirements,
    detectedPanels: panels.slice(0, 10),
  };
}

// ─────────────────────────────────────────────────────────────
// 6. DELAY MESSAGE TEMPLATES
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
