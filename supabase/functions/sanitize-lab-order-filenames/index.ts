/**
 * SANITIZE-LAB-ORDER-FILENAMES — one-shot maintenance tool that copies
 * any lab-orders blob whose filename contains URL-unsafe characters
 * (commas, spaces, parentheses) to a safe-ASCII version, then updates
 * the appointment_lab_orders row + appointments.lab_order_file_path
 * trigger broadcasts the new path to legacy readers.
 *
 * Body (admin-only, service-role): { appointmentId?: string, all?: boolean }
 *  - appointmentId: process just one appointment (Mary Rienzi's case)
 *  - all: scan every alo row and rename any with unsafe characters
 *
 * Returns: { renamed: [{old, new, alo_id}], skipped: [...], errors: [...] }
 *
 * Idempotent — already-safe filenames are skipped.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UNSAFE = /[,\s()&#?%]/;

function sanitize(name: string): string {
  // Replace runs of unsafe chars (commas, whitespace, parens, etc.) with a
  // single underscore. Preserve the file extension. Idempotent.
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const cleanedStem = stem.replace(/[,\s()&#?%]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return cleanedStem + ext;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const appointmentId: string | undefined = body?.appointmentId;
    const all: boolean = !!body?.all;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let q = supabase.from('appointment_lab_orders').select('id, appointment_id, file_path, original_filename').is('deleted_at', null);
    if (appointmentId) q = q.eq('appointment_id', appointmentId);

    const { data: rows, error: qErr } = await q;
    if (qErr) throw qErr;

    const renamed: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    for (const row of (rows || [])) {
      const oldPath = (row as any).file_path as string;
      if (!oldPath || !UNSAFE.test(oldPath)) {
        if (!all) skipped.push({ alo_id: (row as any).id, reason: 'already_safe', path: oldPath });
        continue;
      }
      // Sanitize ONLY the filename, not any directory prefix
      const lastSlash = oldPath.lastIndexOf('/');
      const dir = lastSlash >= 0 ? oldPath.slice(0, lastSlash + 1) : '';
      const filename = lastSlash >= 0 ? oldPath.slice(lastSlash + 1) : oldPath;
      const safeFilename = sanitize(filename);
      let newPath = dir + safeFilename;

      // If a same-safe-name collision already exists, suffix the alo id
      const { data: collision } = await supabase.from('appointment_lab_orders' as any)
        .select('id').eq('file_path', newPath).is('deleted_at', null).limit(1);
      if (collision && collision.length > 0) {
        const suffix = String((row as any).id).slice(0, 8);
        const dot = safeFilename.lastIndexOf('.');
        newPath = dir + (dot > 0 ? safeFilename.slice(0, dot) + '_' + suffix + safeFilename.slice(dot) : safeFilename + '_' + suffix);
      }

      try {
        // Download the original blob
        const { data: blob, error: dlErr } = await supabase.storage.from('lab-orders').download(oldPath);
        if (dlErr || !blob) {
          errors.push({ alo_id: (row as any).id, old: oldPath, stage: 'download', error: dlErr?.message || 'no blob' });
          continue;
        }
        // Upload under the safe name
        const { error: upErr } = await supabase.storage.from('lab-orders').upload(newPath, blob, {
          contentType: blob.type || 'application/pdf',
          upsert: false,
        });
        if (upErr && !String(upErr.message || '').toLowerCase().includes('already exists')) {
          errors.push({ alo_id: (row as any).id, old: oldPath, new: newPath, stage: 'upload', error: upErr.message });
          continue;
        }
        // Update appointment_lab_orders.file_path → trigger re-broadcasts
        const { error: updErr } = await supabase.from('appointment_lab_orders' as any)
          .update({ file_path: newPath })
          .eq('id', (row as any).id);
        if (updErr) {
          errors.push({ alo_id: (row as any).id, old: oldPath, new: newPath, stage: 'update_alo', error: updErr.message });
          continue;
        }
        // Remove the old storage object now that the alo points elsewhere
        try {
          await supabase.storage.from('lab-orders').remove([oldPath]);
        } catch { /* non-fatal — orphan blob is harmless */ }

        renamed.push({ alo_id: (row as any).id, old: oldPath, new: newPath });
      } catch (e: any) {
        errors.push({ alo_id: (row as any).id, old: oldPath, stage: 'exception', error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({
      ok: errors.length === 0,
      summary: { scanned: (rows || []).length, renamed: renamed.length, skipped: skipped.length, errors: errors.length },
      renamed, skipped, errors,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
