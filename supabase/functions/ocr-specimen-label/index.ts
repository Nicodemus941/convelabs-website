/**
 * OCR-SPECIMEN-LABEL
 *
 * Phleb snaps a photo of the specimen/shipping label at drop-off; this fn
 * extracts the lab/carrier name, every candidate tracking / accession code,
 * and the patient name printed on the label so the SpecimenDeliveryModal can
 * PREFILL its fields instead of the phleb hand-typing them.
 *
 * Body: { path } — storage path inside the PRIVATE `specimen-labels` bucket.
 * Returns: {
 *   ok, lab_company, patient_name,
 *   codes: [{ value, type: 'ups'|'fedex'|'usps'|'accession'|'requisition'|'other',
 *             confidence: 'high'|'medium'|'low' }],
 *   raw_text
 * }
 *
 * PHI NOTE: the label photo contains patient names. The Claude Vision request
 * carries the image — do NOT switch this to any non-BAA model/provider.
 * Requires ANTHROPIC_API_KEY env var. verify_jwt=true (phleb app calls it
 * with the signed-in user's JWT).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Classify a code string by carrier/lab format so the UI can rank chips. */
export function classifyCode(v: string): 'ups' | 'fedex' | 'usps' | 'accession' | 'other' {
  const s = String(v || '').replace(/\s+/g, '').toUpperCase();
  if (/^1Z[A-Z0-9]{16}$/.test(s)) return 'ups';
  if (/^\d{12}$/.test(s) || /^\d{15}$/.test(s) || /^\d{20,22}$/.test(s) && s.startsWith('96')) return 'fedex';
  if (/^(94|93|92|420)\d{18,24}$/.test(s)) return 'usps';
  if (/^[A-Z]{1,4}[-_]?\d{4,}/.test(s) || /^\d{7,11}$/.test(s)) return 'accession';
  return 'other';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  try {
    const { path } = await req.json().catch(() => ({}));
    if (!path || typeof path !== 'string') return json({ error: 'path_required' }, 400);

    const { data: file, error: dlErr } = await supabase.storage.from('specimen-labels').download(path);
    if (dlErr || !file) return json({ error: 'download_failed', detail: dlErr?.message }, 404);
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return json({ error: 'image_too_large' }, 413);

    const lower = path.toLowerCase();
    let mediaType = 'image/jpeg';
    if (lower.endsWith('.png')) mediaType = 'image/png';
    else if (lower.endsWith('.webp')) mediaType = 'image/webp';
    else if (lower.endsWith('.gif')) mediaType = 'image/gif';

    const prompt = `This is a photo of a laboratory specimen label, requisition sticker, or shipping label taken by a mobile phlebotomist at specimen drop-off.

Extract and return ONLY a JSON object (no prose, no markdown fences):
{
  "lab_company": string|null,   // the lab or carrier this label belongs to, e.g. "LabCorp", "Quest Diagnostics", "AdventHealth", "UPS", "FedEx", "Rupa Health" — read logos too
  "patient_name": string|null,  // patient name printed on the label, if any
  "codes": [                    // EVERY distinct tracking / accession / requisition / specimen number visible (human-readable text and numbers printed under barcodes)
    { "value": string, "kind": "tracking"|"accession"|"requisition"|"specimen"|"other", "confidence": "high"|"medium"|"low" }
  ],
  "raw_text": string            // all legible text, best effort
}

Rules:
- Include the human-readable number printed under each barcode.
- UPS numbers start with 1Z; FedEx are 12/15-digit numbers; lab accessions are usually letter-prefixed or 8-10 digits.
- Do NOT invent digits: if part of a code is blurry, mark confidence "low".
- If nothing is legible, return codes: [] rather than guessing.`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 900,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: bytesToBase64(buf) } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    if (!resp.ok) {
      const errTxt = await resp.text();
      console.error('[ocr-specimen-label] anthropic error:', resp.status, errTxt.slice(0, 300));
      return json({ error: 'ocr_failed', status: resp.status }, 502);
    }
    const result = await resp.json();
    const rawOut = (result?.content || []).map((c: any) => c?.text || '').join('');
    let parsed: any = null;
    try {
      const m = rawOut.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch { /* fall through */ }
    if (!parsed) return json({ ok: true, lab_company: null, patient_name: null, codes: [], raw_text: rawOut.slice(0, 2000) });

    // Normalize + format-classify each code so the client can rank chips
    // (carrier tracking = patient-facing; accession = internal).
    const codes = (Array.isArray(parsed.codes) ? parsed.codes : [])
      .map((c: any) => {
        const value = String(c?.value || '').trim();
        if (!value) return null;
        const fmt = classifyCode(value);
        return {
          value,
          kind: String(c?.kind || 'other'),
          format: fmt, // 'ups' | 'fedex' | 'usps' | 'accession' | 'other'
          confidence: ['high', 'medium', 'low'].includes(c?.confidence) ? c.confidence : 'medium',
        };
      })
      .filter(Boolean)
      .slice(0, 8);

    return json({
      ok: true,
      lab_company: parsed.lab_company ? String(parsed.lab_company).slice(0, 80) : null,
      patient_name: parsed.patient_name ? String(parsed.patient_name).slice(0, 80) : null,
      codes,
      raw_text: String(parsed.raw_text || '').slice(0, 2000),
    });
  } catch (e: any) {
    console.error('[ocr-specimen-label] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
