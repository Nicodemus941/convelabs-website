// generate-content-drafts — Phase 1 of the Hormozi content factory.
//
// For each queued topic (or a specific topic_id passed in the body),
// generate a post draft per target platform using Claude via the
// Anthropic API. Writes rows to social_content_drafts for admin review.
//
// Honors ConveLabs brand voice:
//   - Founder-led (Nico's voice)
//   - No "luxury" language (per footer rewrite earlier)
//   - Concrete, educational, Hormozi-style specificity ("5 Labs" not
//     "some labs")
//   - Single CTA per post — either /partner-with-us, /pricing, or
//     /book-now depending on category
//
// Callable:
//   POST { topicId?: string, limit?: number }
//   - If topicId given: generate drafts for that specific topic
//   - Else: pick top N queued topics by priority and generate drafts
//
// Env required:
//   ANTHROPIC_API_KEY   (for Claude)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const MODEL = 'claude-sonnet-4-5';
const PROMPT_VERSION = 'v1-2026-04-19';

// ConveLabs brand voice baked into the system prompt
const BRAND_SYSTEM_PROMPT = `You write social posts for ConveLabs — a concierge mobile phlebotomy practice in Central Florida, founded and operated by Nicodemme "Nico" Jean-Baptiste, a licensed phlebotomist.

BRAND VOICE
- Founder-led, first person. Sign as Nico when appropriate.
- Warm, direct, educational. Never "luxury" — use "concierge" or "premium".
- Specific > generic. "5 Labs Most Doctors Miss" beats "some labs".
- No hedging: say what you believe.
- Short sentences. Read at a 6th-grade level.
- No exclamation points unless something is genuinely exciting.
- The recollection guarantee ("if we caused it, recollection is 100% free; if reference lab caused it, 50% off") is our core differentiator — use when relevant.

CONTENT CATEGORIES
- patient_ed: teach patients something they didn't know about their own labs
- founder_voice: first-person stories from Nico's day
- partner_spotlight: highlight a provider we serve
- lab_literacy: demystify a specific test result or panel
- local_wellness: Central Florida health community shoutouts

OUR PARTNERS
Aristotle Education (Dr. Jamnadas), ND Wellness, The Restoration Place (BioTE BHRT), Natura Integrative and Functional Medicine, Kristen Blake Wellness, Elite Medical Concierge, Dr. Jason Littleton, Clinical Associates of Orlando.

OUR CTAs (rotate based on category)
- /pricing — membership signup (Founding 50 VIP at $199/yr, membership begins immediately)
- /partner-with-us — provider partnership form
- /book-now — book a mobile blood draw
- (941) 527-9169 — direct phone line

OUTPUT FORMAT
Return VALID JSON only, no prose before or after. Shape:
{
  "linkedin": {
    "hook": "<first line, must stop scroll, 80-120 chars>",
    "body": "<main content, 3-6 short paragraphs, 800-1200 chars total>",
    "cta": "<single line ask — 'Book a draw', 'DM me to partner', etc>",
    "hashtags": ["#ConciergePhlebotomy", "#CentralFlorida", "#..."],
    "image_prompt": "<description for image — real photograph style, no illustrations>"
  },
  "instagram": {
    "hook": "<first line, 60-100 chars>",
    "body": "<main content, 400-800 chars — IG rewards tight copy>",
    "cta": "<single line — 'Link in bio' pattern is fine>",
    "hashtags": ["#..."],
    "image_prompt": "<description>"
  }
}`;

interface Topic {
  id: string;
  topic: string;
  category: string | null;
  notes: string | null;
  target_platforms: string[];
}

async function generateDraftForTopic(topic: Topic): Promise<any | null> {
  const userPrompt = `Write social posts for this topic:

TOPIC: ${topic.topic}
CATEGORY: ${topic.category || 'general'}
${topic.notes ? `NOTES: ${topic.notes}\n` : ''}PLATFORMS: ${topic.target_platforms.join(', ')}

Generate the JSON now.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: BRAND_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    console.error(`[generate] Anthropic API failed: ${resp.status} ${err}`);
    return null;
  }

  const data = await resp.json();
  const text: string = data?.content?.[0]?.text || '';

  // Claude sometimes wraps JSON in ```json fences — strip them
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    console.warn(`[generate] JSON parse failed for topic ${topic.id}:`, e?.message);
    console.warn(`[generate] Raw output:`, cleaned.substring(0, 500));
    return null;
  }
}

async function writeDraftsToDb(
  supabase: any,
  topic: Topic,
  generation: any,
): Promise<number> {
  if (!generation) return 0;
  const rows: any[] = [];
  for (const platform of topic.target_platforms) {
    const draft = generation[platform];
    if (!draft) continue;
    rows.push({
      topic_id: topic.id,
      platform,
      hook: draft.hook || null,
      body: draft.body || '',
      cta: draft.cta || null,
      hashtags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
      suggested_image_prompt: draft.image_prompt || null,
      status: 'drafted',
      generation_model: MODEL,
      generation_prompt_version: PROMPT_VERSION,
    });
  }
  if (rows.length === 0) return 0;
  const { error } = await supabase.from('social_content_drafts').insert(rows);
  if (error) {
    console.error(`[generate] insert failed for topic ${topic.id}:`, error.message);
    return 0;
  }
  // Flip topic status → drafted
  await supabase
    .from('social_topic_queue')
    .update({ status: 'drafted', drafted_at: new Date().toISOString() })
    .eq('id', topic.id);
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const topicId: string | undefined = body?.topicId;
    const limit: number = Math.min(Math.max(parseInt(body?.limit || '3', 10), 1), 10);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    let topics: Topic[];
    if (topicId) {
      const { data, error } = await supabase
        .from('social_topic_queue')
        .select('id, topic, category, notes, target_platforms')
        .eq('id', topicId)
        .maybeSingle();
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: `Topic ${topicId} not found` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      topics = [data as Topic];
    } else {
      const { data } = await supabase
        .from('social_topic_queue')
        .select('id, topic, category, notes, target_platforms')
        .eq('status', 'queued')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(limit);
      topics = (data as Topic[]) || [];
    }

    if (topics.length === 0) {
      return new Response(
        JSON.stringify({ success: true, generated: 0, message: 'No queued topics' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const results: any[] = [];
    for (const topic of topics) {
      const generation = await generateDraftForTopic(topic);
      const draftsWritten = await writeDraftsToDb(supabase, topic, generation);
      results.push({
        topic_id: topic.id,
        topic: topic.topic,
        drafts_written: draftsWritten,
        ok: draftsWritten > 0,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        generated: results.reduce((s, r) => s + r.drafts_written, 0),
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[generate] exception:', err);
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
