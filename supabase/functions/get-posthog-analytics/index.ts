/**
 * GET-POSTHOG-ANALYTICS
 *
 * Proxy for PostHog's HogQL query API so the secret Personal API key
 * never leaves the server. Returns yesterday / 7-day / 30-day traffic
 * summary + top pages + top sources in one call — the Hormozi dashboard
 * card reads this and renders.
 *
 * Required Supabase secrets:
 *   POSTHOG_PERSONAL_API_KEY   — app.posthog.com → Settings → Personal API Keys
 *   POSTHOG_PROJECT_ID         — numeric id (NOT the write key) from Project Settings
 *   POSTHOG_HOST               — optional, default https://us.i.posthog.com
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PH_KEY = Deno.env.get('POSTHOG_PERSONAL_API_KEY') || '';
const PH_PROJECT_ID = Deno.env.get('POSTHOG_PROJECT_ID') || '';
const PH_HOST = (Deno.env.get('POSTHOG_HOST') || 'https://us.i.posthog.com').replace(/\/$/, '');

async function hogql(query: string): Promise<any> {
  const res = await fetch(`${PH_HOST}/api/projects/${PH_PROJECT_ID}/query/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PH_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PostHog ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return json?.results || [];
}

// Build ET day-boundary ISO strings (PostHog expects UTC timestamps)
function etDayBounds(daysAgo: number): { start: string; end: string } {
  // Use America/New_York to compute 'today' then subtract daysAgo for start; end is start+1 day
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = etFormatter.formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  // ET offset varies with DST — compute via tz-aware Date
  const todayNoonEt = new Date(`${y}-${m}-${d}T12:00:00-04:00`);
  const startDate = new Date(todayNoonEt);
  startDate.setDate(startDate.getDate() - daysAgo);
  // Start-of-ET-day: subtract 12h
  startDate.setHours(startDate.getHours() - 12);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);
  return { start: startDate.toISOString(), end: endDate.toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!PH_KEY || !PH_PROJECT_ID) {
      return new Response(
        JSON.stringify({
          error: 'posthog_not_configured',
          message: 'Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in Supabase Edge Function secrets.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const yesterday = etDayBounds(1);
    const last7 = { start: etDayBounds(7).start, end: etDayBounds(0).start };
    const last30 = { start: etDayBounds(30).start, end: etDayBounds(0).start };

    const summaryQuery = (start: string, end: string) => `
      SELECT
        count() AS page_views,
        count(DISTINCT distinct_id) AS unique_visitors,
        count(DISTINCT properties.$session_id) AS sessions
      FROM events
      WHERE event = '$pageview'
        AND timestamp >= toDateTime('${start.slice(0, 19).replace('T', ' ')}', 'UTC')
        AND timestamp <  toDateTime('${end.slice(0, 19).replace('T', ' ')}', 'UTC')
    `;

    const topPagesQuery = `
      SELECT properties.$pathname AS path, count() AS views
      FROM events
      WHERE event = '$pageview'
        AND timestamp >= toDateTime('${yesterday.start.slice(0, 19).replace('T', ' ')}', 'UTC')
        AND timestamp <  toDateTime('${yesterday.end.slice(0, 19).replace('T', ' ')}', 'UTC')
      GROUP BY path
      ORDER BY views DESC
      LIMIT 8
    `;

    const topSourcesQuery = `
      SELECT
        coalesce(nullIf(properties.utm_source, ''), properties.$referring_domain, 'direct') AS source,
        count(DISTINCT properties.$session_id) AS sessions
      FROM events
      WHERE event = '$pageview'
        AND timestamp >= toDateTime('${yesterday.start.slice(0, 19).replace('T', ' ')}', 'UTC')
        AND timestamp <  toDateTime('${yesterday.end.slice(0, 19).replace('T', ' ')}', 'UTC')
      GROUP BY source
      ORDER BY sessions DESC
      LIMIT 6
    `;

    const [yest, w7, d30, pages, sources] = await Promise.all([
      hogql(summaryQuery(yesterday.start, yesterday.end)),
      hogql(summaryQuery(last7.start, last7.end)),
      hogql(summaryQuery(last30.start, last30.end)),
      hogql(topPagesQuery),
      hogql(topSourcesQuery),
    ]);

    const extractSummary = (rows: any[]) => ({
      page_views: Number(rows?.[0]?.[0] || 0),
      unique_visitors: Number(rows?.[0]?.[1] || 0),
      sessions: Number(rows?.[0]?.[2] || 0),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        yesterday: extractSummary(yest),
        last_7_days: extractSummary(w7),
        last_30_days: extractSummary(d30),
        top_pages_yesterday: (pages || []).map((r: any[]) => ({ path: r[0] || '(unknown)', views: Number(r[1]) })),
        top_sources_yesterday: (sources || []).map((r: any[]) => ({ source: r[0] || 'direct', sessions: Number(r[1]) })),
        generated_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('[posthog-analytics] error:', e?.message);
    return new Response(
      JSON.stringify({ error: 'posthog_query_failed', message: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
