/**
 * OCR-LAB-ORDER
 *
 * Extracts text + detected panels from a patient's uploaded lab order image
 * or PDF using Claude Vision (claude-3-5-sonnet). Stores results on the
 * appointment row so downstream logic (fasting banner, tube-requirement
 * calculation, audit trail) has structured data to work from.
 *
 * POST body:
 *   { appointmentId: string }   — looks up lab_order_file_path, runs OCR
 *   OR
 *   { filePath: string }        — bare path, for one-off test runs
 *
 * Requires ANTHROPIC_API_KEY env var.
 *
 * HIPAA note: Anthropic's API is data-processing-agreement compatible; the
 * Claude Vision request contains the lab order image. Do NOT send this to
 * any other model without a BAA. If the BAA with Anthropic is not in place,
 * flip this to local OCR (Tesseract via wasm) as fallback.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ─── Provider-block extractor ─────────────────────────────────────────
// Parses the ordering-provider section from LabCorp / Quest / Genova /
// DUTCH lab order OCR text. Returns { practiceName, addressStreet, ...}.
// Every field is optional — whatever we can extract, we extract.
// Covers the 4 common layouts seen in production via trial and error.
interface ExtractedProvider {
  practiceName?: string;
  orderingPhysician?: string;
  npi?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  officePhone?: string;
}
// ─── Practice-name alias map ────────────────────────────────────────
// Lab orders sometimes use abbreviations or trade names. Map them to
// the canonical practice name so discover_or_link_provider_org links
// to the existing organization instead of creating a duplicate.
// Match is case-insensitive and trims whitespace + trailing words like
// "Clinic"/"LLC"/"PLLC" before comparing.
const PRACTICE_ALIAS_MAP: Array<{ patterns: RegExp[]; canonical: string; physicianAliases?: RegExp[] }> = [
  {
    canonical: 'The Restoration Place',
    patterns: [
      /^trp$/i,
      /^trp\s+clinic$/i,
      /^trp\s+wellness$/i,
      /^trp\s+health$/i,
      /^the\s+restoration\s+pl(ace|c)?$/i,
      /^restoration\s+place$/i,
      // Account-name field on TRP scripts is sometimes the physician's
      // name ("Cristelle Renta") because the lab account is registered
      // to her, not the practice. Map that to TRP too.
      /cristelle\s+renta/i,
    ],
    // If the practice name didn't match anything but the ordering
    // physician is one of these, route to the canonical org.
    physicianAliases: [/cristelle\s+renta/i],
  },
];

function normalizePracticeName(raw: string): string {
  if (!raw) return raw;
  const cleaned = raw.replace(/\s+/g, ' ').trim()
    .replace(/[,.]+$/, '')
    .replace(/\b(LLC|PLLC|PA|PC|Inc\.?|Corp\.?)\b\.?$/i, '')
    .trim();
  for (const alias of PRACTICE_ALIAS_MAP) {
    if (alias.patterns.some(rx => rx.test(cleaned))) {
      console.log(`[ocr->org] alias match: "${raw}" → "${alias.canonical}"`);
      return alias.canonical;
    }
  }
  return cleaned;
}

function extractProviderBlock(text: string): ExtractedProvider {
  const out: ExtractedProvider = {};
  if (!text) return out;
  const lines = text.split(/\r?\n/).map(l => l.trim());

  // Helper: look at the full text with regex (preserves context across lines)
  const full = text;

  // Practice / Account name — LabCorp uses "Account Name:", Quest uses
  // "Client Name:", Genova uses "Ordering Practitioner Name:"
  const mName = full.match(/(?:Account Name|Client Name|Clinic Name|Practice Name|Ordering Practitioner Name)\s*:\s*([^\n]{3,100})/i);
  if (mName) out.practiceName = normalizePracticeName(mName[1].trim().replace(/\s+$/, ''));

  // Street address — "Address 1: ..." on LabCorp, "Address:" on Quest
  const mStreet = full.match(/Address\s*(?:1|Line\s*1)?\s*:\s*([^\n]{5,120})/i);
  if (mStreet) out.addressStreet = mStreet[1].trim();

  // City, State Zip — comes after "City, State Zip:" on LabCorp
  const mCSZ = full.match(/(?:City,?\s*State,?\s*Zip|City\/State\/Zip)\s*:\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i);
  if (mCSZ) {
    out.addressCity = mCSZ[1].trim();
    out.addressState = mCSZ[2].trim().toUpperCase();
    out.addressZip = mCSZ[3].trim();
  } else {
    // Fallback: any line that looks like "City, FL 32801"
    for (const ln of lines) {
      const m = ln.match(/^([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (m && !out.addressCity) {
        out.addressCity = m[1].trim();
        out.addressState = m[2].trim();
        out.addressZip = m[3].trim();
        break;
      }
    }
  }

  // Phone — first 10-digit phone in the Client/Account section
  // Prefer one that appears near the practice address block, not the
  // patient's phone further down.
  const idxAccount = full.search(/(?:Account Name|Client Name|Practice Name|Ordering Practitioner Name|Client\s*\/\s*Ordering Site)/i);
  const idxPatient = full.search(/Patient\s*(?:Information|Name)/i);
  if (idxAccount >= 0) {
    const windowText = full.substring(idxAccount, idxPatient > idxAccount ? idxPatient : idxAccount + 600);
    const mPhone = windowText.match(/Phone\s*:?\s*(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
    if (mPhone) out.officePhone = mPhone[1].trim();
  }

  // Ordering physician
  const mPhys = full.match(/Ordering Physician\s*:?\s*([^\n]{3,80})/i)
    || full.match(/Physician Name\s*:?\s*([^\n]{3,80})/i)
    || full.match(/Physician\s*:?\s*([A-Z][A-Za-z .,'-]{3,80})/);
  if (mPhys) out.orderingPhysician = mPhys[1].trim();

  // NPI — 10-digit number, usually on its own line
  const mNpi = full.match(/NPI\s*:?\s*(\d{10})/i);
  if (mNpi) out.npi = mNpi[1];

  return out;
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Known fasting panels — keyword SAFETY NET behind the Claude prep
// determination (see prompt item 8). Mirror phlebHelpers.ts so detection
// stays consistent. 2026-07-07 audit changes:
//   - REMOVED HbA1c — A1c does not require fasting; it was making
//     A1c-only patients fast for nothing.
//   - ADDED Insulin / Triglycerides / Homocysteine / Iron / TIBC /
//     Glucose Tolerance — common fasting-preferred tests that real prod
//     orders contained unmatched ("Fasting: Y" + INSULIN order missed).
const FASTING_PANELS = [
  'Lipid Panel', 'Cholesterol', 'CMP', 'Comprehensive Metabolic Panel',
  'BMP', 'Basic Metabolic Panel', 'Glucose', 'Fasting Glucose',
  'Insulin', 'Lactic Acid', 'Triglyceride', 'Homocysteine',
  'Iron', 'TIBC', 'Glucose Tolerance',
];

// Glucose-tolerance (GTT) detection — the visit needs a glucola drink and a
// 2-3 hour window, so schedule + phleb prep must know. Scanned against
// panels + full text alongside the Claude prep determination.
const GTT_RE = /glucose\s*tolerance|\bgtt\b|\bogtt\b|glucola|\b(1|2|3)[\s-]*(hr|hour)\s*glucose\b/i;

// Tests that require a URINE specimen. When any of these appear, the patient
// must collect a sample on the day of the visit and the phleb brings a sterile
// container — surfaced on the upload confirmation + the night-before reminder.
const URINE_PANELS = [
  'Urinalysis', 'Urine Analysis', ' UA ', 'U/A', 'Urine Culture',
  'Microalbumin', 'Urine Microalbumin', 'Albumin/Creatinine', 'Albumin Creatinine Ratio',
  'Urine Protein', 'Urine hCG', 'Urine Drug', 'Urine Tox', 'Urinary',
  'Random Urine', '24 Hour Urine', '24-Hour Urine', 'Urine Pregnancy',
];

async function downloadFile(path: string): Promise<{ data: Uint8Array; mediaType: string } | null> {
  try {
    const { data, error } = await supabase.storage.from('lab-orders').download(path);
    if (error || !data) return null;
    const buf = new Uint8Array(await data.arrayBuffer());
    const lower = path.toLowerCase();
    let mediaType = 'image/jpeg';
    if (lower.endsWith('.png')) mediaType = 'image/png';
    else if (lower.endsWith('.gif')) mediaType = 'image/gif';
    else if (lower.endsWith('.webp')) mediaType = 'image/webp';
    else if (lower.endsWith('.pdf')) mediaType = 'application/pdf';
    else if (lower.endsWith('.heic')) mediaType = 'image/heic'; // Claude can't read HEIC directly
    return { data: buf, mediaType };
  } catch (e) {
    console.error('[ocr] download error', e);
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

interface OcrExtraction {
  text: string;
  panels: string[];
  insurance: {
    provider?: string | null;
    memberId?: string | null;
    groupNumber?: string | null;
  } | null;
  // Hormozi partnership flywheel — Claude returns the provider/practice
  // block as structured JSON. Replaces the regex-only extractProviderBlock
  // path that silently failed on Quest e-scripts (Justin Porter case
  // 2026-05-05) where the OCR prompt didn't ask Claude to transcribe the
  // header — so the regex had nothing to match against.
  practice: {
    practiceName?: string | null;
    orderingPhysician?: string | null;
    addressStreet?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
    addressZip?: string | null;
    officePhone?: string | null;
    email?: string | null;
    npi?: string | null;
  } | null;
  // Patient demographics extracted from the order. DOB on the form is the
  // canonical source of truth (per the doctor's office). Used to backfill
  // tenant_patients.date_of_birth + patient_lab_requests.patient_dob when
  // missing — closes the "no DOB on file" HIPAA-gate lockout. (Michael
  // Percopo case 2026-05-07.)
  patient: {
    fullName?: string | null;
    dateOfBirth?: string | null;   // YYYY-MM-DD
    phone?: string | null;
    sex?: string | null;
  } | null;
  // Billing designation on the order. Drives whether we collect patient
  // insurance. 'client_bill' / prepaid labs (Evexia / Access Medical Labs /
  // Ulta Lab Tests) mean the test is already paid for — the lab will NOT bill
  // the patient's insurance, so we must not require it. Mirrors the shared
  // frontend helper src/lib/clientBillLabs.ts — keep the two in sync.
  billType?: 'client_bill' | 'insurance' | 'self_pay' | null;
  labCompany?: string | null;   // destination lab company (Quest / LabCorp / Evexia / Access Medical Labs / Ulta Lab Tests / Genova / ...)
  // PREP REQUIREMENTS — Claude's holistic read of the form (checkboxes,
  // "Fasting: Y", "NON-FASTING" negations, specimen-requirement blocks).
  // 'yes' | 'no' | 'unclear'. This is the PRIMARY fasting signal; the
  // FASTING_PANELS keyword list is the safety net. (2026-07-07 audit —
  // 19/152 recent orders said "fasting" in the text but the panels-only
  // keyword scan missed them, and the MMS auto-reply told those patients
  // "no fasting needed".)
  prep?: {
    fasting?: 'yes' | 'no' | 'unclear' | null;
    urine?: 'yes' | 'no' | 'unclear' | null;
    gtt?: 'yes' | 'no' | 'unclear' | null;
  } | null;
}

// ─── Client-bill / prepaid detection (server mirror of clientBillLabs.ts) ───
// Cannot import the src/ helper into a Deno function, so the logic lives here
// too. If you change one, change both.
function ocrNormalizeLabCompany(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (/\bevexia\b/.test(s)) return 'evexia';
  if (/access\s*medical\s*lab(orator(y|ies))?s?/.test(s)) return 'access-medical-labs';
  if (/\bult[ar]\s*lab(\s*tests)?\b/.test(s)) return 'ulta-lab-tests';
  return null;
}
function ocrIsClientBillText(text?: string | null): boolean {
  if (!text) return false;
  return /\bclient[\s-]*bill(ed|ing)?\b/i.test(text) || /\bbill\s*(to\s*)?client\b/i.test(text);
}
function ocrDeriveClientBilled(r: { billType?: string | null; labCompany?: string | null; text?: string | null }): boolean {
  if (r.billType === 'client_bill') return true;
  if (ocrNormalizeLabCompany(r.labCompany)) return true;
  if (ocrIsClientBillText(r.text)) return true;
  return false;
}

async function runClaudeVisionOcr(base64: string, mediaType: string): Promise<OcrExtraction | { error: string }> {
  if (!ANTHROPIC_API_KEY) {
    console.error('[ocr] ANTHROPIC_API_KEY not set');
    return { error: 'ANTHROPIC_API_KEY not configured on edge function' };
  }

  // Claude accepts PDFs via its native document source format (beta)
  const isPdf = mediaType === 'application/pdf';
  const sourceBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  const body = {
    // Model history:
    //   • 'claude-sonnet-4-5'           — bare alias, bounced by Cloudflare (403)
    //   • 'claude-3-5-sonnet-20241022'  — Anthropic deprecated → 404 not_found_error
    //   • 'claude-3-7-sonnet-20250219'  — also 404 on this API key tier
    //   • 'claude-sonnet-4-20250514'    — now 404 not_found_error (4.0-gen ID
    //     retired). Root cause of the "second lab order = OCR failed" reports
    //     (e.g. Lauren Van Pelt) — every fresh OCR call 404'd. (2026-06-18)
    //   • 'claude-sonnet-4-6'           — current Sonnet 4.6, vision-capable.
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: [
        sourceBlock,
        {
          type: 'text',
          text: [
            'This is a medical lab order / test requisition.',
            '',
            'Extract FIVE things:',
            '1. A plain-text transcription of ALL ordered tests, panels, CPT codes, and special instructions (especially fasting requirements).',
            '2. A structured list of the panels/tests ordered. Normalize names to their common abbreviation when obvious (e.g. "Comprehensive Metabolic Panel" → "CMP").',
            '3. The patient\'s insurance information IF present on the form. Look for boxes/sections labeled "Insurance", "Carrier", "Member ID", "Group #", "Subscriber ID", "Policy #". Return the carrier name (e.g. "Aetna", "BCBS Florida", "United Healthcare", "Medicare", "Self-Pay"), the member/subscriber ID, and the group number. If the form says "Self-Pay" or "Cash", return provider="Self-Pay" with empty IDs. If no insurance section is present, return null.',
            '4. The ORDERING PROVIDER / PRACTICE block. This is usually at the top of the form (Quest, LabCorp, Genova) or in a "Client/Account" / "Ordering Site" / "Ordering Physician" section. Extract:',
            '   - practiceName: the clinic/practice/medical group name (e.g. "Functional Wellness PLLC", "Restoration Place"). NOT the lab company (Quest/LabCorp/Genova) — that\'s the destination, not the practice.',
            '   - orderingPhysician: the doctor\'s full name as written (e.g. "Anna Martinez MD", "Cristelle Renta NP-C").',
            '   - addressStreet, addressCity, addressState, addressZip: the practice\'s street + city/state/zip.',
            '   - officePhone: the practice\'s phone (NOT the lab company\'s phone, NOT the patient\'s phone).',
            '   - email: the practice\'s contact email if visible (often near phone or in footer).',
            '   - npi: the 10-digit NPI number if shown.',
            '   If the form is a Quest e-script / Quanum order, the practice block may be on a separate header strip — look carefully. If genuinely absent, return practice: null.',
            '5. The PATIENT demographic block. Look for sections labeled "Patient", "Patient Name", "DOB", "Date of Birth", "Sex/Gender". Extract:',
            '   - fullName: patient\'s full name as written (e.g. "John Smith", "Smith, John")',
            '   - dateOfBirth: patient\'s date of birth in YYYY-MM-DD format. The form often shows MM/DD/YYYY or DD-MMM-YYYY — convert to YYYY-MM-DD. If only 2-digit year, assume 19YY for years > 25, 20YY otherwise. NEVER guess; only return DOB if explicitly visible on the form.',
            '   - phone: patient\'s phone if listed (NOT practice phone, NOT lab phone)',
            '   - sex: patient\'s sex/gender if shown (M, F, or other)',
            '   If the form genuinely has no patient block (rare), return patient: null.',
            '6. The BILLING designation. Look for how the order will be paid: a checkbox or label such as "Client Bill" / "Bill Client" / "Client Billed", "Bill Insurance" / "Third Party", or "Patient Bill" / "Self-Pay" / "Cash". Return billType as EXACTLY one of: "client_bill" (the ordering practice/lab is billed directly — patient insurance is NOT used), "insurance" (bill the patient\'s insurance), "self_pay" (patient pays cash), or null if not indicated.',
            '7. The DESTINATION LAB COMPANY — the laboratory that will RUN the tests (NOT the ordering practice). Common values: "Quest", "LabCorp", "Genova", "Evexia", "Access Medical Labs", "Ulta Lab Tests", "AdventHealth". Return labCompany as the lab name, or null if not shown. NOTE: Evexia, Access Medical Labs, and Ulta Lab Tests are prepaid functional-medicine labs — orders for them are always client-billed.',
            '8. PREP REQUIREMENTS — read the WHOLE form (checkboxes, "Specimen Requirements" blocks, handwritten notes, test names) and determine:',
            '   - fasting: does this order require the patient to fast before the draw? "yes" if the form explicitly indicates fasting (e.g. "FASTING", "Fasting: Y", a checked ☑ Fasting box, "12 hr fast", "NPO") OR the ordered tests conventionally require fasting (fasting glucose, fasting insulin, fasting lipids). "no" if the form EXPLICITLY says non-fasting (e.g. a checked ☑ NON-FASTING box, "Fasting: N", "non-fasting acceptable", "random/fasting does not matter"). "unclear" if the form gives no indication either way. IMPORTANT: an UNCHECKED "☐ NON-FASTING" checkbox is NOT a "no" — only a checked/circled/selected marking counts. HbA1c alone does NOT require fasting.',
            '   - urine: does this order include any urine specimen (urinalysis, UA, urine culture, microalbumin, 24-hour urine, first morning void)? "yes" / "no" / "unclear".',
            '   - gtt: does this order include a glucose tolerance test (GTT/OGTT, glucola, 1/2/3-hour glucose)? "yes" / "no" / "unclear".',
            '',
            'Reply ONLY with valid JSON in this exact shape, no prose:',
            '{"text": "<full transcription>", "panels": ["CMP", "Lipid Panel"], "insurance": {"provider": "Aetna", "memberId": "W123456789", "groupNumber": "12345"}, "practice": {"practiceName": "Functional Wellness PLLC", "orderingPhysician": "Anna Martinez MD", "addressStreet": "123 Main St", "addressCity": "Orlando", "addressState": "FL", "addressZip": "32801", "officePhone": "(407) 555-1234", "email": "info@functionalwellness.com", "npi": "1234567890"}, "patient": {"fullName": "John Smith", "dateOfBirth": "1969-07-12", "phone": "(407) 555-9876", "sex": "M"}, "billType": "client_bill", "labCompany": "Access Medical Labs", "prep": {"fasting": "yes", "urine": "no", "gtt": "no"}}',
            '',
            'If no insurance is on the form, set "insurance": null. If no practice block is visible, set "practice": null. If patient demographics are absent (rare), set "patient": null. If billing is not indicated, set "billType": null. If the destination lab is not shown, set "labCompany": null.',
            'If the image is unreadable, reply: {"text": "", "panels": [], "insurance": null, "practice": null, "patient": null, "billType": null, "labCompany": null, "prep": null}',
          ].join('\n'),
        },
      ],
    }],
  };

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        // PDF document support requires the beta flag; harmless for images
        'anthropic-beta': 'pdfs-2024-09-25',
        // Explicit User-Agent — Cloudflare in front of api.anthropic.com
        // sometimes challenges default Deno fetch UAs with a JS page.
        'User-Agent': 'ConveLabs-OCR/1.0 (Supabase Edge Function)',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      console.error('[ocr] anthropic error', resp.status, errTxt.substring(0, 300));
      return { error: `Anthropic API ${resp.status}: ${errTxt.substring(0, 200)}` };
    }

    const json = await resp.json();
    const content = json?.content?.[0]?.text || '';
    // Claude may wrap JSON in prose or code blocks — extract the JSON object
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { text: content, panels: [], insurance: null, practice: null, patient: null, billType: null, labCompany: null, prep: null };
    try {
      const parsed = JSON.parse(match[0]);
      const text = String(parsed.text || '').substring(0, 8000);
      const panels = Array.isArray(parsed.panels) ? parsed.panels.slice(0, 40).map((p: any) => String(p).substring(0, 80)) : [];
      // Insurance is optional — only return a non-null block if Claude found a real carrier
      let insurance: OcrExtraction['insurance'] = null;
      if (parsed.insurance && typeof parsed.insurance === 'object') {
        const provider = parsed.insurance.provider ? String(parsed.insurance.provider).trim().substring(0, 80) : null;
        const memberId = parsed.insurance.memberId ? String(parsed.insurance.memberId).trim().substring(0, 80) : null;
        const groupNumber = parsed.insurance.groupNumber ? String(parsed.insurance.groupNumber).trim().substring(0, 80) : null;
        // Treat empty / "null" / "n/a" strings as no-insurance-detected
        const looksReal = provider && !/^(none|n\/a|null|n a|—|-)$/i.test(provider);
        if (looksReal) insurance = { provider, memberId, groupNumber };
      }
      // Practice block — keep nulls when Claude returned them so the
      // consumer can fall back to the regex parser without ambiguity.
      let practice: OcrExtraction['practice'] = null;
      if (parsed.practice && typeof parsed.practice === 'object') {
        const trim = (v: any, n: number) => v == null ? null : String(v).trim().substring(0, n) || null;
        practice = {
          practiceName: trim(parsed.practice.practiceName, 120),
          orderingPhysician: trim(parsed.practice.orderingPhysician, 120),
          addressStreet: trim(parsed.practice.addressStreet, 200),
          addressCity: trim(parsed.practice.addressCity, 80),
          addressState: trim(parsed.practice.addressState, 4),
          addressZip: trim(parsed.practice.addressZip, 12),
          officePhone: trim(parsed.practice.officePhone, 30),
          email: parsed.practice.email ? String(parsed.practice.email).trim().toLowerCase().substring(0, 120) : null,
          npi: parsed.practice.npi ? String(parsed.practice.npi).replace(/\D/g, '').substring(0, 10) : null,
        };
        // Treat all-null as null (no practice block)
        if (Object.values(practice).every(v => !v)) practice = null;
      }
      // Patient demographics block — DOB is the high-leverage field
      // (closes the HIPAA-gate "no DOB on file" lockout). Only accept a
      // YYYY-MM-DD-shaped string; reject anything else so a malformed OCR
      // can't wedge the date column.
      let patient: OcrExtraction['patient'] = null;
      if (parsed.patient && typeof parsed.patient === 'object') {
        const trim = (v: any, n: number) => v == null ? null : String(v).trim().substring(0, n) || null;
        const rawDob = parsed.patient.dateOfBirth ? String(parsed.patient.dateOfBirth).trim() : null;
        const dob = rawDob && /^\d{4}-\d{2}-\d{2}$/.test(rawDob) ? rawDob : null;
        const sexRaw = trim(parsed.patient.sex, 16);
        const sex = sexRaw ? sexRaw.charAt(0).toUpperCase() : null; // 'M' / 'F'
        patient = {
          fullName: trim(parsed.patient.fullName, 120),
          dateOfBirth: dob,
          phone: parsed.patient.phone ? String(parsed.patient.phone).replace(/[^\d+]/g, '').substring(0, 20) : null,
          sex,
        };
        // Treat all-null as null
        if (Object.values(patient).every(v => !v)) patient = null;
      }
      // Billing designation + destination lab company
      const rawBill = parsed.billType ? String(parsed.billType).trim().toLowerCase() : null;
      const billType: OcrExtraction['billType'] =
        rawBill === 'client_bill' || rawBill === 'insurance' || rawBill === 'self_pay' ? rawBill : null;
      const labCompany = parsed.labCompany ? String(parsed.labCompany).trim().substring(0, 80) || null : null;
      // Prep requirements — normalize each field to 'yes'|'no'|'unclear'|null.
      let prep: OcrExtraction['prep'] = null;
      if (parsed.prep && typeof parsed.prep === 'object') {
        const norm = (v: any): 'yes' | 'no' | 'unclear' | null => {
          const s = String(v || '').trim().toLowerCase();
          return s === 'yes' || s === 'no' || s === 'unclear' ? s : null;
        };
        prep = {
          fasting: norm(parsed.prep.fasting),
          urine: norm(parsed.prep.urine),
          gtt: norm(parsed.prep.gtt),
        };
        if (!prep.fasting && !prep.urine && !prep.gtt) prep = null;
      }
      return { text, panels, insurance, practice, patient, billType, labCompany, prep };
    } catch {
      return { text: content.substring(0, 8000), panels: [], insurance: null, practice: null, patient: null, billType: null, labCompany: null, prep: null };
    }
  } catch (e: any) {
    console.error('[ocr] request exception', e);
    return { error: `Exception: ${e?.message || String(e)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { appointmentId, filePath: bareFilePath, labOrderId, notifyPatientSms } = body || {};

    let filePath: string | null = bareFilePath || null;
    let targetId: string | null = appointmentId || null;
    let labOrderRowId: string | null = labOrderId || null;

    // MODE 1 — labOrderId: run OCR on a specific row in appointment_lab_orders
    //          (preferred path for the Hormozi upload flow — one row per file).
    if (labOrderRowId) {
      const { data: row } = await supabase
        .from('appointment_lab_orders')
        .select('id, appointment_id, file_path, ocr_status')
        .eq('id', labOrderRowId)
        .maybeSingle();
      if (!row) {
        return new Response(JSON.stringify({ error: 'Lab order row not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      filePath = row.file_path;
      targetId = row.appointment_id;
      // Mark as running so the UI poll reflects state
      await supabase.from('appointment_lab_orders')
        .update({ ocr_status: 'running' }).eq('id', labOrderRowId);
    }
    // MODE 2 — appointmentId: loop every pending row on the appointment
    //          (covers re-OCR + legacy comma-split backfill).
    else if (appointmentId) {
      const { data: pending } = await supabase
        .from('appointment_lab_orders')
        .select('id, file_path')
        .eq('appointment_id', appointmentId)
        .in('ocr_status', ['pending', 'running'])
        .is('deleted_at', null);
      if (pending && pending.length > 0) {
        // Recurse into ourselves for each pending row (fire-and-forget is fine
        // since the UI polls the table for status changes).
        const results: any[] = [];
        for (const r of pending) {
          const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ocr-lab-order`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ labOrderId: r.id }),
          });
          results.push({ id: r.id, status: resp.status });
        }
        return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Back-compat: fall through to legacy comma-split path
      const { data: appt } = await supabase
        .from('appointments')
        .select('id, lab_order_file_path, ocr_processed_at')
        .eq('id', appointmentId)
        .maybeSingle();
      if (!appt) {
        return new Response(JSON.stringify({ error: 'Appointment not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!appt.lab_order_file_path) {
        return new Response(JSON.stringify({ ok: true, skipped: 'no_lab_order_file' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      filePath = String(appt.lab_order_file_path).split(',')[0].trim();
      targetId = appt.id;
    }

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'filePath, labOrderId, or appointmentId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const downloaded = await downloadFile(filePath);
    if (!downloaded) {
      return new Response(JSON.stringify({ error: 'Could not download lab order file' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // HEIC isn't processable by Claude directly
    if (downloaded.mediaType === 'image/heic') {
      return new Response(JSON.stringify({
        ok: false, skipped: 'heic_unsupported',
        hint: 'HEIC format cannot be OCR-processed. Ask patient to re-upload as JPG or PDF.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5 MB hard cap on Anthropic Vision API. Client-side resize handles most
    // cases (src/lib/imageResize.ts) but if a stale-bundle browser or a HEIC
    // file with strange size slipped through, surface a clear actionable
    // error rather than the cryptic 400 from upstream.
    if (downloaded.data.byteLength > 5 * 1024 * 1024) {
      const friendly = `Image is ${(downloaded.data.byteLength / 1024 / 1024).toFixed(1)} MB — Anthropic OCR caps at 5 MB. Re-upload as a smaller photo or a PDF.`;
      if (labOrderRowId) {
        await supabase.from('appointment_lab_orders').update({
          ocr_status: 'failed',
          ocr_error: friendly,
          ocr_completed_at: new Date().toISOString(),
        }).eq('id', labOrderRowId);
      }
      return new Response(JSON.stringify({ error: 'image_too_large', hint: friendly }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const base64 = bytesToBase64(downloaded.data);
    const result = await runClaudeVisionOcr(base64, downloaded.mediaType);

    if (!result || 'error' in result) {
      // If we're processing a specific row, mark it failed so the UI stops polling
      if (labOrderRowId) {
        await supabase.from('appointment_lab_orders').update({
          ocr_status: 'failed',
          ocr_error: (result as any)?.error || 'unknown',
          ocr_completed_at: new Date().toISOString(),
        }).eq('id', labOrderRowId);
      }
      return new Response(JSON.stringify({
        error: 'OCR engine failed',
        detail: (result as any)?.error || 'unknown',
        filePath,
        mediaType: downloaded.mediaType,
        sizeBytes: downloaded.data.byteLength,
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── PREP DETERMINATION (fasting / urine / GTT) ───────────────────
    // PRIMARY signal: Claude's holistic read of the form (prompt item 8) —
    // it handles "Fasting: Y", checked ☑ FASTING / ☑ NON-FASTING boxes,
    // "non-fasting acceptable", and specimen-requirement blocks that the
    // panel keyword list can't. SAFETY NET: the FASTING_PANELS keyword
    // scan still forces fasting=true on classic fasting panels — UNLESS
    // the form EXPLICITLY said non-fasting (prep.fasting === 'no'), in
    // which case the doctor's explicit instruction wins.
    // (2026-07-07 audit: panels-only scan missed 'Fasting: Y'/'FASTING
    // required' orders and the MMS auto-reply told those patients "no
    // fasting needed". HbA1c false-positives made others fast for nothing.)
    const prep = result.prep || null;
    const panelFasting = result.panels.some(p =>
      FASTING_PANELS.some(fp => p.toLowerCase().includes(fp.toLowerCase()))
    );
    const fastingDetected = prep?.fasting === 'yes' || (panelFasting && prep?.fasting !== 'no');

    // Urine-specimen detection — scan both the structured panels AND the full
    // OCR text (some requisitions only show "UA" inline). Pad the haystack so
    // the " UA " / "U/A" tokens match at string boundaries without false hits
    // inside words like "evaluation". Claude's prep.urine OR-folds in.
    const urineHay = ` ${[...result.panels, result.text || ''].join(' | ')} `.toLowerCase();
    const urineDetected = prep?.urine === 'yes'
      || URINE_PANELS.some(u => urineHay.includes(u.toLowerCase()));

    // Glucose-tolerance detection — previously returned in the response but
    // NEVER computed (always false), so provider lab requests never knew a
    // visit needed the 2-3 hour glucola window. Claude prep OR keyword.
    const gttDetected = prep?.gtt === 'yes' || GTT_RE.test(urineHay);

    // ─── CLIENT-BILL / PREPAID DETECTION ──────────────────────────────
    // Evexia / Access Medical Labs / Ulta Lab Tests are prepaid functional-
    // medicine labs, OR the order is explicitly marked "Client Bill". In any
    // of these cases the lab won't bill the patient's insurance, so the
    // patient-facing surfaces must NOT ask for it.
    const clientBilled = ocrDeriveClientBilled({
      billType: result.billType,
      labCompany: result.labCompany,
      text: result.text,
    });
    // Normalize bill_type for storage: if we know it's prepaid by lab company
    // but Claude didn't tag billType, record 'client_bill'.
    const storedBillType: string | null =
      result.billType || (clientBilled ? 'client_bill' : null);

    // Persist the OCR result. Row-scoped if we came via labOrderId; otherwise
    // the legacy appointment-level columns.
    const insuranceUpdate = result.insurance
      ? {
          ocr_insurance_provider: result.insurance.provider || null,
          ocr_insurance_member_id: result.insurance.memberId || null,
          ocr_insurance_group_number: result.insurance.groupNumber || null,
        }
      : { ocr_insurance_provider: null, ocr_insurance_member_id: null, ocr_insurance_group_number: null };

    if (labOrderRowId) {
      await supabase.from('appointment_lab_orders').update({
        ocr_status: 'complete',
        ocr_detected_panels: result.panels,
        ocr_full_text: result.text,
        ocr_fasting_required: fastingDetected,
        ocr_urine_required: urineDetected,
        ocr_gtt_required: gttDetected,
        ocr_completed_at: new Date().toISOString(),
        // Persist the OCR'd patient identity so the card + NIIMBOT labels can
        // show the name/DOB even when there's no chart row (e.g. org-billed
        // visits with no patient_id). Previously extracted but never stored.
        ...(result.patient?.fullName ? { ocr_patient_name: result.patient.fullName } : {}),
        ...(result.patient?.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(result.patient.dateOfBirth)
          ? { ocr_patient_dob: result.patient.dateOfBirth } : {}),
        ...insuranceUpdate,
        // Client-bill / prepaid flags — drive the "no insurance needed" UI.
        // Only write a POSITIVE signal; never downgrade an existing client_bill
        // (e.g. admin/patient already declared it) on an inconclusive scan.
        ...(clientBilled ? { bill_type: storedBillType, is_client_billed: true }
            : storedBillType ? { bill_type: storedBillType } : {}),
        ...(result.labCompany ? { delivery_lab_name: result.labCompany } : {}),
      }).eq('id', labOrderRowId);

      // ─── MIRROR TO PARENT APPOINTMENT ─────────────────────────────
      // The labOrderId path used to skip updating the parent appointments
      // row, so downstream code (booking-flow fasting banner, admin
      // reports, phleb visit prep) never saw the OCR'd panels. Now we
      // pull every COMPLETE lab order on this appointment, merge their
      // panels, and write the union back to appointments.lab_order_panels
      // + lab_order_ocr_text + ocr_processed_at. Also OR-folds fasting
      // detection across every order — if ANY one says fasting, the
      // whole visit needs fasting.
      if (targetId) {
        try {
          const { data: allOrders } = await supabase
            .from('appointment_lab_orders')
            .select('ocr_detected_panels, ocr_full_text, ocr_fasting_required, ocr_urine_required, ocr_gtt_required')
            .eq('appointment_id', targetId)
            .eq('ocr_status', 'complete');
          const merged = new Set<string>();
          let mergedText = '';
          let mergedFasting = false;
          let mergedUrine = false;
          let mergedGtt = false;
          for (const o of (allOrders || []) as any[]) {
            for (const p of (o.ocr_detected_panels || [])) merged.add(String(p));
            if (o.ocr_full_text) mergedText += (mergedText ? '\n\n---\n\n' : '') + o.ocr_full_text;
            if (o.ocr_fasting_required) mergedFasting = true;
            if (o.ocr_urine_required) mergedUrine = true;
            if (o.ocr_gtt_required) mergedGtt = true;
          }
          // Include this row's results even if it isn't yet flushed into the
          // SELECT above (race window).
          for (const p of (result.panels || [])) merged.add(String(p));
          if (result.text && !mergedText.includes(result.text)) {
            mergedText += (mergedText ? '\n\n---\n\n' : '') + result.text;
          }
          mergedFasting = mergedFasting || fastingDetected;
          mergedUrine = mergedUrine || urineDetected;
          mergedGtt = mergedGtt || gttDetected;

          // Backfill the patient identity onto the appointment from the order:
          //   • name  — only if the appointment has no name (the "unknown
          //             patient" card: org orders booked without a name)
          //   • DOB   — only if not already set (so the card + NIIMBOT labels
          //             always show a DOB once a lab order is uploaded)
          // Never overwrite a name/DOB an admin/patient already provided.
          const { data: apptRow } = await supabase
            .from('appointments').select('patient_name, patient_dob, patient_id, patient_email, tenant_id').eq('id', targetId).maybeSingle();
          const apptName = String((apptRow as any)?.patient_name || '').trim();
          const ocrName = String(result.patient?.fullName || '').trim();
          const ocrDob = result.patient?.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(result.patient.dateOfBirth) ? result.patient.dateOfBirth : null;
          const filledNameFromOcr = !apptName && !!ocrName;

          await supabase.from('appointments').update({
            lab_order_panels: Array.from(merged),
            lab_order_ocr_text: mergedText.substring(0, 50000),
            ocr_processed_at: new Date().toISOString(),
            // If fasting/urine was detected, surface it on the appointment so
            // the upload confirmation + night-before reminder fire. We only
            // ever set TRUE here — never downgrade an admin-set flag.
            ...(mergedFasting ? { fasting_required: true } : {}),
            ...(mergedUrine ? { urine_required: true } : {}),
            ...(mergedGtt ? { gtt_required: true } : {}),
            ...(filledNameFromOcr ? { patient_name: ocrName, ocr_name_unverified: true } : {}),
            ...((!(apptRow as any)?.patient_dob && ocrDob) ? { patient_dob: ocrDob } : {}),
          }).eq('id', targetId);

          // Ensure a searchable patient chart record exists for lab-order-only
          // visits (no patient_id yet) so they appear in patient search — the
          // Angela Mendelsohn gap. Keyed on the appointment email (reliable);
          // the OCR name is provisional (ocr_name_unverified above flags it for
          // a human to confirm, since OCR can misread, e.g. Mendelsohn→Madison).
          if (!(apptRow as any)?.patient_id) {
            const email = String((apptRow as any)?.patient_email || '').trim();
            const nameForRecord = apptName || ocrName;
            if (email || nameForRecord) {
              // Split "Last, First" or "First Last" into first/last.
              let pf: string | null = null, pl: string | null = null;
              if (nameForRecord.includes(',')) {
                const [l, f] = nameForRecord.split(',', 2);
                pf = (f || '').trim() || null; pl = (l || '').trim() || null;
              } else {
                const parts = nameForRecord.split(/\s+/).filter(Boolean);
                pf = parts[0] || null; pl = parts.slice(1).join(' ') || null;
              }
              try {
                const { data: ensuredId } = await supabase.rpc('get_or_create_tenant_patient' as any, {
                  p_email: email || null, p_first: pf, p_last: pl, p_phone: null,
                  p_dob: ocrDob, p_tenant_id: (apptRow as any)?.tenant_id || null, p_user_id: null,
                });
                if (ensuredId) await supabase.from('appointments').update({ patient_id: ensuredId }).eq('id', targetId);
              } catch (linkErr) { console.warn('[ocr->ensure-patient] failed (non-blocking):', linkErr); }
            }
          }
        } catch (mirrorErr) {
          console.warn('[ocr->appointment-mirror] failed (non-blocking):', mirrorErr);
        }
      }
    } else if (targetId) {
      // Legacy appointment-level path (MODE 2 — appointmentId with no
      // appointment_lab_orders row, e.g. lab_order_file_path OCR + the MMS
      // path). BUG FIX (2026-07-07): this branch never stamped the prep
      // flags, so a fasting order OCR'd here got the correct MMS reply but
      // the appointment stayed fasting_required=false and the night-before
      // reminder never fired. One-way TRUE, same as the mirror path.
      await supabase.from('appointments').update({
        lab_order_ocr_text: result.text,
        lab_order_panels: result.panels,
        ocr_processed_at: new Date().toISOString(),
        ...(fastingDetected ? { fasting_required: true } : {}),
        ...(urineDetected ? { urine_required: true } : {}),
        ...(gttDetected ? { gtt_required: true } : {}),
      }).eq('id', targetId);
    }

    // ─── PHASE 3: PATIENT FASTING/PREP SMS (SMS concierge MMS path) ───
    // When a patient texts a photo of their lab order they expect to be told
    // whether they need to fast. The MMS path passes notifyPatientSms=true;
    // now that OCR has the determination, text them the prep answer. Only the
    // MMS path sets this flag — web/provider uploads + re-OCR sweeps stay silent.
    if (notifyPatientSms && targetId) {
      try {
        const { data: pa } = await supabase
          .from('appointments')
          .select('patient_phone, patient_name, fasting_required, urine_required')
          .eq('id', targetId).maybeSingle();
        const digits = String((pa as any)?.patient_phone || '').replace(/\D/g, '');
        const TS = Deno.env.get('TWILIO_ACCOUNT_SID') || '', TT = Deno.env.get('TWILIO_AUTH_TOKEN') || '', TF = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
        if (digits && TS && TT && TF) {
          const fasts = fastingDetected || !!(pa as any)?.fasting_required;
          const urine = urineDetected || !!(pa as any)?.urine_required;
          const first = String((pa as any)?.patient_name || '').split(' ')[0];
          const hi = first ? `${first}, ` : '';
          let msg = fasts
            ? `${hi}your lab order is on file ✓ Based on your order, please FAST 8–12 hours before your draw — water and any prescribed medications are fine.`
            : `${hi}your lab order is on file ✓ No fasting needed based on your order — eat and drink normally before your visit.`;
          if (urine) msg += ` You'll also give a urine sample, so please don't use the restroom right before we arrive.`;
          if (gttDetected) msg += ` Your order includes a glucose tolerance test — plan for a 2-3 hour visit.`;
          msg += ` Questions? Just reply here. — ConveLabs`;
          const to = digits.length === 10 ? `+1${digits}` : `+${digits}`;
          const p = new URLSearchParams({ To: to, From: TF, Body: msg });
          const scb = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-status-callback`;
          if (scb.startsWith('http')) p.append('StatusCallback', scb);
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TS}/Messages.json`, {
            method: 'POST',
            headers: { Authorization: `Basic ${btoa(`${TS}:${TT}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: p.toString(),
          });
        }
      } catch (e) { console.warn('[ocr->fasting-sms] non-blocking:', (e as any)?.message); }
    }

    // ─── PATIENT DOB BACKFILL ─────────────────────────────────────
    // OCR pulled the DOB off the doctor's order — that's the canonical
    // source per the practice's records. If the patient's chart
    // (tenant_patients OR patient_lab_requests OR appointments.patient_dob
    // when present) is missing DOB, write it now. Never overwrite an
    // existing DOB — admin/patient may have entered a corrected value.
    //
    // Hormozi: "Capture once, persist everywhere." The DOB on the lab
    // order is free data we already pay to extract — let it close the
    // HIPAA-gate lockout that blocked Michael Percopo from booking
    // (2026-05-07).
    if (result.patient?.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(result.patient.dateOfBirth)) {
      const ocrDob = result.patient.dateOfBirth;
      try {
        // Resolve the patient row(s) we should backfill from the appointment
        // tied to this OCR run.
        let patientEmail: string | null = null;

        if (targetId) {
          const { data: appt } = await supabase
            .from('appointments')
            .select('patient_id, patient_email')
            .eq('id', targetId).maybeSingle();
          patientEmail = (appt as any)?.patient_email || null;
          // Also stamp tenant_patients.date_of_birth if patient_id is set + DOB null
          if ((appt as any)?.patient_id) {
            const { data: tp } = await supabase
              .from('tenant_patients')
              .select('id, date_of_birth')
              .eq('id', (appt as any).patient_id).maybeSingle();
            if (tp && !(tp as any).date_of_birth) {
              await supabase.from('tenant_patients')
                .update({ date_of_birth: ocrDob })
                .eq('id', (tp as any).id);
              console.log(`[ocr-dob] tenant_patients[${(tp as any).id}] backfilled date_of_birth=${ocrDob}`);
            }
          }
        }

        // Match by email if we didn't get a direct patient_id hit
        if (patientEmail) {
          const { data: tps } = await supabase
            .from('tenant_patients')
            .select('id, date_of_birth')
            .ilike('email', patientEmail)
            .order('created_at', { ascending: false })
            .limit(1);
          const tp = (tps && tps[0]) || null;
          if (tp && !(tp as any).date_of_birth) {
            await supabase.from('tenant_patients')
              .update({ date_of_birth: ocrDob })
              .eq('id', (tp as any).id);
            console.log(`[ocr-dob] tenant_patients[${(tp as any).id}] (by email) backfilled date_of_birth=${ocrDob}`);
          }
        }

        // The patient_lab_requests path runs OCR via create-lab-request
        // BEFORE the lab_request row exists, so we can't backfill it here —
        // create-lab-request consumes ocr.patient.dateOfBirth from the OCR
        // response and stamps it directly at insert time.
      } catch (dobErr: any) {
        // Non-fatal — OCR result still returns successfully even if backfill
        // fails. Surface the error for admin triage.
        console.warn(`[ocr-dob] backfill failed (non-blocking): ${dobErr?.message || dobErr}`);
      }
    }

    // ─── INSURANCE COMPARE + QUEUE ────────────────────────────────
    // If OCR detected an insurance block, compare to what's stored on
    // tenant_patients. Stamp the alo with insurance_match_status and (when
    // it differs) queue a pending_insurance_changes row so the patient can
    // confirm via dashboard modal. If they had nothing on file, auto-add.
    if (labOrderRowId && targetId) {
      try {
        const matchKey = (s: string | null | undefined) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const ocrIns = result.insurance;

        // Look up the appointment's patient row
        const { data: appt2 } = await supabase
          .from('appointments').select('patient_id, patient_email').eq('id', targetId).maybeSingle();
        let patient: any = null;
        if (appt2?.patient_id) {
          const { data: tp } = await supabase
            .from('tenant_patients')
            .select('id, insurance_provider, insurance_member_id, insurance_group_number')
            .eq('id', appt2.patient_id).maybeSingle();
          if (tp) patient = tp;
        } else if (appt2?.patient_email) {
          const { data: tp } = await supabase
            .from('tenant_patients')
            .select('id, insurance_provider, insurance_member_id, insurance_group_number')
            .ilike('email', appt2.patient_email)
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle();
          if (tp) patient = tp;
        }

        let matchStatus: 'match' | 'differs' | 'extracted_new' | 'none' = 'none';
        if (ocrIns) {
          if (!patient || (!patient.insurance_provider && !patient.insurance_member_id)) {
            matchStatus = 'extracted_new';
            // Auto-add — no friction. Patient never had insurance on file.
            if (patient?.id) {
              await supabase.from('tenant_patients').update({
                insurance_provider: ocrIns.provider || null,
                insurance_member_id: ocrIns.memberId || null,
                insurance_group_number: ocrIns.groupNumber || null,
                updated_at: new Date().toISOString(),
              }).eq('id', patient.id);
            }
          } else {
            const same =
              matchKey(patient.insurance_provider) === matchKey(ocrIns.provider) &&
              matchKey(patient.insurance_member_id) === matchKey(ocrIns.memberId);
            matchStatus = same ? 'match' : 'differs';
            if (matchStatus === 'differs' && patient?.id) {
              // Queue a pending change for the patient to confirm
              await supabase.from('pending_insurance_changes' as any).insert({
                appointment_lab_order_id: labOrderRowId,
                appointment_id: targetId,
                tenant_patient_id: patient.id,
                current_provider: patient.insurance_provider,
                current_member_id: patient.insurance_member_id,
                current_group_number: patient.insurance_group_number,
                proposed_provider: ocrIns.provider || null,
                proposed_member_id: ocrIns.memberId || null,
                proposed_group_number: ocrIns.groupNumber || null,
              }).then(() => {}, (e) => {
                // unique-violation = a pending change for this alo already exists; ignore
                if (!String(e?.code) === '23505') console.warn('[insurance-queue] insert err:', e);
              });
            }
          }
        }
        await supabase.from('appointment_lab_orders').update({
          insurance_match_status: matchStatus,
        }).eq('id', labOrderRowId);
      } catch (e) {
        console.warn('[insurance-pipeline] non-blocking exception:', e);
      }
    }

    // ─── PARTNERSHIP FLYWHEEL ────────────────────────────────────────
    // Parse the ordering provider block from the OCR text and
    // auto-link/discover the practice as an organization. Every lab
    // order is a qualified partnership lead; discover_or_link_provider_org
    // RPC handles fuzzy-match, link, or insert with outreach_status=
    // 'untouched' so the admin beacon surfaces it.
    // Non-blocking — failures here should not break OCR.
    if (targetId && result.text) {
      try {
        // Prefer Claude's structured practice block (added 2026-05-05 to
        // fix Justin Porter case where Quest e-script OCR text had no
        // labeled "Account Name:" / "Ordering Physician:" headers for
        // the regex parser to match against).
        const regexExtracted = extractProviderBlock(result.text);
        const claude = (result as any).practice as OcrExtraction['practice'];
        const extracted: ExtractedProvider = {
          practiceName: claude?.practiceName
            ? normalizePracticeName(String(claude.practiceName).trim())
            : regexExtracted.practiceName,
          orderingPhysician: claude?.orderingPhysician || regexExtracted.orderingPhysician,
          addressStreet: claude?.addressStreet || regexExtracted.addressStreet,
          addressCity: claude?.addressCity || regexExtracted.addressCity,
          addressState: claude?.addressState || regexExtracted.addressState,
          addressZip: claude?.addressZip || regexExtracted.addressZip,
          officePhone: claude?.officePhone || regexExtracted.officePhone,
          npi: claude?.npi || regexExtracted.npi,
        };
        // Email is only on Claude's path — regex extractor doesn't pull it
        const claudeEmail = claude?.email || null;

        // Physician-based fallback: if the practice name is missing or
        // didn't trigger an alias hit, but the ordering physician maps
        // to a canonical practice (e.g. Cristelle Renta → The Restoration
        // Place), use that as the practice name.
        if (extracted.orderingPhysician) {
          for (const alias of PRACTICE_ALIAS_MAP) {
            if (alias.physicianAliases?.some(rx => rx.test(extracted.orderingPhysician!))) {
              const isAlreadyCanonical = extracted.practiceName === alias.canonical;
              if (!isAlreadyCanonical) {
                console.log(`[ocr->org] physician alias: "${extracted.orderingPhysician}" → "${alias.canonical}" (was practice="${extracted.practiceName || 'none'}")`);
                extracted.practiceName = alias.canonical;
              }
              break;
            }
          }
        }

        if (!extracted.practiceName && labOrderRowId) {
          await supabase.from('appointment_lab_orders').update({
            org_match_status: 'unmatched',
            org_match_reason: 'no_provider_block_in_ocr',
          }).eq('id', labOrderRowId);
        }
        // Owner SMS safety net (Justin Porter 2026-05-05): when OCR
        // completes but practice block is empty, the org-extraction path
        // silently no-ops and we never know to call the office. This
        // alert surfaces it so admin can manually retrieve the org info.
        if (!extracted.practiceName && targetId) {
          try {
            const { data: appt } = await supabase
              .from('appointments')
              .select('patient_name')
              .eq('id', targetId)
              .maybeSingle();
            const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID');
            const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN');
            const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
            const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
            if (TWILIO_SID && TWILIO_AUTH) {
              await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
                method: 'POST',
                headers: { Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  To: OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`,
                  Body: `⚠️ OCR couldn't find practice info on ${(appt as any)?.patient_name || 'a patient'}'s lab order. Open admin → calendar → appt → lab order to manually link the org so we can retrieve their email + welcome them.`,
                  From: TWILIO_FROM,
                }).toString(),
              });
            }
          } catch (alertErr) { console.warn('[ocr->org] no-practice alert failed (non-blocking):', alertErr); }
        }
        if (extracted.practiceName) {
          const { data: linkRes } = await supabase.rpc('discover_or_link_provider_org' as any, {
            p_appointment_id: targetId,
            p_practice_name: extracted.practiceName,
            p_address_street: extracted.addressStreet || null,
            p_address_city: extracted.addressCity || null,
            p_address_state: extracted.addressState || null,
            p_address_zip: extracted.addressZip || null,
            p_office_phone: extracted.officePhone || null,
            p_ordering_physician: extracted.orderingPhysician || null,
            p_npi: extracted.npi || null,
            p_ocr_sample: result.text.substring(0, 500),
          });
          console.log(`[ocr->org] ${extracted.practiceName}:`, linkRes);

          // Write the match outcome back to the lab-order row so the phleb
          // upload UI can render a tailored success toast ("Matched to X" vs
          // "New lead created"). Determine action by checking the returned
          // org's discovered_from_ocr flag + recency.
          if (linkRes && (linkRes as any).org_id) {
            const orgId = (linkRes as any).org_id;

            // If Claude extracted an email AND the org row doesn't have one
            // yet, write it now so send_welcome_now can fire below.
            if (claudeEmail) {
              try {
                const { data: existingOrg } = await supabase
                  .from('organizations')
                  .select('contact_email')
                  .eq('id', orgId)
                  .maybeSingle();
                if (!(existingOrg as any)?.contact_email) {
                  await supabase
                    .from('organizations')
                    .update({ contact_email: claudeEmail })
                    .eq('id', orgId);
                  console.log(`[ocr->org] saved Claude-extracted email ${claudeEmail} on org ${orgId}`);
                }
              } catch (emailErr) {
                console.warn('[ocr->org] email write failed (non-blocking):', emailErr);
              }
            }
          }
          if (labOrderRowId && linkRes && (linkRes as any).org_id) {
            const orgId = (linkRes as any).org_id;
            const linkAction = (linkRes as any).action || (linkRes as any).status;
            const linkReason = (linkRes as any).reason || (linkRes as any).match_reason;
            let status: 'matched' | 'auto_created' | 'unmatched' = 'matched';
            let reason: string = linkReason || 'name+zip';
            if (linkAction === 'created' || linkAction === 'auto_created' || linkAction === 'inserted') {
              status = 'auto_created';
              reason = linkReason || 'discovered_from_ocr';
            } else if (!linkAction) {
              // Fallback: query the org row for recency + discovered flag
              const { data: orgCheck } = await supabase
                .from('organizations')
                .select('created_at, discovered_from_ocr, npi')
                .eq('id', orgId)
                .maybeSingle();
              if (orgCheck) {
                const ageMs = Date.now() - new Date((orgCheck as any).created_at).getTime();
                if ((orgCheck as any).discovered_from_ocr && ageMs < 30_000) {
                  status = 'auto_created';
                  reason = 'discovered_from_ocr';
                } else if (extracted.npi && (orgCheck as any).npi === extracted.npi) {
                  reason = 'npi_exact';
                }
              }
            }
            await supabase.from('appointment_lab_orders').update({
              org_match_status: status,
              org_match_reason: reason,
              org_match_organization_id: orgId,
            }).eq('id', labOrderRowId);

            // FIRST-DETECTION AUTO-WELCOME (Hormozi partnership flywheel)
            // When OCR auto-creates an org AND we have an email for it,
            // fire the welcome email immediately — no admin touch required.
            // The org-outreach-action fn no-ops if no email is on file,
            // so this hook is safe regardless of OCR completeness.
            if (status === 'auto_created') {
              try {
                await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/org-outreach-action`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    organizationId: orgId,
                    action: 'send_welcome_now',
                    sourceLabOrderId: labOrderRowId,
                  }),
                });
              } catch (welcomeErr) {
                console.warn('[ocr->org] auto-welcome invoke failed (non-blocking):', welcomeErr);
              }
            }

            // FIRST-DETECTION OWNER ALERT
            // When OCR auto-creates a brand-new org, page the owner once so
            // they can fill in manager_email + contact_email proactively
            // (the org row is missing them — that's how patient onboarding
            // emails get routed to the right inbox). Without this, new orgs
            // sat without comms metadata until 3+ referrals tripped the
            // existing 3-referral SMS — too late for the first patient.
            if (status === 'auto_created') {
              try {
                const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID');
                const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN');
                const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
                const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
                if (TWILIO_SID && TWILIO_AUTH) {
                  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
                    method: 'POST',
                    headers: { Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                      To: OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`,
                      Body: `🆕 New practice auto-registered from lab order: ${extracted.practiceName}${extracted.orderingPhysician ? ' (Dr ' + extracted.orderingPhysician + ')' : ''}${extracted.npi ? ' · NPI ' + extracted.npi : ''}. Add manager_email in Admin → Organizations to enable system notifications.`,
                      From: TWILIO_FROM,
                    }).toString(),
                  });
                }
              } catch (firstErr) { console.warn('[ocr->org] first-detection alert failed (non-blocking):', firstErr); }
            }
          } else if (labOrderRowId && (!linkRes || !(linkRes as any).org_id)) {
            await supabase.from('appointment_lab_orders').update({
              org_match_status: 'unmatched',
              org_match_reason: 'no_org_returned',
            }).eq('id', labOrderRowId);
          }

          // Signal ladder: when a discovered practice hits 3+ referrals
          // AND is still untouched, page the owner immediately. Hormozi
          // rule: the dashboard's job is to point at the fire.
          if (linkRes && (linkRes as any).org_id) {
            const { data: orgRow } = await supabase
              .from('organizations')
              .select('id, name, referral_count, outreach_status, office_phone')
              .eq('id', (linkRes as any).org_id)
              .maybeSingle();
            if (orgRow && orgRow.referral_count === 3 && orgRow.outreach_status === 'untouched') {
              try {
                const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID');
                const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN');
                const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
                const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
                if (TWILIO_SID && TWILIO_AUTH) {
                  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
                    method: 'POST',
                    headers: {
                      Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`,
                      'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                      To: OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`,
                      Body: `📈 Partnership lead: ${orgRow.name} — 3 patients in the last few weeks.${orgRow.office_phone ? ' Phone: ' + orgRow.office_phone : ''} Admin → Organizations → Discovered.`,
                      From: TWILIO_FROM,
                    }).toString(),
                  });
                }
              } catch (smsErr) {
                console.warn('[ocr->org] threshold SMS failed:', smsErr);
              }
            }
          }
        }
      } catch (parseErr) {
        console.warn('[ocr->org] parse/link failed (non-blocking):', parseErr);
      }
    }

    // FULL response shape — create-lab-request + future callers consume
    // `patient.dateOfBirth`, `urineRequired`, `gttRequired`, and `fullText`
    // off this object. Previously these were silently dropped because the
    // response only carried `panels` + `textPreview`, which made the DOB
    // auto-stamp in create-lab-request a no-op (John Struck / Michael
    // Percopo bug 2026-05-13). Always return what we extracted.
    return new Response(JSON.stringify({
      ok: true,
      appointmentId: targetId,
      filePath,
      panelsDetected: result.panels.length,
      panels: result.panels,
      fastingDetected,
      fastingRequired: fastingDetected,                    // alias for callers expecting the older field name
      // BUG FIX (2026-07-07): these previously read `(result as any).urineRequired`
      // / `.gttRequired` — fields that were NEVER assigned, so both were always
      // false. create-lab-request consumed them → every provider lab request
      // (and the appointment spawned from it) lost urine/GTT prep flags.
      urineRequired: urineDetected,
      gttRequired: gttDetected,
      prep: result.prep || null,                           // Claude's raw yes/no/unclear determination
      patient: result.patient || null,                     // { dateOfBirth, sex/gender, etc. } — used by create-lab-request to stamp patient_dob
      provider: (result as any).provider || null,          // org-match info
      fullText: result.text || '',                          // create-lab-request stores in lab_order_full_text
      textPreview: result.text.substring(0, 300),
      // Client-bill / prepaid signals — the booking client uses `clientBilled`
      // to drop the insurance requirement live on upload.
      billType: storedBillType,
      labCompany: result.labCompany || null,
      clientBilled,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[ocr] unhandled', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
