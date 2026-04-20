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
    model: 'claude-sonnet-4-5',
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
    } else if (targetId) {
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
