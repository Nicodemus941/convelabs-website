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

async function runClaudeVisionOcr(base64: string, mediaType: string): Promise<{ text: string; panels: string[] } | null> {
  if (!ANTHROPIC_API_KEY) {
    console.error('[ocr] ANTHROPIC_API_KEY not set');
    return null;
  }

  // Claude accepts PDFs via its native document source format (beta)
  const isPdf = mediaType === 'application/pdf';
  const sourceBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  const body = {
    model: 'claude-3-5-sonnet-20241022',
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
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      console.error('[ocr] anthropic error', resp.status, errTxt.substring(0, 300));
      return null;
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
  } catch (e) {
    console.error('[ocr] request exception', e);
    return null;
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
    const { appointmentId, filePath: bareFilePath } = body || {};

    let filePath: string | null = bareFilePath || null;
    let targetId: string | null = appointmentId || null;

    if (appointmentId) {
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
      // Multiple files — run OCR on the FIRST one. Sufficient for MVP.
      filePath = String(appt.lab_order_file_path).split(',')[0].trim();
      targetId = appt.id;
    }

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'filePath or appointmentId required' }), {
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

    const base64 = bytesToBase64(downloaded.data);
    const result = await runClaudeVisionOcr(base64, downloaded.mediaType);

    if (!result) {
      return new Response(JSON.stringify({ error: 'OCR engine failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Detect fasting panels from OCR panel list (redundant with phlebHelpers but
    // useful as a pre-flight hint that admins can see even before rendering)
    const fastingDetected = result.panels.some(p =>
      FASTING_PANELS.some(fp => p.toLowerCase().includes(fp.toLowerCase()))
    );

    if (targetId) {
      await supabase.from('appointments').update({
        lab_order_ocr_text: result.text,
        lab_order_panels: result.panels,
        ocr_processed_at: new Date().toISOString(),
      }).eq('id', targetId);
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
