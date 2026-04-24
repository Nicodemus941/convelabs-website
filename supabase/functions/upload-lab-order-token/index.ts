/**
 * UPLOAD-LAB-ORDER-TOKEN
 *
 * No-login lab-order upload. Used by /visit/:token when a patient clicks
 * the "upload lab order" link from a reminder email.
 *
 * Auth: the appointment's view_token. Same pattern as VisitView — if the
 * token exists + matches an appointment, we trust the uploader.
 *
 * Body: {
 *   view_token: string,
 *   filename: string,           // original name, extension preserved
 *   content_base64: string,     // file bytes, base64-encoded
 *   content_type?: string,      // MIME, defaults to application/pdf
 * }
 *
 * Response: { ok, lab_order_file_path }
 *
 * Limits: 10 MB per file, 3 files max per appointment.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES_PER_APPT = 3;
const ALLOWED_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif',
]);

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { view_token, filename, content_base64, content_type } = await req.json();

    if (!view_token || typeof view_token !== 'string' || view_token.length < 16) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!filename || typeof filename !== 'string') {
      return new Response(JSON.stringify({ error: 'filename_required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!content_base64 || typeof content_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'content_required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const mime = (content_type || 'application/pdf').toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) {
      return new Response(JSON.stringify({ error: 'invalid_type', message: 'Upload must be PDF, JPG, PNG, or HEIC.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify token → appointment
    const { data: appt, error: lookupErr } = await admin
      .from('appointments')
      .select('id, lab_order_file_path, status')
      .eq('view_token', view_token)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!appt) {
      return new Response(JSON.stringify({ error: 'appointment_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (appt.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'appointment_cancelled' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cap files per appointment so a bad actor can't flood storage
    const existing = String(appt.lab_order_file_path || '').split(',').map(s => s.trim()).filter(Boolean);
    if (existing.length >= MAX_FILES_PER_APPT) {
      return new Response(JSON.stringify({ error: 'max_files_reached', message: `Max ${MAX_FILES_PER_APPT} files per appointment.` }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bytes = b64ToBytes(content_base64);
    if (bytes.byteLength === 0) {
      return new Response(JSON.stringify({ error: 'empty_file' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (bytes.byteLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'too_large', message: 'File must be under 10 MB.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitize filename
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const fileKey = `laborder_${appt.id}_${Date.now()}_${safeName}`;

    const { error: uploadErr } = await admin.storage.from('lab-orders').upload(fileKey, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (uploadErr) {
      console.error('[upload-lab-order-token] storage error:', uploadErr);
      return new Response(JSON.stringify({ error: 'storage_failed', message: uploadErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Append to existing path list (admin path uses comma-delimited multi-file)
    const newPath = existing.length > 0 ? [...existing, fileKey].join(', ') : fileKey;
    const { error: updErr } = await admin.from('appointments')
      .update({ lab_order_file_path: newPath })
      .eq('id', appt.id);
    if (updErr) {
      console.error('[upload-lab-order-token] update error:', updErr);
      return new Response(JSON.stringify({ error: 'update_failed', message: updErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, lab_order_file_path: newPath, uploaded: fileKey }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[upload-lab-order-token] unhandled:', e?.message);
    return new Response(JSON.stringify({ error: 'unhandled', message: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
