// storage-health-check — verifies every required bucket exists, has
// expected visibility, and accepts service-role writes (using a probe
// in an allowed mime type). SMS owner if anything drifts.
//
// Hormozi rule: codify the safety net so silent infrastructure rot
// can't cost you a customer. Charles Cook 2026-05-08: insurance-cards
// bucket didn't exist for the entire life of the product. Every
// "upload" silently failed for 24+ hours before the bug surfaced via
// a real patient complaint. This fn would have caught it within 6h.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 1x1 transparent PNG — valid mime for image-restricted buckets
const PNG_PROBE_BYTES = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
), c => c.charCodeAt(0));

const REQUIRED_BUCKETS: Array<{ id: string; public: boolean; probeWrite: boolean; probeMime: string }> = [
  { id: 'lab-orders',          public: true,  probeWrite: true,  probeMime: 'image/png' },
  { id: 'insurance-cards',     public: false, probeWrite: true,  probeMime: 'image/png' },
  { id: 'specimen-signatures', public: false, probeWrite: false, probeMime: 'image/png' },
  { id: 'staff-onboarding',    public: false, probeWrite: false, probeMime: 'image/png' },
  { id: 'documents',           public: false, probeWrite: false, probeMime: 'image/png' },
];

const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '+19415279169';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const wantAlert = body?.alert !== false;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const issues: Array<{ bucket: string; problem: string; severity: 'critical' | 'warning' }> = [];

    let bucketRows: any[] = [];
    try {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        headers: { 'Authorization': `Bearer ${SERVICE_KEY}` },
      });
      if (r.ok) bucketRows = await r.json();
      else issues.push({ bucket: '*', problem: `bucket list HTTP ${r.status}`, severity: 'critical' });
    } catch (e: any) {
      issues.push({ bucket: '*', problem: `bucket list error: ${e?.message}`, severity: 'critical' });
    }
    const present: Record<string, any> = {};
    for (const b of bucketRows) present[b.id || b.name] = b;

    for (const reqB of REQUIRED_BUCKETS) {
      const row = present[reqB.id];
      if (!row) {
        issues.push({ bucket: reqB.id, problem: 'BUCKET MISSING', severity: 'critical' });
        continue;
      }
      if (reqB.public !== !!row.public) {
        issues.push({
          bucket: reqB.id,
          problem: `Visibility mismatch: expected public=${reqB.public}, got public=${!!row.public}`,
          severity: 'warning',
        });
      }
      if (reqB.probeWrite) {
        try {
          const probeName = `_health_probe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`;
          const blob = new Blob([PNG_PROBE_BYTES], { type: reqB.probeMime });
          const { error } = await supabase.storage.from(reqB.id).upload(probeName, blob, { upsert: true });
          if (error) {
            issues.push({
              bucket: reqB.id,
              problem: `Service-role write probe failed: ${error.message}`,
              severity: 'critical',
            });
          } else {
            await supabase.storage.from(reqB.id).remove([probeName]).catch(() => {});
          }
        } catch (e: any) {
          issues.push({
            bucket: reqB.id,
            problem: `Probe exception: ${e?.message || e}`,
            severity: 'critical',
          });
        }
      }
    }

    const critical = issues.filter(i => i.severity === 'critical');
    if (critical.length > 0 && wantAlert) {
      const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
      const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
      const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER');
      if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        const summary = critical.map(i => `• ${i.bucket}: ${i.problem}`).join('\n');
        const smsBody = `🚨 ConveLabs storage health check FAILED:\n${summary}`;
        try {
          const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ To: OWNER_PHONE, From: TWILIO_FROM, Body: smsBody }).toString(),
          });
        } catch (e) { console.warn('[storage-health] owner alert failed:', e); }
      }
    }

    return new Response(JSON.stringify({
      ok: critical.length === 0,
      checked_at: new Date().toISOString(),
      buckets_present: bucketRows.length,
      required: REQUIRED_BUCKETS.length,
      critical_count: critical.length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      issues,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[storage-health-check] crash:', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
