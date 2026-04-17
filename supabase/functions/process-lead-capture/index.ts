import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * PROCESS LEAD CAPTURE — Welcome Email + 10% Discount Code
 *
 * Fires when a visitor submits their email on the homepage LeadCapture
 * or footer newsletter form. Writes to `leads`, sends welcome email
 * via Mailgun with WELCOME10 code + link to the blood-work guide.
 *
 * Hormozi principle: when you promise a thing, deliver the thing.
 * Before today this flow was a ghost — table didn't exist, no email,
 * no code, no guide. Now every email submit → actual email in inbox
 * within 60 seconds with a usable $15-off code and a link to content.
 *
 * Safe to call multiple times — UNIQUE(email, source) prevents dups.
 *
 * POST body:
 *   {
 *     "email": "jane@example.com",
 *     "source": "homepage_lead_capture" | "footer_newsletter",
 *     "referrer": "https://...",
 *     "userAgent": "..."
 *   }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DISCOUNT_CODE = 'WELCOME10';
const DISCOUNT_AMOUNT = 15;

const welcomeHtml = (email: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to ConveLabs</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 560px; margin: 0 auto; background: white; padding: 40px 32px; }
    .logo { font-size: 26px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
    .logo-dot { color: #B91C1C; }
    .tagline { color: #666; font-size: 13px; margin-bottom: 32px; }
    h1 { font-size: 26px; margin: 0 0 16px; line-height: 1.3; }
    .lead { font-size: 16px; color: #444; margin-bottom: 28px; }
    .code-card { background: linear-gradient(135deg, #FEF2F2, #FEE2E2); border: 2px solid #B91C1C; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
    .code-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #991B1B; margin-bottom: 8px; }
    .code { font-size: 32px; font-weight: 700; letter-spacing: 0.15em; color: #B91C1C; margin: 4px 0; font-family: 'Courier New', monospace; }
    .code-value { font-size: 14px; color: #444; }
    .cta { display: inline-block; background: #B91C1C; color: white !important; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .guide-card { background: #F9FAFB; border-radius: 10px; padding: 20px; margin: 24px 0; border-left: 3px solid #B91C1C; }
    .guide-title { font-weight: 700; margin-bottom: 6px; }
    .footer { border-top: 1px solid #E5E7EB; margin-top: 40px; padding-top: 20px; font-size: 12px; color: #999; text-align: center; }
    .trust { font-size: 13px; color: #666; font-style: italic; margin-top: 24px; padding: 16px; background: #F9FAFB; border-radius: 8px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">ConveLabs<span class="logo-dot">.</span></div>
    <div class="tagline">Premium Mobile Lab Service · Better Than NFL-Grade</div>

    <h1>Welcome — here's your 10% off.</h1>
    <p class="lead">
      Thanks for giving us your email. As promised, below is your first-visit discount and
      the free guide we told you about. Use the code at checkout for $${DISCOUNT_AMOUNT} off
      any mobile visit.
    </p>

    <div class="code-card">
      <div class="code-label">Your Discount Code</div>
      <div class="code">${DISCOUNT_CODE}</div>
      <div class="code-value">$${DISCOUNT_AMOUNT} off your first mobile visit · Valid for 30 days</div>
    </div>

    <div style="text-align: center;">
      <a href="https://convelabs.com/?ref=${DISCOUNT_CODE}" class="cta">Book Your Visit →</a>
    </div>

    <div class="guide-card">
      <div class="guide-title">📋 Understanding Your Blood Work Results</div>
      <p style="margin: 6px 0 12px; color: #555;">
        The free guide we promised — what every line on your lab report actually means,
        what "normal" really signifies, and the 5 numbers most doctors don't explain.
      </p>
      <a href="https://convelabs.com/blood-work-guide" style="color: #B91C1C; font-weight: 600; text-decoration: none;">
        Read the guide →
      </a>
    </div>

    <div class="trust">
      Trusted by NFL athletes (Deiontrez Mount, Titans/Colts/Broncos),
      fitness entrepreneur Michael Morelli (1M+ followers),
      and 500+ patients across Central Florida.
    </div>

    <div class="footer">
      You received this because you signed up at convelabs.com.<br>
      ConveLabs · Orlando, FL · <a href="https://convelabs.com" style="color: #B91C1C;">convelabs.com</a>
    </div>
  </div>
</body>
</html>
`;

const welcomePlain = (email: string) => `
Welcome to ConveLabs — here's your 10% off.

Thanks for signing up. Your discount code is:

    ${DISCOUNT_CODE}
    ($${DISCOUNT_AMOUNT} off your first mobile visit — valid 30 days)

Use it at checkout at convelabs.com.

Your free guide — "Understanding Your Blood Work Results" — is here:
https://convelabs.com/blood-work-guide

Book your visit: https://convelabs.com/?ref=${DISCOUNT_CODE}

Trusted by NFL athletes, fitness entrepreneur Michael Morelli (@morellifit),
and 500+ patients across Central Florida.

Questions? Reply to this email or call (941) 527-9169.

— The ConveLabs Team
`;

async function sendWelcomeEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
  const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN');
  const FROM_ADDRESS = Deno.env.get('MAILGUN_FROM') || `ConveLabs <hello@${MAILGUN_DOMAIN || 'convelabs.com'}>`;

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    return { ok: false, error: 'Mailgun not configured' };
  }

  const form = new FormData();
  form.append('from', FROM_ADDRESS);
  form.append('to', email);
  form.append('subject', "Your 10% off + free blood-work guide (as promised)");
  form.append('html', welcomeHtml(email));
  form.append('text', welcomePlain(email));
  form.append('o:tag', 'welcome-email');
  form.append('o:tag', 'lead-capture');

  try {
    const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`api:${MAILGUN_API_KEY}`),
      },
      body: form,
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, error: `Mailgun ${resp.status}: ${text.substring(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();
    const source = body.source || 'homepage_lead_capture';
    const referrer = body.referrer || null;
    const userAgent = body.userAgent || req.headers.get('user-agent') || null;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || null;

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Upsert the lead ──
    const { data: lead, error: upsertError } = await supabase
      .from('leads')
      .upsert({
        email, source, status: 'new',
        ip_address: ip, user_agent: userAgent, referrer,
      }, { onConflict: 'email,source', ignoreDuplicates: false })
      .select()
      .single();

    if (upsertError) {
      console.error('Lead upsert failed:', upsertError);
      // Don't fail silently — tell the caller
      return new Response(JSON.stringify({ success: false, error: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── If we already sent welcome email to this lead, don't re-send ──
    if (lead.welcome_email_sent_at) {
      return new Response(JSON.stringify({
        success: true,
        alreadyWelcomed: true,
        message: 'Lead already received welcome email',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Send the welcome email ──
    const emailResult = await sendWelcomeEmail(email);

    // ── Update lead record ──
    if (emailResult.ok) {
      await supabase.from('leads').update({
        status: 'welcome_sent',
        welcome_email_sent_at: new Date().toISOString(),
        discount_code_issued: DISCOUNT_CODE,
      }).eq('id', lead.id);
    } else {
      console.warn('Welcome email failed for', email, emailResult.error);
    }

    return new Response(JSON.stringify({
      success: true,
      leadId: lead.id,
      welcomeEmailSent: emailResult.ok,
      discountCode: DISCOUNT_CODE,
      ...(emailResult.ok ? {} : { emailError: emailResult.error }),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('Lead capture error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
