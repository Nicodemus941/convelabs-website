// insurance-self-upload — patient self-serve insurance upload, no login.
//
// Three modes:
//   { token, mode: 'preview' }            — returns first name + has-card flags
//   { token, mode: 'upload', side, file_path } — stamps already-uploaded path
//   { mint: true, patient_id, source }   — admin/cron generates token
//
// Auth model:
//   - Public (no JWT) for token modes — token IS the auth
//   - Service-role only for mint mode (cron + admin)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    if (body?.mint === true) {
      const auth = req.headers.get('Authorization') || '';
      const token = auth.replace(/^Bearer\s+/i, '').trim();
      const isServiceRole = token === SERVICE_KEY;
      let isAdmin = false;
      if (!isServiceRole && token) {
        const { data: userData } = await supabase.auth.getUser(token);
        const role = String(userData?.user?.user_metadata?.role || '').toLowerCase();
        isAdmin = ['super_admin','admin','owner'].includes(role);
      }
      if (!isServiceRole && !isAdmin) {
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const patientId = body?.patient_id;
      if (!patientId) return new Response(JSON.stringify({ error: 'patient_id required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      const source = body?.source || 'admin_send';
      const newToken = crypto.randomUUID() + '-' + crypto.randomUUID().split('-')[0];
      const { data: tk, error: tkErr } = await supabase
        .from('insurance_upload_tokens')
        .insert({ patient_id: patientId, token: newToken, source })
        .select('token, expires_at').single();
      if (tkErr) return new Response(JSON.stringify({ error: tkErr.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
      const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
      return new Response(JSON.stringify({
        ok: true,
        token: (tk as any).token,
        url: `${PUBLIC_SITE_URL}/insurance/update/${(tk as any).token}`,
        expires_at: (tk as any).expires_at,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const inputToken: string = String(body?.token || '');
    if (!inputToken) return new Response(JSON.stringify({ error: 'token required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const { data: tk } = await supabase
      .from('insurance_upload_tokens')
      .select('id, patient_id, rank, source, expires_at, used_at')
      .eq('token', inputToken).maybeSingle();

    if (!tk) return new Response(JSON.stringify({ error: 'invalid or expired link' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    if ((tk as any).used_at) return new Response(JSON.stringify({ error: 'this link has already been used. If you need to upload again, contact us at (941) 527-9169.' }), { status: 410, headers: { ...CORS, 'Content-Type': 'application/json' } });
    if (new Date((tk as any).expires_at) < new Date()) return new Response(JSON.stringify({ error: 'this link has expired. Contact us at (941) 527-9169 to receive a fresh one.' }), { status: 410, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const patientId = (tk as any).patient_id;
    const rank = (tk as any).rank || 'primary';

    if (body?.mode === 'preview') {
      const { data: tp } = await supabase
        .from('tenant_patients')
        .select('first_name, insurance_provider')
        .eq('id', patientId).maybeSingle();
      const { data: ins } = await supabase
        .from('patient_insurances')
        .select('card_front_path, card_back_path, provider, member_id')
        .eq('patient_id', patientId).eq('rank', rank).eq('is_active', true)
        .maybeSingle();
      return new Response(JSON.stringify({
        ok: true,
        first_name: (tp as any)?.first_name || 'there',
        current_provider: (ins as any)?.provider || (tp as any)?.insurance_provider || null,
        has_front: !!(ins as any)?.card_front_path,
        has_back: !!(ins as any)?.card_back_path,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (body?.mode === 'upload') {
      const filePath: string = String(body?.file_path || '');
      const side: 'front' | 'back' = body?.side === 'back' ? 'back' : 'front';
      if (!filePath) return new Response(JSON.stringify({ error: 'file_path required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

      const { data: existing } = await supabase
        .from('patient_insurances')
        .select('id, card_front_path, card_back_path')
        .eq('patient_id', patientId).eq('rank', rank).eq('is_active', true)
        .maybeSingle();

      let insId: string;
      if (existing) {
        insId = (existing as any).id;
        await supabase.from('patient_insurances').update({
          ...(side === 'front' ? { card_front_path: filePath } : { card_back_path: filePath }),
        }).eq('id', insId);
      } else {
        await supabase.from('patient_insurances').update({ is_active: false }).eq('patient_id', patientId).eq('rank', rank).eq('is_active', true);
        const { data: created } = await supabase.from('patient_insurances').insert({
          patient_id: patientId, rank, is_active: true,
          card_front_path: side === 'front' ? filePath : null,
          card_back_path: side === 'back' ? filePath : null,
        }).select('id').single();
        insId = (created as any).id;
      }

      try {
        supabase.functions.invoke('extract-insurance-ocr', {
          body: { filePath, patientId, rank, side },
        }).catch(() => {});
      } catch {}

      if ((tk as any).source === 'expiry_pulse') {
        try {
          await supabase.from('patient_insurances').update({
            expiry_pulse_response: 'update_requested',
            expiry_pulse_responded_at: new Date().toISOString(),
            verified_at: new Date().toISOString(),
          }).eq('id', insId);
        } catch {}
      }

      if (side === 'front') {
        await supabase.from('insurance_upload_tokens').update({ used_at: new Date().toISOString() }).eq('id', (tk as any).id);
      }

      return new Response(JSON.stringify({ ok: true, side, message: 'Saved. Thanks!' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'unknown mode' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[insurance-self-upload] crash:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
