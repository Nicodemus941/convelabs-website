// ────────────────────────────────────────────────────────────────────────
// Frank — the ConveLabs CFO agent.
//
// Frank operates as if he runs the finance org of a multi-billion-dollar
// company, applied to a mobile-phlebotomy startup. He tracks every dollar of
// revenue, tells the owner exactly how to allocate it (owner pay, profit,
// tax, marketing, growth, OpEx, labor), and produces daily / weekly / monthly
// / YTD reports + forward guidance.
//
// Financial truth comes from Postgres RPCs (frank_cfo_snapshot /
// frank_cfo_daily_trend / frank_cfo_concentration) so Frank never does math on
// raw rows — he narrates pre-computed, accurate figures. Revenue source of
// truth is stripe_qb_sync_log, identical to the owner dashboards, so the
// numbers never disagree across surfaces.
//
// Pattern mirrors ai-ops-assistant: Claude tool-use loop, Haiku model,
// max 6 iterations, returns { success, response, usage }.
// ────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are **Frank**, the Chief Financial Officer of ConveLabs — a mobile phlebotomy (at-home blood draw) company based in Central Florida.

# Who you are
You carry yourself like the CFO of a multi-billion-dollar enterprise, but you apply that rigor to a lean, fast-growing startup currently doing roughly $10–15K/month in revenue. You are precise, direct, and protective of the company's cash. You are solely accountable for the long-term financial health of ConveLabs. You think in unit economics, margins, runway, and allocation discipline — never vague generalities.

You speak to **Nicodemme (the owner/CEO)**. Address him directly. Be warm but unsentimental about money. A good CFO tells the truth even when it's uncomfortable.

# Your financial framework (Hormozi "Profit First" + marketplace discipline)
Every dollar that lands gets a job the moment it arrives. You allocate revenue into buckets. The exact split depends on the company's current operating mode and MRR tier:

**Current mode: OWNER-OPERATOR** (the owner currently performs the draws himself — there is no separate phlebotomist labor cash-out, so labor COGS is ~$0). In this mode your recommended allocation of GROSS revenue is:
- Owner's Pay: 40%
- Profit (untouchable reserve, quarterly distribution): 20%
- Tax (held for quarterly estimated taxes): 15%
- Marketing & Growth (acquisition + content + ads): 15%
- Operating Expenses (software, supplies, insurance, phone): 10%

**When a 1099 phlebotomist is hired (FRANCHISE/TEAM mode)**, labor becomes a real ~30% COGS and the split shifts to:
- Owner's Pay: 25% · Profit: 15% · Tax: 15% · Marketing/Growth: 10% · OpEx: 5% · Phleb Labor: 30%

Always state which mode you're allocating for. If the snapshot shows owner_is_phleb=true, use OWNER-OPERATOR mode.

# Two layers of profit — never confuse them
- **Gross profit / gross margin** = revenue minus direct COGS (Stripe fees + per-visit supplies + phleb labor). This is the unit-economics number.
- **Net profit / net margin** = gross profit minus the owner-entered OPERATING EXPENSES (payroll, debt, rent, software, insurance, marketing, owner draws, etc.). This is the "does the whole business make money" number. A 90% gross margin can still be a NEGATIVE net margin if fixed costs outrun revenue — always check both.
- The snapshot returns both: gross_profit/gross_margin_pct AND net_profit/net_margin_pct, plus operating_expenses for the window and monthly_burn (current recurring run-rate).

# Burn & runway
- **monthly_burn** = the sum of all currently-active RECURRING expenses normalized to a monthly figure. This is the cash that goes out the door every month regardless of revenue.
- **runway_months** = months of survival if revenue stopped, given cash_on_hand ÷ net monthly burn. NULL means the business is cash-flow positive (not burn-limited) OR the owner hasn't entered a cash-on-hand figure. If cash_on_hand is 0, tell the owner to enter it on the Expenses page so you can compute true runway.
- Recurring expenses are modeled at the CURRENT run-rate (today's active costs projected across the window), so a YTD net figure answers "what would the year look like at today's cost structure." One-time expenses are counted only in the window they actually fall in.

# Key Hormozi/CFO principles you enforce
- **Never pay a fixed cost to solve a variable problem** — keep labor per-visit until demand is proven (150+ visits/mo for 6 months).
- **Profit First** — profit is not what's left over; it's taken off the top first and never touched for operations.
- **Tax is not your money** — hold it the moment revenue lands. A surprise tax bill is a CFO failure.
- **Owner pay must be real** — an underpaid owner makes survival decisions, not growth decisions. Push for a market-rate CEO salary.
- **Revenue concentration is risk** — if any single customer/partner exceeds ~30% of revenue, flag it (the "Switzerland" rule).
- **Watch the margin, not just the top line** — gross margin below target means the unit economics are broken; net margin below zero means the cost structure is broken.
- **Burn discipline** — every recurring dollar of cost must earn its place. When asked about expenses, call out the largest categories and whether burn is covered by revenue.

# The expense ledger
Operating expenses come from a ledger the owner maintains on the Expenses page of the dashboard (payroll, debt, rent, software, insurance, marketing, owner draws, equipment, etc.). If operating_expenses is 0 or monthly_burn is 0, the owner hasn't entered their costs yet — tell them you can only show GROSS profit until they log expenses, and point them to the Expenses page. Never invent expense figures.

# How you work
- ALWAYS call your tools to get real numbers before giving any figure. Never invent or estimate a dollar amount — pull it.
- For any report (daily/weekly/monthly/YTD), call financial_report for that period. For allocation guidance, call allocation_plan. For trends, call revenue_trend.
- Present money clearly: "$12,576" not "12576 dollars". Use tables when comparing periods or showing allocations.
- Lead with the headline number, then the breakdown, then 1–3 specific actions. End reports with a short "Frank's take" — your blunt CFO opinion.
- Use ⚠️ for risks, ✅ for healthy signals.
- Be concise. The owner is busy. No filler.

# Reporting cadence Frank offers
- **Daily**: today's revenue, charges, anything needing eyes.
- **Weekly**: week-to-date vs last week, trend, allocation of the week's cash.
- **Monthly**: MTD vs last month, projected month-end, margin, full allocation plan, outstanding invoices.
- **YTD**: year-to-date gross/net, membership vs service mix, margin, concentration risk, strategic guidance.

When the owner just says "report" or "how are we doing", default to a monthly (MTD) report plus the allocation plan.

Today's date is provided in each request. All periods are in America/New_York time.`;

// ── Tool definitions ──────────────────────────────────────────────────────
const tools = [
  {
    name: "financial_report",
    description:
      "Pull authoritative financial figures for a named period: gross/net revenue, Stripe fees, refunds, membership vs service revenue split, completed visits, average visit revenue, COGS, gross profit, gross margin %, unclassified charges, and outstanding invoices. Use this for ALL reports (daily, weekly, monthly, YTD) and before quoting any dollar figure.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday", "wtd", "last_week", "mtd", "last_month", "qtd", "ytd", "all", "last_30_days"],
          description:
            "today=since midnight ET; yesterday=prior calendar day; wtd=week-to-date (Mon start); last_week=previous full Mon–Sun; mtd=month-to-date; last_month=previous full month; qtd=quarter-to-date; ytd=year-to-date; all=all time; last_30_days=trailing 30 days.",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "allocation_plan",
    description:
      "Compute the Profit First allocation of a period's GROSS revenue into buckets (Owner Pay, Profit, Tax, Marketing/Growth, OpEx, and Phleb Labor when in team mode). Returns each bucket's percentage and exact dollar amount. Auto-detects owner-operator vs team mode from the data. Use when the owner asks how to allocate, split, or distribute money, or as the second half of a monthly/YTD report.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday", "wtd", "last_week", "mtd", "last_month", "qtd", "ytd", "all", "last_30_days"],
          description: "Same period semantics as financial_report.",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "revenue_trend",
    description:
      "Daily revenue and visit counts for the trailing N days (default 14), oldest to newest. Use to describe momentum, week-over-week movement, or spot slow/strong days.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of trailing days, 1–90. Default 14." },
      },
      required: [],
    },
  },
  {
    name: "revenue_concentration",
    description:
      "Top customers by revenue for a period and what % of total each represents (the Built-to-Sell 'Switzerland' rule — concentration is risk). Use when assessing customer-concentration risk or who the biggest accounts are.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["mtd", "last_month", "qtd", "ytd", "all", "last_30_days"],
          description: "Period to analyze concentration over.",
        },
        limit: { type: "number", description: "How many top customers to return (default 10)." },
      },
      required: ["period"],
    },
  },
  {
    name: "expense_breakdown",
    description:
      "Owner-entered operating expenses: current monthly burn (recurring costs normalized to a monthly figure), a category breakdown (payroll, debt, rent, software, marketing, insurance, etc.), payroll and debt subtotals, one-time costs falling in the period, and total expenses for the window. Use when the owner asks about costs, expenses, burn, payroll, debt, or what they're spending money on, and as part of any monthly/YTD net-profit report.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday", "wtd", "last_week", "mtd", "last_month", "qtd", "ytd", "all", "last_30_days"],
          description: "Period to total one-time and prorated recurring expenses over.",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "cash_runway",
    description:
      "Current cash position: monthly burn vs trailing-30-day revenue run-rate, net monthly cash flow, cash on hand, and runway in months. Use when the owner asks about runway, burn rate, how long the cash lasts, or whether the business is cash-flow positive.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ── ET-aware period → [startISO, endISO) resolver ─────────────────────────
function etParts(d: Date) {
  // Returns Y/M/D/H as observed in America/New_York for a given instant.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +(p.hour === "24" ? "0" : p.hour) };
}

// Build a UTC ISO string for a given ET wall-clock midnight (Y-M-D 00:00 ET).
// ET is UTC-5 (EST) or UTC-4 (EDT). We resolve the offset empirically.
function etMidnightISO(y: number, m: number, d: number): string {
  // Guess at noon UTC to read the ET offset for that calendar date, then
  // construct the precise midnight instant.
  const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = etParts(guess);
  // offset hours = UTC hour(12) - ET hour observed
  const offset = 12 - parts.h; // 4 (EDT) or 5 (EST)
  return new Date(Date.UTC(y, m - 1, d, offset, 0, 0)).toISOString();
}

function resolvePeriod(period: string): { start: string; end: string; label: string } {
  const now = new Date();
  const t = etParts(now);
  const todayStart = etMidnightISO(t.y, t.m, t.d);
  const tomorrow = new Date(Date.UTC(t.y, t.m - 1, t.d + 1, 12));
  const tp = etParts(tomorrow);
  const tomorrowStart = etMidnightISO(tp.y, tp.m, tp.d);

  const dayOfWeek = new Date(Date.UTC(t.y, t.m - 1, t.d)).getUTCDay(); // 0=Sun
  const mondayOffset = (dayOfWeek + 6) % 7; // days since Monday

  const mkPrevDay = (n: number) => {
    const dt = new Date(Date.UTC(t.y, t.m - 1, t.d - n, 12));
    const p = etParts(dt);
    return etMidnightISO(p.y, p.m, p.d);
  };

  switch (period) {
    case "today":
      return { start: todayStart, end: tomorrowStart, label: "Today" };
    case "yesterday":
      return { start: mkPrevDay(1), end: todayStart, label: "Yesterday" };
    case "wtd":
      return { start: mkPrevDay(mondayOffset), end: tomorrowStart, label: "Week-to-date" };
    case "last_week": {
      const start = mkPrevDay(mondayOffset + 7);
      const end = mkPrevDay(mondayOffset);
      return { start, end, label: "Last week" };
    }
    case "mtd":
      return { start: etMidnightISO(t.y, t.m, 1), end: tomorrowStart, label: "Month-to-date" };
    case "last_month": {
      const lm = t.m === 1 ? 12 : t.m - 1;
      const ly = t.m === 1 ? t.y - 1 : t.y;
      return {
        start: etMidnightISO(ly, lm, 1),
        end: etMidnightISO(t.y, t.m, 1),
        label: "Last month",
      };
    }
    case "qtd": {
      const qStartMonth = Math.floor((t.m - 1) / 3) * 3 + 1;
      return { start: etMidnightISO(t.y, qStartMonth, 1), end: tomorrowStart, label: "Quarter-to-date" };
    }
    case "ytd":
      return { start: etMidnightISO(t.y, 1, 1), end: tomorrowStart, label: "Year-to-date" };
    case "last_30_days":
      return { start: mkPrevDay(30), end: tomorrowStart, label: "Last 30 days" };
    case "all":
      return { start: "2020-01-01T00:00:00.000Z", end: tomorrowStart, label: "All time" };
    default:
      return { start: etMidnightISO(t.y, t.m, 1), end: tomorrowStart, label: "Month-to-date" };
  }
}

// ── Allocation logic (Profit First, mode-aware) ───────────────────────────
function buildAllocation(gross: number, ownerIsPhleb: boolean) {
  const buckets = ownerIsPhleb
    ? [
        { name: "Owner's Pay", pct: 40 },
        { name: "Profit (reserve)", pct: 20 },
        { name: "Tax", pct: 15 },
        { name: "Marketing & Growth", pct: 15 },
        { name: "Operating Expenses", pct: 10 },
      ]
    : [
        { name: "Owner's Pay", pct: 25 },
        { name: "Profit (reserve)", pct: 15 },
        { name: "Tax", pct: 15 },
        { name: "Marketing & Growth", pct: 10 },
        { name: "Operating Expenses", pct: 5 },
        { name: "Phlebotomist Labor", pct: 30 },
      ];
  return {
    mode: ownerIsPhleb ? "owner-operator" : "team",
    gross_revenue: Math.round(gross * 100) / 100,
    buckets: buckets.map((b) => ({
      name: b.name,
      pct: b.pct,
      amount: Math.round(gross * (b.pct / 100) * 100) / 100,
    })),
  };
}

// ── Tool executor ─────────────────────────────────────────────────────────
async function executeTool(supabase: any, name: string, input: any): Promise<any> {
  if (name === "financial_report") {
    const { start, end, label } = resolvePeriod(input.period);
    const { data, error } = await supabase.rpc("frank_cfo_snapshot", { p_start: start, p_end: end });
    if (error) return { error: error.message };
    return { period: label, ...data };
  }

  if (name === "allocation_plan") {
    const { start, end, label } = resolvePeriod(input.period);
    const { data, error } = await supabase.rpc("frank_cfo_snapshot", { p_start: start, p_end: end });
    if (error) return { error: error.message };
    const alloc = buildAllocation(data.gross_revenue || 0, data.owner_is_phleb === true);
    return { period: label, ...alloc, note: "Allocation is of GROSS revenue. Hold Tax and Profit in separate accounts the moment cash lands." };
  }

  if (name === "revenue_trend") {
    const days = Math.max(1, Math.min(90, Math.round(input.days || 14)));
    const { start, end } = resolvePeriod("last_30_days");
    // Use a precise N-day window ending tomorrow-start.
    const endISO = end;
    const startDt = new Date(new Date(endISO).getTime() - days * 86400000);
    const { data, error } = await supabase.rpc("frank_cfo_daily_trend", {
      p_start: startDt.toISOString(),
      p_end: endISO,
    });
    if (error) return { error: error.message };
    const total = (data || []).reduce((s: number, r: any) => s + Number(r.gross || 0), 0);
    return { days, daily: data, total_revenue: Math.round(total * 100) / 100, ignore: start };
  }

  if (name === "revenue_concentration") {
    const { start, end, label } = resolvePeriod(input.period);
    const { data, error } = await supabase.rpc("frank_cfo_concentration", {
      p_start: start,
      p_end: end,
      p_limit: Math.max(3, Math.min(25, Math.round(input.limit || 10))),
    });
    if (error) return { error: error.message };
    return { period: label, ...data };
  }

  if (name === "expense_breakdown") {
    const { start, end, label } = resolvePeriod(input.period);
    const { data, error } = await supabase.rpc("frank_cfo_expenses", { p_start: start, p_end: end });
    if (error) return { error: error.message };
    return { period: label, ...data };
  }

  if (name === "cash_runway") {
    // Burn/runrate/cash are present-tense; window only scopes one-time costs.
    const { start, end } = resolvePeriod("last_30_days");
    const { data, error } = await supabase.rpc("frank_cfo_expenses", { p_start: start, p_end: end });
    if (error) return { error: error.message };
    return data;
  }

  return { error: `Unknown tool: ${name}` };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "messages array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const today = new Date().toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const systemWithDate = `${SYSTEM_PROMPT}\n\nToday is ${today} (America/New_York).`;

    const claudeMessages = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    let iterations = 0;
    let finalUsage: any = null;

    while (iterations < 6) {
      iterations++;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2048,
          system: systemWithDate,
          tools,
          messages: claudeMessages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return new Response(
          JSON.stringify({ success: false, error: `Claude API error: ${errText}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const data = await response.json();
      finalUsage = data.usage;

      const hasToolUse = Array.isArray(data.content) && data.content.some((c: any) => c.type === "tool_use");

      if (data.stop_reason === "end_turn" || !hasToolUse) {
        const text = (data.content || [])
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("");
        return new Response(
          JSON.stringify({ success: true, response: text, usage: finalUsage }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      claudeMessages.push({ role: "assistant", content: data.content });

      const toolResults = [];
      for (const block of data.content) {
        if (block.type === "tool_use") {
          let result: any;
          try {
            result = await executeTool(supabase, block.name, block.input || {});
          } catch (e) {
            result = { error: String(e) };
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }
      claudeMessages.push({ role: "user", content: toolResults });
    }

    // Iteration cap hit — return whatever the last text was.
    return new Response(
      JSON.stringify({
        success: true,
        response:
          "I ran several analyses but reached my tool-call limit. Ask me for one specific report (e.g. 'monthly report' or 'how should I allocate this month's revenue') and I'll give you a clean answer.",
        usage: finalUsage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
