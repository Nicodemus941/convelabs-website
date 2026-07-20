import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Abuse guardrails — this endpoint is public (verify_jwt=false) and each call
// hits a paid LLM gateway. Cap conversation size and rate-limit per IP + global.
const MAX_MESSAGES = 30;
const MAX_CHARS_PER_MESSAGE = 4000;

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  return first || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';
}

async function checkRateLimit(supabase: any, bucket: string, windowSeconds: number, max: number): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('hit_rate_limit', {
      p_bucket: bucket, p_window_seconds: windowSeconds, p_max: max,
    });
    if (error) { console.warn('[rate-limit] rpc error (fail-open):', error.message); return true; }
    return !!(data as any)?.allowed;
  } catch (e) {
    console.warn('[rate-limit] exception (fail-open):', e);
    return true;
  }
}

// ── CLOUDFLARE TURNSTILE (bot gate on the paid LLM call) ─────────────
// Fail-CLOSED on a missing/forged token (the abuse case). Fail-OPEN on a
// siteverify network error OR our OWN secret misconfig, so a config slip
// never breaks the funnel. Mirrors the E-Labus pattern.
async function verifyTurnstile(secret: string, token: string | undefined, ip?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await resp.json();
    if (data?.success === true) return true;
    const codes: string[] = Array.isArray(data?.['error-codes']) ? data['error-codes'] : [];
    console.warn('[turnstile] failed:', JSON.stringify(codes.length ? codes : data));
    // Fail OPEN on OUR misconfig (bad/missing secret) so a config slip never breaks the app:
    if (codes.some(c => ['invalid-input-secret', 'missing-input-secret', 'bad-request', 'internal-error'].includes(c))) {
      console.error('[turnstile] CONFIG ERROR — failing open. Fix TURNSTILE_SECRET_KEY.');
      return true;
    }
    return false; // genuine bad/expired/duplicate token -> block
  } catch (e) {
    console.warn('[turnstile] siteverify unreachable, failing open');
    return true;
  }
}

const SYSTEM_PROMPT = `You are ConveLabs' AI Sales Assistant - a friendly, knowledgeable representative helping patients schedule appointments and answer questions about our premium mobile phlebotomy services in Central Florida.

**CRITICAL INFORMATION:**

**Services We Offer:**
- Mobile phlebotomy (at-home blood draws)
- In-office blood draws at our partner locations
- Routine lab work, fasting labs, STAT draws
- Therapeutic phlebotomy
- Urine collections, stool samples
- Glucose pregnancy tests (1-hour, 2-hour, 3-hour)
- Genetic test kits
- Life insurance exams
- Specialty kit processing and shipping
- Corporate wellness programs and on-site screenings

**Lab Partners:**
We work with Quest Diagnostics, LabCorp, AdventHealth, Orlando Health, and can handle specialty labs that require processing and shipping.

**Service Areas:**
Primary: Orlando, Tampa, Winter Park, Windermere, Dr Phillips, Lake Nona, Celebration, Heathrow
Luxury communities: Isleworth, Bay Hill, Golden Oak (Disney), Reunion Resort
We cover most of Central Florida - if unsure about a specific area, encourage them to check availability during booking.

**Hours of Operation:**
- Monday-Friday: 6:00 AM - 1:30 PM
- Saturday: 6:00 AM - 9:30 AM (occasionally, check availability)
- Sunday: CLOSED

**Pricing & Membership Plans:**
1. Individual Plan: $99/month (4 annual credits)
2. Individual +1 Plan: $149/month (8 annual credits) 
3. Family Plan: $199/month (10 annual credits, up to 4 family members)
4. Concierge Doctor Plan: Starting at $400/month (12+ credits depending on patient count)
5. À La Carte (non-members): $250 per visit (Monday-Wednesday 10am-1:30pm only)

**Corporate Solutions:**
- Corporate Seat Program: Per-employee pricing for businesses
- On-site wellness screenings
- Executive health packages
- Custom enterprise solutions

**Insurance:**
❌ We DO NOT accept insurance. We operate on a self-pay/membership model. However, patients can often submit receipts to their insurance for potential reimbursement.

**Booking:**
🔗 https://convelabs.com/book-now
This is the ONLY way to schedule appointments. Always provide this link when asked about booking.

**Lab Orders:**
Patients can submit lab orders via:
- Email: orders@convelabs.com
- Fax: 941-251-8467
- Have their provider's office send directly

**Contact Information:**
- Phone: (941) 527-9169
- Email: orders@convelabs.com
- Fax: 941-251-8467

**Process:**
1. Patient schedules via booking link
2. Submits lab orders (email/fax or provider sends)
3. Phlebotomist arrives at scheduled time
4. Samples collected and delivered to appropriate lab partner
5. Results sent to ordering provider

**Key Selling Points:**
✅ No waiting rooms or traffic
✅ Professional, licensed phlebotomists
✅ HIPAA compliant
✅ Same-day lab delivery (for morning appointments)
✅ Works with all major labs
✅ Concierge-level service
✅ Trusted by VIP clients, athletes, celebrities

**Tone & Style:**
- Warm, professional, and reassuring
- Use medical terminology correctly but keep explanations simple
- Emphasize convenience, luxury, and professionalism
- Be empathetic to patient concerns
- Always encourage booking when appropriate
- If you don't know something specific, be honest and suggest they contact us directly

**Important Notes:**
- For complex medical questions, advise consulting their healthcare provider
- For specialty tests or unusual requests, suggest contacting us at (941) 527-9169
- Always confirm service area availability during booking process
- Emphasize our professional credentials and experience (since 2012)

Your goal is to help patients understand our services, answer questions thoroughly, and guide them confidently toward scheduling their appointment.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const messages = body?.messages;

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // ── INPUT CAPS ───────────────────────────────────────────────
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (messages.length > MAX_MESSAGES) {
      return new Response(JSON.stringify({
        error: "This chat has gotten long — please call us at (941) 527-9169 to continue.",
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const safeMessages = messages.slice(-MAX_MESSAGES).map((m: any) => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      content: String(m?.content || '').slice(0, MAX_CHARS_PER_MESSAGE),
    }));

    // ── ABUSE RATE LIMITS (per-IP + global) ──────────────────────
    // Public endpoint hitting a paid LLM gateway — gate volume before spend.
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const clientIp = getClientIp(req);
    const [ipOk, globalOk] = await Promise.all([
      checkRateLimit(supabase, `aisales:ip:${clientIp}`, 3600, 30),   // 30 / hour / IP
      checkRateLimit(supabase, `aisales:global`, 86400, 1500),        // 1500 / day total
    ]);
    if (!ipOk || !globalOk) {
      console.warn(`[ai-sales-chat] rate-limited ip=${clientIp} ipOk=${ipOk} globalOk=${globalOk}`);
      return new Response(JSON.stringify({
        error: "We're getting a lot of questions right now. Please call us at (941) 527-9169.",
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── TURNSTILE BOT GATE (anon callers only) ───────────────────
    // Inert until TURNSTILE_SECRET_KEY is set, so shipping is safe. Gates
    // anonymous visitors before the paid model call; logged-in users skip.
    const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY');
    if (TURNSTILE_SECRET) {
      let isAnon = false;
      try {
        const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        if (jwt) {
          const { data: { user } } = await supabase.auth.getUser(jwt);
          isAnon = (user as any)?.is_anonymous === true || !user;
        } else {
          isAnon = true;
        }
      } catch { isAnon = true; }
      if (isAnon) {
        const ip = req.headers.get('CF-Connecting-IP')
          || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || undefined;
        const ok = await verifyTurnstile(TURNSTILE_SECRET, body?.captchaToken, ip);
        if (!ok) {
          return new Response(JSON.stringify({ error: 'Security check failed. Please refresh and try again.' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    console.log('AI Sales Chat request received:', { messageCount: safeMessages.length });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...safeMessages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Our AI assistant is experiencing high traffic. Please try again in a moment.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Service temporarily unavailable. Please call us at (941) 527-9169.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI Gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('AI Sales Chat error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
