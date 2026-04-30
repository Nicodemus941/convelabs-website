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

// Known fasting panels — we mirror phlebHelpers.ts so detection stays consistent
const FASTING_PANELS = [
  'Lipid Panel', 'Cholesterol', 'CMP', 'Comprehensive Metabolic Panel',
  'BMP', 'Basic Metabolic Panel', 'Glucose', 'Fasting Glucose',
  'Fasting Insulin', 'Lactic Acid', 'HbA1c',
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

async function runClaudeVisionOcr(base64: string, mediaType: string): Promise<{ text: string; panels: string[] } | { error: string }> {
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
    //   • 'claude-sonnet-4-20250514'    — current. Same model already used by
    //     extract-insurance-ocr in this project, so the API key is verified
    //     to have access. Vision-capable, active-support.
    model: 'claude-sonnet-4-20250514',
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
            'Extract:',
            '1. A plain-text transcription of ALL ordered tests, panels, CPT codes, and special instructions (especially fasting requirements).',
            '2. A structured list of the panels/tests ordered. Normalize names to their common abbreviation when obvious (e.g. "Comprehensive Metabolic Panel" → "CMP").',
            '',
            'Reply ONLY with valid JSON in this exact shape, no prose:',
            '{"text": "<full transcription>", "panels": ["CMP", "Lipid Panel", ...]}',
            '',
            'If the image is unreadable, reply: {"text": "", "panels": []}',
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
    if (!match) return { text: content, panels: [] };
    try {
      const parsed = JSON.parse(match[0]);
      const text = String(parsed.text || '').substring(0, 8000);
      const panels = Array.isArray(parsed.panels) ? parsed.panels.slice(0, 40).map((p: any) => String(p).substring(0, 80)) : [];
      return { text, panels };
    } catch {
      return { text: content.substring(0, 8000), panels: [] };
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
    const { appointmentId, filePath: bareFilePath, labOrderId } = body || {};

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

    // Detect fasting panels from OCR panel list (redundant with phlebHelpers but
    // useful as a pre-flight hint that admins can see even before rendering)
    const fastingDetected = result.panels.some(p =>
      FASTING_PANELS.some(fp => p.toLowerCase().includes(fp.toLowerCase()))
    );

    // Persist the OCR result. Row-scoped if we came via labOrderId; otherwise
    // the legacy appointment-level columns.
    if (labOrderRowId) {
      await supabase.from('appointment_lab_orders').update({
        ocr_status: 'complete',
        ocr_detected_panels: result.panels,
        ocr_full_text: result.text,
        ocr_fasting_required: fastingDetected,
        ocr_completed_at: new Date().toISOString(),
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
            .select('ocr_detected_panels, ocr_full_text, ocr_fasting_required')
            .eq('appointment_id', targetId)
            .eq('ocr_status', 'complete');
          const merged = new Set<string>();
          let mergedText = '';
          let mergedFasting = false;
          for (const o of (allOrders || []) as any[]) {
            for (const p of (o.ocr_detected_panels || [])) merged.add(String(p));
            if (o.ocr_full_text) mergedText += (mergedText ? '\n\n---\n\n' : '') + o.ocr_full_text;
            if (o.ocr_fasting_required) mergedFasting = true;
          }
          // Include this row's results even if it isn't yet flushed into the
          // SELECT above (race window).
          for (const p of (result.panels || [])) merged.add(String(p));
          if (result.text && !mergedText.includes(result.text)) {
            mergedText += (mergedText ? '\n\n---\n\n' : '') + result.text;
          }
          mergedFasting = mergedFasting || fastingDetected;

          await supabase.from('appointments').update({
            lab_order_panels: Array.from(merged),
            lab_order_ocr_text: mergedText.substring(0, 50000),
            ocr_processed_at: new Date().toISOString(),
            // If fasting was detected and the appointment is currently
            // tagged routine/non-fasting, surface the override via notes
            // — but DON'T silently change service_type. Admin reviews.
            ...(mergedFasting ? { fasting_required: true } : {}),
          }).eq('id', targetId);
        } catch (mirrorErr) {
          console.warn('[ocr->appointment-mirror] failed (non-blocking):', mirrorErr);
        }
      }
    } else if (targetId) {
      await supabase.from('appointments').update({
        lab_order_ocr_text: result.text,
        lab_order_panels: result.panels,
        ocr_processed_at: new Date().toISOString(),
      }).eq('id', targetId);
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
        const extracted = extractProviderBlock(result.text);

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

    return new Response(JSON.stringify({
      ok: true,
      appointmentId: targetId,
      filePath,
      panelsDetected: result.panels.length,
      panels: result.panels,
      fastingDetected,
      textPreview: result.text.substring(0, 300),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[ocr] unhandled', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
