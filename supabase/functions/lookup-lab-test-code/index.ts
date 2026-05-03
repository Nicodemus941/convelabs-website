/**
 * LOOKUP-LAB-TEST-CODE
 *
 * Layer 2 of the tube-prediction architecture: when a test code isn't
 * in the static catalog, ask Claude to resolve it from the lab's public
 * test directory. Cached forever in lab_test_catalog with source='ai_lookup'
 * and confidence=0.7 so admin can review.
 *
 * Body:
 *   { lab_name, test_code }
 * Returns:
 *   { ok, hit (cached) | created, catalog_row }
 *
 * Idempotent — multiple concurrent calls for the same (lab,code) pair
 * race-safely insert via ON CONFLICT DO NOTHING then return the winner.
 *
 * Design constraints:
 *   - No Quest/LabCorp API access; Claude reasons over publicly-known
 *     specimen requirements (these are stable, in lab catalogs/PDFs).
 *   - We refuse to insert a row when Claude's confidence is too low.
 *     Caller (TubePredictionPanel) shows "manual lookup required."
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

const PROMPT = (lab: string, code: string) => `You are a phlebotomy reference. A lab order was uploaded with this test code that I cannot find in my catalog.

Lab: ${lab}
Test code: ${code}

Respond with ONLY a JSON object describing the specimen requirements based on standard CLSI guidelines and that lab's published test catalog. If you cannot identify this test code with high confidence, return { "confidence": 0 }.

Format:
{
  "test_name": "<full test name as the lab publishes it>",
  "tube_type": "SST" | "EDTA" | "Lithium Heparin" | "Sodium Citrate" | "Sodium Fluoride" | "Plain" | "PST" | "Urine cup" | "Other",
  "tube_color": "Gold" | "Lavender" | "Mint" | "Light Blue" | "Gray" | "Yellow" | "Royal Blue" | "Red" | "Urine Yellow",
  "volume_ml": <numeric, the minimum acceptable volume>,
  "draw_order": <int 1-99 per CLSI: 1=Yellow blood-culture, 2=Light Blue coag, 3=Red/Gold serum, 4=Mint heparin, 5=Lavender EDTA, 6=Gray glycolytic, 99=Urine>,
  "fasting_required": <bool>,
  "fasting_hours": <int or null>,
  "special_handling": "<text or null>",
  "time_window": "<text like 'AM only (7-9 AM)' or null>",
  "alt_codes": ["<other code/name>", ...],
  "confidence": <0-1, your subjective confidence>
}

Be conservative — when uncertain, return confidence < 0.6.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'anthropic_not_configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const lab_name: string = (body?.lab_name || '').trim();
    const test_code_raw: string = (body?.test_code || '').trim();
    if (!lab_name || !test_code_raw) {
      return new Response(JSON.stringify({ error: 'lab_name + test_code required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Check cache first
    const { data: existing } = await admin
      .from('lab_test_catalog')
      .select('*')
      .eq('lab_name', lab_name)
      .eq('test_code', test_code_raw)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, hit: 'cached', catalog_row: existing }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fire Claude
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      temperature: 0,
      messages: [{ role: 'user', content: PROMPT(lab_name, test_code_raw) }],
    });
    const text = (msg.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'ai_no_json', raw: text.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    let parsed: any;
    try { parsed = JSON.parse(jsonMatch[0]); }
    catch (e) {
      return new Response(JSON.stringify({ error: 'ai_bad_json', raw: jsonMatch[0].slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiConfidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    if (aiConfidence < 0.6 || !parsed.tube_type || !parsed.tube_color || !parsed.volume_ml) {
      return new Response(JSON.stringify({
        ok: false, hit: 'low_confidence',
        confidence: aiConfidence, ai_response: parsed,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert (cap stored confidence at 0.75 — AI lookups need human verify)
    const storedConfidence = Math.min(aiConfidence, 0.75);
    const insertPayload: any = {
      lab_name,
      test_code: test_code_raw,
      test_name: parsed.test_name || test_code_raw,
      alt_codes: Array.isArray(parsed.alt_codes) ? parsed.alt_codes : null,
      tube_type: parsed.tube_type,
      tube_color: parsed.tube_color,
      volume_ml: Number(parsed.volume_ml),
      draw_order: parseInt(String(parsed.draw_order || 3), 10),
      fasting_required: !!parsed.fasting_required,
      fasting_hours: parsed.fasting_hours ? parseInt(String(parsed.fasting_hours), 10) : null,
      special_handling: parsed.special_handling || null,
      time_window: parsed.time_window || null,
      source: 'ai_lookup',
      confidence: storedConfidence,
      notes: `AI-resolved on ${new Date().toISOString().substring(0, 10)} (Claude said ${aiConfidence}); review before relying.`,
    };

    const { data: inserted, error: insErr } = await admin
      .from('lab_test_catalog')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insErr) {
      // Race: another request inserted between our cache check and now
      if ((insErr as any).code === '23505') {
        const { data: hit2 } = await admin
          .from('lab_test_catalog')
          .select('*')
          .eq('lab_name', lab_name)
          .eq('test_code', test_code_raw)
          .maybeSingle();
        return new Response(JSON.stringify({ ok: true, hit: 'race_resolved', catalog_row: hit2 }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'insert_failed', message: insErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ok: true, hit: 'created', ai_confidence: aiConfidence, catalog_row: inserted,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[lookup-lab-test-code] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
