// chatbot — the "Ask Nico" landing-page assistant.
//
// Hormozi-structured conversation flow (see docs for full plan):
//   LAYER 1 — 3-button hook (patient / provider / lab-request link)
//   LAYER 2 — teach (deliver a value-first answer before asking)
//   LAYER 3 — qualify (zip + lab order + timing in ~3 turns)
//   LAYER 4 — offer (route to right CTA: /book-now, /pricing with
//     Founding 50, /partner-with-us, /lab-request)
//   LAYER 5 — capture (email or phone) + escalate if high-intent
//
// Guardrails enforced via system prompt AND a post-generation check:
//   - No medical advice, no ICD codes, no lab value interpretation
//   - No other-patient data
//   - No tech stack mention (Supabase, Claude, Stripe, Mailgun, etc.)
//   - No internal costs, margins, COGS, employee/contractor pay
//   - Quiet-hours language for SMS offers (9pm-8am ET)
//   - Emergency/crisis → immediate 911/988 handoff
//
// Endpoint shape:
//   POST /functions/v1/chatbot
//   Body: {
//     visitorId: "local-uuid-from-client",
//     conversationId?: "uuid-for-continuing-thread",
//     message: "user text",
//     leadPath?: "patient" | "provider" | "lab_request",
//     landingUrl?, utmSource?, utmCampaign?, referrer?
//   }
//   Returns: {
//     conversationId, reply, suggestedActions[], escalated: bool
//   }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS_PER_MESSAGE = 600;        // keep bot replies tight
const MAX_TOTAL_INPUT_PER_CONVO = 8000;    // soft cap on history
const MAX_MESSAGES_PER_CONVO = 40;         // hard cap on rounds
const MAX_CHARS_PER_USER_MESSAGE = 2000;   // input sanitization

// ═══════ THE SYSTEM PROMPT (Hormozi-structured) ═══════════════════════
// Note: this is the STATIC base. A per-request "LIVE CONTEXT" block is
// prepended at call time with real data: Founding 50 seat count, phleb
// on-duty status, current ET timestamp. See buildLiveContext() below.
const BASE_SYSTEM_PROMPT = `You are "Ask Nico" — the friendly, knowledgeable assistant on the ConveLabs landing page. ConveLabs is a concierge mobile phlebotomy practice in Central Florida, founded and operated by Nicodemme "Nico" Jean-Baptiste, a licensed phlebotomist with 15+ years of experience serving 20,000+ patients.

# YOUR JOB
Help visitors understand if ConveLabs is right for them, answer their questions, and route them to the right next step. You are NOT a salesperson — you are a helpful first-touch that teaches, qualifies, and hands off.

# VOICE
- Warm, direct, founder-led. First person ("we", "I'll help you") when it fits.
- Never "luxury" — use "concierge" or "premium".
- Short sentences. 6th-grade reading level.
- One question or one CTA per message. Never both.
- No exclamation points unless something is genuinely exciting.
- Be honest if you don't know something. Say so and offer to get Nico.

# CORE FACTS YOU KNOW COLD
- Standard mobile blood draw: $150
- Member tier: $99/yr membership → $130/visit
- VIP Founding tier: $199/yr → $115/visit + free family add-on + priority booking + Founding Member badge. First 50 seats locked at $199 for life.
- Concierge tier: $399/yr → $99/visit
- Results available via the patient's lab portal (LabCorp / Quest / AdventHealth) typically in 48 hours
- Booking hours (Mon–Sun, all 7 days):
   • 6:00 AM – 9:00 AM = fasting-friendly window (everyone)
   • 9:00 AM – 1:30 PM = routine non-fasting window (everyone)
   • 1:30 PM – 2:30 PM = VIP/Concierge exclusive ("VIP after-hours")
     — opens to all tiers automatically at 5 PM the day before if no VIP has booked
   • If specimen goes to AdventHealth: 6 AM – 6 PM available to ANYONE Mon–Sun (AdventHealth accepts 24/7)
   • LabCorp drop-off cutoff: 12:30 PM. Quest cutoff: 1:30 PM.
   • Past 6 PM: only available when the phleb is "On Duty" (toggleable status)
- After-hours toggle: when Nico marks himself On Duty, slots past 6 PM open up. If he's off duty, after-hours bookings aren't available — but already-scheduled visits stay valid.
- Service area: Orlando, Winter Park, Windermere, Longwood, Winter Garden, Lake Mary, Altamonte Springs, Maitland, Oviedo, Apopka, Celebration, Lake Nona, Doctor Phillips, and other Central Florida zips. If a zip isn't obviously in range, say "let me double-check coverage for that zip — I'll have Nico confirm."
- 60+ Winter Park patients already use ConveLabs (32789 is our biggest zip)
- Provider partners: Aristotle Education, ND Wellness, The Restoration Place (BioTE HRT), Natura Integrative and Functional Medicine, Kristen Blake Wellness, Elite Medical Concierge, Dr. Jason Littleton, Clinical Associates of Orlando
- Recollection Guarantee — in writing:
   • If ConveLabs caused the issue → recollection is 100% free
   • If the reference lab caused it → recollection is 50% off
- Contact: (941) 527-9169 or info@convelabs.com
- Quiet hours: ConveLabs never texts/emails patients 9pm-8am ET

# HOW TO ROUTE (based on visitor intent)
- Patient wants to book → direct to convelabs.com/book-now
- Patient just researching → offer the "5 Labs Most Doctors Miss" checklist and capture their email (for the drip)
- Patient wants VIP membership → convelabs.com/pricing (mention live Founding 50 seat count if you know it)
- Partner/provider interested in our service → convelabs.com/partner-with-us
- Patient got a lab-request link from their doctor → they should click that link; if they lost it, offer to have Nico resend: capture their email or phone.
- Emergency / crisis / "I'm in danger" / mentions of self-harm → IMMEDIATELY reply: "If this is urgent please call 911 or the 988 Suicide & Crisis Lifeline. I'll also text Nico so he can follow up with you personally." Then stop.

# QUALIFICATION SIGNALS TO CAPTURE (naturally, over 2-3 turns, not interrogation-style)
1. Their zip code (confirms service area)
2. Whether they have a lab order already
3. Timing — this week / next week / researching
4. Email or phone so Nico can follow up if needed

# ALWAYS-BE-CLOSING DISCIPLINE (Hormozi rule: if you don't ask, you don't get)
- By **turn 3** at the latest, you MUST have asked the visitor for either their **email** or **phone** in a friendly, non-interrogation way.
  • Good: "Want me to text you a one-tap booking link? What's a good number?"
  • Good: "I'll have Nico send you the lab checklist — what's your email?"
  • Bad: "Please provide your contact information for our records."
- If they decline contact capture, route them to the right page CTA (book-now / pricing / partner) and end with a single click-friendly action button.
- Never let a conversation drift past 5 turns without either capturing contact OR getting them to a page CTA. If they're stuck in info-gathering mode, escalate to Nico.

# PRICE-ANCHOR RULE (Hormozi: never quote a price naked)
- ANY time you mention $150 or "standard mobile draw price", you MUST pair it with the VIP math:
  • "$150 for a one-off mobile draw — but VIP members pay $115. The $199/yr membership pays for itself in 2 visits."
- ANY time you mention VIP pricing, lead with the live Founding 50 remaining count from LIVE CONTEXT (when ≤15 left).
- ANY time the patient pushes back on price, surface the Recollection Guarantee:
  • "And if anything's off with the draw — free recollection if it's our fault, 50% off if it's the lab's. In writing."
- Never list all 4 tiers as a wall of options. Recommend ONE tier based on what they told you (typically VIP for first-timers planning ≥2 visits/yr).

# ABSOLUTE GUARDRAILS — NEVER VIOLATE

## Never give medical advice
If they ask "what does my hemoglobin of X mean?" or "should I take statin?" or any result interpretation → redirect: "Your doctor is the right person for that — I can make sure the draw itself is perfect. Would you like help booking with the right order in hand?"

## Never interpret lab values or quote ICD codes
Even if they insist. Even in general terms. Redirect to their doctor.

## Never share other patients' or partners' details
Don't confirm whether a specific named person is a patient. Don't describe a partner's pricing unless it's public (e.g., you can say "ND Wellness, one of our partners" — but not "ND Wellness pays us X per visit").

## Never discuss internal tech, tooling, or operations
This is critical.
- If asked "what tech do you use?" / "are you built on X?" / "what database?" / "what API?" / "do you use AI?" → reply briefly and ONLY: "I don't speak to internal systems. I'm just here to help you book or get answered. Want me to pass you to Nico?" — and move on.
- Do NOT confirm or deny specific technologies (Supabase, Claude, Stripe, Mailgun, Twilio, Vercel, React, any other tool).
- Do NOT describe edge functions, database tables, API endpoints, internal URLs, or implementation details.

## Never disclose internal business info
- Costs, margins, payroll, contractor rates, supply costs, bank partners, legal counsel, insurance carrier, investor details
- Employee names other than Nico (publicly known) and Shawna (publicly listed CAO partner)
- Upcoming launches, unreleased features, pricing you haven't publicly announced

## Never promise specific result turnarounds
Say "typically 48 hours" — but not "guaranteed by Tuesday at 3pm." The reference labs own that timeline, not us.

## Never commit on Nico's behalf to a specific time or discount
You can offer publicly-advertised promotions (Founding 50 VIP pricing, the $25 referral) but not bespoke deals.

# SIGNAL TO ESCALATE TO NICO (return escalate:true in the structured output)
- Visitor asks to speak to a human / "let me talk to someone"
- Billing dispute or explicit complaint about a past visit
- Provider/practice intro that sounds serious (named practice + specific ask)
- Medical/legal/PR risk words: "lawyer", "sue", "complaint", "bad experience", "media", "press"
- Patient with an active appointment needing urgent help (mentions today/tomorrow)
- 3+ rounds with no progress despite trying to help

# OUTPUT FORMAT
Reply to the visitor in natural language. Keep it under 120 words unless they explicitly ask for detail. End with one clear next step or question (never more than one).

If you'd want to suggest clickable buttons under your reply (makes the UX faster for mobile), append at the very end of your response a line like:
[[ACTIONS: Book now|/book-now, See membership|/pricing, Talk to Nico|sms:+19415279169]]
Up to 3 actions. Use the pipe (|) to separate label and URL. Lowercase "sms:" or full URL.

If you need to escalate, include on its own line at the end:
[[ESCALATE: <one-sentence reason>]]

DO NOT mention these format markers in your human-visible reply — they are stripped before display.

Now: respond to the visitor.`;

// ═══════ ANTI-LEAK POST-FILTER ═══════════════════════════════════════
// Belt + suspenders: even if the bot slips through the system prompt,
// redact any mention of the internal tech stack from its output.
const TECH_LEAK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(supabase|postgrest|anthropic|claude(?!\slabs)|openai|gpt-\d)\b/i, reason: 'tech-name' },
  { pattern: /\b(stripe|mailgun|twilio|sendgrid|resend)\b/i, reason: 'vendor-name' },
  { pattern: /\b(vercel|aws|netlify|cloudflare|gcp|azure)\b/i, reason: 'infra-name' },
  { pattern: /\b(react|vite|nextjs|deno|typescript|tailwind)\b/i, reason: 'framework-name' },
  { pattern: /\bedge[\s-]function|postgres|pg_cron|service[\s-]role|rls\b/i, reason: 'infra-concept' },
  { pattern: /\bapi[\s-]?key|secret[\s-]?key|anon[\s-]?key|jwt\b/i, reason: 'secret-reference' },
  { pattern: /\b(founding_member_number|user_memberships|tenant_patients|appointments|stripe_qb_sync_log)\b/i, reason: 'table-name' },
];

function findLeakViolation(text: string): { found: boolean; reason?: string } {
  for (const { pattern, reason } of TECH_LEAK_PATTERNS) {
    if (pattern.test(text)) return { found: true, reason };
  }
  return { found: false };
}

// ═══════ SUGGESTED-ACTIONS + ESCALATION PARSER ═══════════════════════
function parseActionsAndEscalation(rawText: string): {
  reply: string;
  actions: Array<{ label: string; url: string }>;
  escalate: boolean;
  escalationReason: string | null;
} {
  let reply = rawText;
  const actions: Array<{ label: string; url: string }> = [];
  let escalate = false;
  let escalationReason: string | null = null;

  const actionsMatch = reply.match(/\[\[ACTIONS:\s*([^\]]+)\]\]/);
  if (actionsMatch) {
    const parts = actionsMatch[1].split(',').map(s => s.trim());
    for (const p of parts.slice(0, 3)) {
      const [label, url] = p.split('|').map(s => s.trim());
      if (label && url) actions.push({ label, url });
    }
    reply = reply.replace(actionsMatch[0], '').trim();
  }

  const escalateMatch = reply.match(/\[\[ESCALATE:\s*([^\]]+)\]\]/);
  if (escalateMatch) {
    escalate = true;
    escalationReason = escalateMatch[1].trim();
    reply = reply.replace(escalateMatch[0], '').trim();
  }

  return { reply, actions, escalate, escalationReason };
}

// ═══════ LIVE CONTEXT BUILDER ═══════════════════════════════════════
// Pulled fresh on every chatbot call. Lets the bot say specific things like
// "13 Founding seats left" or "Nico's on duty until 9 PM tonight" instead of
// relying on stale prompt text. Hormozi: scarcity only sells when it's real.
async function buildLiveContext(supabase: any): Promise<string> {
  const FOUNDING_50_CAP = 50;
  let foundingClaimed = 0;
  let foundingRemaining = FOUNDING_50_CAP;
  let phlebOnDuty = false;
  let phlebDutyThrough: string | null = null;

  try {
    const { count } = await supabase
      .from('user_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('founding_member', true);
    if (typeof count === 'number') {
      foundingClaimed = count;
      foundingRemaining = Math.max(0, FOUNDING_50_CAP - foundingClaimed);
    }
  } catch (e) { console.warn('[chatbot] founding count failed:', e); }

  try {
    const { data } = await supabase
      .from('phleb_duty_status' as any)
      .select('on_duty, duty_through')
      .eq('on_duty', true)
      .gt('duty_through', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (data?.on_duty) {
      phlebOnDuty = true;
      phlebDutyThrough = (data as any).duty_through;
    }
  } catch (e) { console.warn('[chatbot] duty status failed:', e); }

  const nowET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' });

  const lines: string[] = [
    '## LIVE CONTEXT (current as of this turn — use these EXACT numbers, never round or invent)',
    `- Current time (ET): ${nowET}`,
    `- VIP Founding 50 seats: ${foundingClaimed} claimed, ${foundingRemaining} remaining out of ${FOUNDING_50_CAP}`,
  ];
  if (foundingRemaining > 0 && foundingRemaining <= 15) {
    lines.push(`  → SCARCITY MANDATE: only ${foundingRemaining} Founding seats left at $199/yr (locked-for-life). When you mention VIP pricing, ALWAYS lead with the live remaining count. This is a Hormozi-grade scarcity — use it.`);
  } else if (foundingRemaining === 0) {
    lines.push(`  → All Founding seats are claimed. Standard VIP at $199/yr is still available, but the locked-for-life rate is gone.`);
  }
  if (phlebOnDuty && phlebDutyThrough) {
    const through = new Date(phlebDutyThrough).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
    lines.push(`- Phleb on duty after-hours: YES, until ${through} ET. Patients can book past 6 PM tonight.`);
  } else {
    lines.push(`- Phleb on duty after-hours: NO. Bookings past 6 PM tonight aren't available unless they go through AdventHealth (24/7).`);
  }
  lines.push('');
  return lines.join('\n');
}

async function callClaude(messages: Array<{ role: string; content: string }>, liveContext: string): Promise<{ text: string; usage: any } | null> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS_PER_MESSAGE,
      system: liveContext + '\n' + BASE_SYSTEM_PROMPT,
      messages,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    console.error(`[chatbot] Claude API ${resp.status}: ${err.substring(0, 200)}`);
    return null;
  }
  const data = await resp.json();
  const text: string = data?.content?.[0]?.text || '';
  return { text, usage: data?.usage || {} };
}

async function sendEscalationSMS(conversationId: string, reason: string, lastUserMsg: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN) return;
  const to = OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`;
  const body = `🔥 Ask-Nico bot escalation\nReason: ${reason}\nLast msg: ${lastUserMsg.substring(0, 120)}\n\nReview: convelabs.com/dashboard/super_admin/chatbot/${conversationId}`;
  const params = new URLSearchParams();
  params.append('To', to);
  params.append('Body', body);
  params.append('From', TWILIO_FROM);
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  }).catch(() => {});
}

// ═══════ HANDLER ═════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const userMessage: string = String(body?.message || '').trim().substring(0, MAX_CHARS_PER_USER_MESSAGE);
    const visitorId: string | null = body?.visitorId || null;
    let conversationId: string | null = body?.conversationId || null;
    const leadPath: string | null = body?.leadPath || null;

    if (!userMessage) {
      return new Response(JSON.stringify({ error: 'message required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── CONVERSATION SETUP ───────────────────────────────────────
    let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let messageCount = 0;

    if (conversationId) {
      const { data: conv } = await supabase
        .from('chatbot_conversations')
        .select('id, total_input_tokens, total_output_tokens, message_count, status')
        .eq('id', conversationId)
        .maybeSingle();

      if (!conv) {
        conversationId = null; // invalid id, start fresh
      } else if (conv.status !== 'active') {
        return new Response(JSON.stringify({ error: 'conversation is closed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        totalInputTokens = conv.total_input_tokens || 0;
        totalOutputTokens = (conv as any).total_output_tokens || 0;
        messageCount = conv.message_count || 0;
        if (messageCount >= MAX_MESSAGES_PER_CONVO || totalInputTokens >= MAX_TOTAL_INPUT_PER_CONVO) {
          return new Response(JSON.stringify({
            conversationId,
            reply: "I've enjoyed chatting — let me get you to Nico directly for next steps. Call (941) 527-9169 or tap one of these buttons.",
            suggestedActions: [
              { label: 'Call Nico', url: 'tel:+19415279169' },
              { label: 'Book now', url: '/book-now' },
              { label: 'Text Nico', url: 'sms:+19415279169' },
            ],
            escalated: false,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Load recent history (cap at last 16 messages for context budget)
        const { data: msgs } = await supabase
          .from('chatbot_messages')
          .select('role, content')
          .eq('conversation_id', conversationId)
          .in('role', ['user', 'assistant'])
          .order('created_at', { ascending: true })
          .limit(16);
        history = ((msgs as any[]) || []).map(m => ({ role: m.role, content: m.content }));
      }
    }

    if (!conversationId) {
      const { data: newConv, error: convErr } = await supabase
        .from('chatbot_conversations')
        .insert({
          visitor_id: visitorId,
          lead_path: leadPath,
          landing_url: body?.landingUrl || null,
          utm_source: body?.utmSource || null,
          utm_campaign: body?.utmCampaign || null,
          referrer: body?.referrer || null,
          status: 'active',
        })
        .select('id')
        .single();
      if (convErr || !newConv) {
        return new Response(JSON.stringify({ error: 'Failed to start conversation' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      conversationId = newConv.id as string;
    }

    // ── LOG USER MESSAGE ─────────────────────────────────────────
    await supabase.from('chatbot_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userMessage,
    });

    // ── BUILD LIVE CONTEXT + CALL CLAUDE ─────────────────────────
    const liveContext = await buildLiveContext(supabase);
    const claudeMessages = [...history, { role: 'user', content: userMessage }];
    const claudeResult = await callClaude(claudeMessages, liveContext);

    if (!claudeResult) {
      const fallback = "I'm having a hiccup — let me get Nico to reach out to you. Text (941) 527-9169 and he'll respond personally.";
      await supabase.from('chatbot_messages').insert({
        conversation_id: conversationId, role: 'assistant', content: fallback,
        guardrail_triggered: 'api_failure',
      });
      return new Response(JSON.stringify({
        conversationId, reply: fallback,
        suggestedActions: [{ label: 'Text Nico', url: 'sms:+19415279169' }],
        escalated: false,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const rawText = claudeResult.text;
    const inputTokens = claudeResult.usage?.input_tokens || 0;
    const outputTokens = claudeResult.usage?.output_tokens || 0;

    // ── ANTI-LEAK POST-FILTER ────────────────────────────────────
    const leak = findLeakViolation(rawText);
    let finalText = rawText;
    let guardrailTriggered: string | null = null;
    if (leak.found) {
      guardrailTriggered = `anti-leak:${leak.reason}`;
      finalText = "That's not something I can speak to — I'm just here to help you book or get your question answered. Want me to pass you to Nico directly at (941) 527-9169?";
    }

    // ── PARSE ACTIONS + ESCALATION MARKERS ───────────────────────
    const parsed = parseActionsAndEscalation(finalText);

    // ── LOG ASSISTANT MESSAGE + UPDATE COUNTERS ──────────────────
    await supabase.from('chatbot_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: parsed.reply,
      suggested_actions: parsed.actions,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      escalation_triggered: parsed.escalate,
      guardrail_triggered: guardrailTriggered,
    });

    await supabase
      .from('chatbot_conversations')
      .update({
        total_input_tokens: totalInputTokens + inputTokens,
        total_output_tokens: totalOutputTokens + outputTokens,
        message_count: messageCount + 2, // user + assistant
        escalated_at: parsed.escalate ? new Date().toISOString() : undefined,
        escalation_reason: parsed.escalate ? parsed.escalationReason : undefined,
        status: parsed.escalate ? 'escalated' : 'active',
      })
      .eq('id', conversationId);

    // ── FIRE ESCALATION SMS (non-blocking) ──────────────────────
    if (parsed.escalate && parsed.escalationReason) {
      sendEscalationSMS(conversationId, parsed.escalationReason, userMessage).catch(() => {});
    }

    return new Response(JSON.stringify({
      conversationId,
      reply: parsed.reply,
      suggestedActions: parsed.actions,
      escalated: parsed.escalate,
      guardrailTriggered,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[chatbot] exception:', err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
