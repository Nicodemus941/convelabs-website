import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-report-secret",
};

type VisitorSessionRow = {
  session_id: string;
  visitor_id: string;
  referrer: string | null;
  started_at: string;
};

type PageViewEventRow = {
  session_id: string;
  page_path: string;
  viewed_at: string;
};

type FunnelEventRow = {
  session_id: string;
  stage: string;
  occurred_at: string;
  event_data: Record<string, unknown> | null;
};

type Summary = {
  sessions: number;
  unique_visitors: number;
  page_views: number;
  book_now_sessions: number;
};

type TopPageRow = {
  page_path: string;
  views: number;
};

type TopSourceRow = {
  source: string;
  sessions: number;
};

type FunnelRow = {
  stage: string;
  label: string;
  stage_order: number;
  sessions: number;
};

type AbandonmentRow = {
  stage: string;
  sessions: number;
};

type DropoffRow = {
  from: string;
  to: string;
  lostSessions: number;
  lossRate: number;
};

const KEY_FUNNEL_STAGES = [
  { stage: "book_now_loaded", label: "Booking page loaded", stage_order: 1 },
  { stage: "booking_date_time_viewed", label: "Date & time step", stage_order: 2 },
  { stage: "booking_patient_info_viewed", label: "Patient info step", stage_order: 3 },
  { stage: "booking_checkout_viewed", label: "Checkout step", stage_order: 4 },
  { stage: "redirected_to_checkout", label: "Redirected to Stripe", stage_order: 5 },
  { stage: "payment_success", label: "Payment success", stage_order: 6 },
] as const;

function getNewYorkParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).formatToParts(date);

  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";

  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    hour: Number(read("hour") || "0"),
    minute: Number(read("minute") || "0"),
  };
}

function getNewYorkDateString(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    visit_type: "Visit type",
    service: "Service",
    date_time: "Date & time",
    patient_info: "Patient info",
    address: "Address",
    lab_order: "Lab order",
    checkout: "Checkout",
  };

  const keyStage = KEY_FUNNEL_STAGES.find((item) => item.stage === stage);
  if (keyStage) return keyStage.label;
  return labels[stage] || stage.replace(/_/g, " ");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractSource(referrer: string | null): string {
  if (!referrer) return "direct";

  try {
    const url = new URL(referrer);
    return url.hostname.replace(/^www\./, "") || "direct";
  } catch {
    return referrer.replace(/^https?:\/\//, "").split("/")[0] || "direct";
  }
}

function buildDropoffs(stages: FunnelRow[]): DropoffRow[] {
  const rows: DropoffRow[] = [];

  for (let i = 0; i < stages.length - 1; i += 1) {
    const current = stages[i];
    const next = stages[i + 1];
    const lostSessions = Math.max(current.sessions - next.sessions, 0);
    const lossRate = current.sessions > 0 ? (lostSessions / current.sessions) * 100 : 0;

    rows.push({
      from: current.label,
      to: next.label,
      lostSessions,
      lossRate,
    });
  }

  return rows.sort((a, b) => b.lostSessions - a.lostSessions);
}

async function fetchAllRows<T>(
  client: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  timestampColumn: string,
  lowerBoundIso: string,
): Promise<T[]> {
  const batchSize = 1000;
  let from = 0;
  const rows: T[] = [];

  while (true) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .gte(timestampColumn, lowerBoundIso)
      .order(timestampColumn, { ascending: true })
      .range(from, from + batchSize - 1);

    if (error) throw error;

    const batch = (data || []) as T[];
    rows.push(...batch);

    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const reportSecret = Deno.env.get("NIGHTLY_TRAFFIC_REPORT_SECRET") || "";
  const mailgunApiKey = Deno.env.get("MAILGUN_API_KEY") || "";
  const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN") || "mg.convelabs.com";
  const ownerEmail = Deno.env.get("NIGHTLY_TRAFFIC_REPORT_TO_EMAIL") || "nicodemmebaptiste@convelabs.com";
  const mailgunFrom = Deno.env.get("MAILGUN_FROM") || "ConveLabs Ops <info@convelabs.com>";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const requestSecret =
      req.headers.get("x-report-secret") ||
      req.headers.get("x-cron-secret") ||
      body?.secret ||
      "";

    if (reportSecret && requestSecret !== reportSecret) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const force = body?.force === true;
    const dryRun = body?.dryRun === true;
    const ny = getNewYorkParts();
    const reportDate = typeof body?.reportDate === "string" && body.reportDate ? body.reportDate : ny.date;

    if (!force && ny.hour !== 23) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: true,
        reason: "outside_report_window",
        reportDate,
        localHour: ny.hour,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const lowerBoundIso = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const [allSessions, allPageViews, allFunnelEvents] = await Promise.all([
      fetchAllRows<VisitorSessionRow>(
        supabase,
        "visitor_sessions",
        "session_id, visitor_id, referrer, started_at",
        "started_at",
        lowerBoundIso,
      ),
      fetchAllRows<PageViewEventRow>(
        supabase,
        "page_view_events",
        "session_id, page_path, viewed_at",
        "viewed_at",
        lowerBoundIso,
      ),
      fetchAllRows<FunnelEventRow>(
        supabase,
        "conversion_funnel_events",
        "session_id, stage, occurred_at, event_data",
        "occurred_at",
        lowerBoundIso,
      ),
    ]);

    const sessions = allSessions.filter((row) => getNewYorkDateString(row.started_at) === reportDate);
    const pageViews = allPageViews.filter((row) => getNewYorkDateString(row.viewed_at) === reportDate);
    const funnelEvents = allFunnelEvents.filter((row) => getNewYorkDateString(row.occurred_at) === reportDate);

    const uniqueVisitorIds = new Set(sessions.map((row) => row.visitor_id));
    const bookNowSessions = new Set(
      pageViews.filter((row) => row.page_path === "/book-now").map((row) => row.session_id),
    );

    const summary: Summary = {
      sessions: sessions.length,
      unique_visitors: uniqueVisitorIds.size,
      page_views: pageViews.length,
      book_now_sessions: bookNowSessions.size,
    };

    const pageCounts = new Map<string, number>();
    for (const row of pageViews) {
      pageCounts.set(row.page_path, (pageCounts.get(row.page_path) || 0) + 1);
    }
    const topPages: TopPageRow[] = Array.from(pageCounts.entries())
      .map(([page_path, views]) => ({ page_path, views }))
      .sort((a, b) => b.views - a.views || a.page_path.localeCompare(b.page_path))
      .slice(0, 6);

    const sourceCounts = new Map<string, number>();
    for (const row of sessions) {
      const source = extractSource(row.referrer);
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    }
    const topSources: TopSourceRow[] = Array.from(sourceCounts.entries())
      .map(([source, sessionsCount]) => ({ source, sessions: sessionsCount }))
      .sort((a, b) => b.sessions - a.sessions || a.source.localeCompare(b.source))
      .slice(0, 6);

    const funnel: FunnelRow[] = KEY_FUNNEL_STAGES.map((item) => {
      const stageSessions = new Set(
        funnelEvents
          .filter((row) => row.stage === item.stage)
          .map((row) => row.session_id),
      );

      return {
        ...item,
        sessions: stageSessions.size,
      };
    });

    const abandonmentCounts = new Map<string, Set<string>>();
    for (const event of funnelEvents) {
      if (event.stage !== "booking_page_abandoned") continue;
      const stage = typeof event.event_data?.stage === "string" ? event.event_data.stage : "unknown";
      if (!abandonmentCounts.has(stage)) abandonmentCounts.set(stage, new Set());
      abandonmentCounts.get(stage)?.add(event.session_id);
    }
    const abandonments: AbandonmentRow[] = Array.from(abandonmentCounts.entries())
      .map(([stage, sessionIds]) => ({ stage, sessions: sessionIds.size }))
      .sort((a, b) => b.sessions - a.sessions || a.stage.localeCompare(b.stage))
      .slice(0, 6);

    const dropoffs = buildDropoffs(funnel).filter((row) => row.lostSessions > 0).slice(0, 4);

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true,
        dryRun: true,
        reportDate,
        localTime: ny,
        summary,
        topPages,
        topSources,
        funnel,
        dropoffs,
        abandonments,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!mailgunApiKey) {
      throw new Error("Missing MAILGUN_API_KEY");
    }

    const topPagesHtml = topPages.length > 0
      ? topPages.map((row) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${escapeHtml(row.page_path || "(unknown)")}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${row.views}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="2" style="padding:8px 0;color:#6b7280;">No page-view data yet for this day.</td></tr>`;

    const topSourcesHtml = topSources.length > 0
      ? topSources.map((row) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(row.source || "direct")}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${row.sessions}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="2" style="padding:8px 0;color:#6b7280;">No source data yet for this day.</td></tr>`;

    const funnelHtml = funnel.map((row) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(row.label)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${row.sessions}</td>
      </tr>
    `).join("");

    const dropoffHtml = dropoffs.length > 0
      ? dropoffs.map((row) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(row.from)} → ${escapeHtml(row.to)}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${row.lostSessions}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${row.lossRate.toFixed(1)}%</td>
          </tr>
        `).join("")
      : `<tr><td colspan="3" style="padding:8px 0;color:#6b7280;">Not enough funnel depth yet to calculate meaningful stage-to-stage drop-off.</td></tr>`;

    const abandonmentHtml = abandonments.length > 0
      ? abandonments.map((row) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(formatStageLabel(row.stage))}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${row.sessions}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="2" style="padding:8px 0;color:#6b7280;">No explicit abandonment events recorded for this day.</td></tr>`;

    const html = `
      <!doctype html>
      <html>
        <body style="font-family:Arial,sans-serif;background:#f8fafc;color:#111827;padding:24px;">
          <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#7f1d1d,#b91c1c);color:#fff;padding:24px 28px;">
              <h1 style="margin:0 0 6px;font-size:24px;">ConveLabs Nightly Traffic Report</h1>
              <p style="margin:0;font-size:14px;opacity:0.9;">${escapeHtml(reportDate)} · generated at 11 PM Eastern</p>
            </div>
            <div style="padding:24px 28px;">
              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
                <div style="flex:1;min-width:140px;background:#fef2f2;border-radius:12px;padding:16px;">
                  <div style="font-size:12px;color:#991b1b;text-transform:uppercase;font-weight:700;letter-spacing:0.08em;">Sessions</div>
                  <div style="font-size:30px;font-weight:700;margin-top:4px;">${summary.sessions}</div>
                </div>
                <div style="flex:1;min-width:140px;background:#fff7ed;border-radius:12px;padding:16px;">
                  <div style="font-size:12px;color:#9a3412;text-transform:uppercase;font-weight:700;letter-spacing:0.08em;">Visitors</div>
                  <div style="font-size:30px;font-weight:700;margin-top:4px;">${summary.unique_visitors}</div>
                </div>
                <div style="flex:1;min-width:140px;background:#eff6ff;border-radius:12px;padding:16px;">
                  <div style="font-size:12px;color:#1d4ed8;text-transform:uppercase;font-weight:700;letter-spacing:0.08em;">Page Views</div>
                  <div style="font-size:30px;font-weight:700;margin-top:4px;">${summary.page_views}</div>
                </div>
                <div style="flex:1;min-width:140px;background:#f0fdf4;border-radius:12px;padding:16px;">
                  <div style="font-size:12px;color:#15803d;text-transform:uppercase;font-weight:700;letter-spacing:0.08em;">Book Now Sessions</div>
                  <div style="font-size:30px;font-weight:700;margin-top:4px;">${summary.book_now_sessions}</div>
                </div>
              </div>

              <h2 style="font-size:18px;margin:0 0 10px;">Where they dropped off</h2>
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                <thead>
                  <tr>
                    <th style="text-align:left;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Stage transition</th>
                    <th style="text-align:right;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Lost</th>
                    <th style="text-align:right;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Rate</th>
                  </tr>
                </thead>
                <tbody>${dropoffHtml}</tbody>
              </table>

              <h2 style="font-size:18px;margin:0 0 10px;">Explicit abandonment events</h2>
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                <thead>
                  <tr>
                    <th style="text-align:left;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Stage</th>
                    <th style="text-align:right;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Sessions</th>
                  </tr>
                </thead>
                <tbody>${abandonmentHtml}</tbody>
              </table>

              <h2 style="font-size:18px;margin:0 0 10px;">Booking funnel depth</h2>
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                <thead>
                  <tr>
                    <th style="text-align:left;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Stage</th>
                    <th style="text-align:right;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Sessions</th>
                  </tr>
                </thead>
                <tbody>${funnelHtml}</tbody>
              </table>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                <div>
                  <h2 style="font-size:18px;margin:0 0 10px;">Top pages</h2>
                  <table style="width:100%;border-collapse:collapse;">
                    <thead>
                      <tr>
                        <th style="text-align:left;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Path</th>
                        <th style="text-align:right;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Views</th>
                      </tr>
                    </thead>
                    <tbody>${topPagesHtml}</tbody>
                  </table>
                </div>
                <div>
                  <h2 style="font-size:18px;margin:0 0 10px;">Top sources</h2>
                  <table style="width:100%;border-collapse:collapse;">
                    <thead>
                      <tr>
                        <th style="text-align:left;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Source</th>
                        <th style="text-align:right;padding:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>${topSourcesHtml}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const formData = new FormData();
    formData.append("from", mailgunFrom);
    formData.append("to", ownerEmail);
    formData.append("subject", `ConveLabs Nightly Traffic Report — ${reportDate}`);
    formData.append("html", html);

    const response = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${mailgunApiKey}`)}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Mailgun error: ${text}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      sent: true,
      reportDate,
      summary,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[send-nightly-traffic-report]", error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
