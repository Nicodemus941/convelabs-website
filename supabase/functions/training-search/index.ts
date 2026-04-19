// training-search
// Admin-gated full-text search across training_faqs + training_courses.
// Logs every search so we learn what admins are looking for (training_search_log).
//
// Request:  { query, partner_org_id? }
// Response: { faqs: [...], courses: [...] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userResp } = await admin.auth.getUser(token);
    const user = userResp?.user;
    if (!user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const role = user.user_metadata?.role;
    if (role !== 'super_admin' && role !== 'office_manager') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { query, partner_org_id } = await req.json();
    if (!query || String(query).trim().length < 2) {
      return new Response(JSON.stringify({ faqs: [], courses: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const q = String(query).trim();

    // Search FAQs via full-text + partial match fallback
    let faqQuery = admin
      .from('training_faqs')
      .select('id, question, answer_short, answer_long, category, tags, partner_org_id')
      .eq('published', true)
      .or(`question.ilike.%${q}%,answer_short.ilike.%${q}%,answer_long.ilike.%${q}%,tags.cs.{${q.toLowerCase()}}`)
      .limit(15);
    if (partner_org_id) {
      faqQuery = faqQuery.or(`partner_org_id.eq.${partner_org_id},partner_org_id.is.null`);
    }
    const { data: faqs } = await faqQuery;

    // Search courses
    const { data: courses } = await admin
      .from('training_courses')
      .select('id, slug, title, summary, category, estimated_minutes, required')
      .eq('published', true)
      .or(`title.ilike.%${q}%,summary.ilike.%${q}%,content_md.ilike.%${q}%`)
      .order('sort_order', { ascending: true })
      .limit(5);

    // Log the search for product ops
    await admin.from('training_search_log').insert({
      user_id: user.id,
      query: q,
      result_count: (faqs?.length || 0) + (courses?.length || 0),
    });

    return new Response(JSON.stringify({ faqs: faqs || [], courses: courses || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('training-search error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
