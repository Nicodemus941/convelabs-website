import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email) throw new Error('Email is required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

    if (!MAILGUN_API_KEY) {
      console.error('MAILGUN_API_KEY not set');
      throw new Error('Email service not configured');
    }

    // Step 1: Generate recovery link
    console.log('Generating recovery link for:', email);
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim(),
      options: {
        redirectTo: 'https://convelabs.com/reset-password',
      },
    });

    if (error) {
      console.error('generateLink error:', JSON.stringify(error));
      // Return generic message for security
      return new Response(JSON.stringify({
        success: true,
        message: 'If this email is in our system, a reset link has been sent.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const actionLink = data?.properties?.action_link;
    const hashedToken = data?.properties?.hashed_token;
    const emailOtp = data?.properties?.email_otp;
    console.log('Action link:', actionLink ? 'YES' : 'NO', 'Token:', hashedToken ? 'YES' : 'NO', 'OTP:', emailOtp ? 'YES' : 'NO');

    if (!actionLink) {
      console.error('No action_link in response');
      return new Response(JSON.stringify({
        success: true,
        message: 'If this email is in our system, a reset link has been sent.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build a direct link that goes to our app with the token as a query param.
    // We skip Supabase's /auth/v1/verify redirect + hash-based flow entirely —
    // the hash flow was fragile (race between client auto-detect + token
    // consumption). Direct ?token= flow uses verifyOtp() atomically with zero
    // polling.
    //
    // If hashed_token is missing for any reason, fall back to the actionLink
    // so the link doesn't become a dead URL.
    const resetLink = hashedToken
      ? `https://www.convelabs.com/reset-password?token=${encodeURIComponent(hashedToken)}&email=${encodeURIComponent(email.trim())}&type=recovery`
      : actionLink;

    // Step 2: Get patient name
    const { data: tp } = await supabase
      .from('tenant_patients')
      .select('first_name')
      .ilike('email', email.trim())
      .maybeSingle();

    const firstName = tp?.first_name || 'Patient';

    // Step 3: Send email via Mailgun
    console.log('Sending reset email to:', email, 'via Mailgun');

    const emailHtml = `<div style="font-family:Arial;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:white;padding:28px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;font-size:22px;">Reset Your Password</h1>
        <p style="margin:6px 0 0;opacity:0.9;">ConveLabs Account Recovery</p>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
        <p>Hi ${firstName},</p>
        <p>We received a request to reset your ConveLabs password. Click the button below to create a new password:</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${resetLink}" style="display:inline-block;background:#B91C1C;color:white;padding:14px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">Reset My Password</a>
        </div>
        <p style="text-align:center;margin:8px 0 20px;font-size:12px;color:#666;word-break:break-all">Or copy this link:<br><a href="${resetLink}" style="color:#B91C1C;text-decoration:underline">${resetLink}</a></p>
        <p style="font-size:13px;color:#6b7280;">This link expires in 1 hour. If you did not request this, ignore this email.</p>
        <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
      </div>
    </div>`;

    const formData = new FormData();
    formData.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
    formData.append('to', email.trim());
    formData.append('subject', 'Reset Your ConveLabs Password');
    formData.append('html', emailHtml);
    // Don't let Mailgun wrap the reset link in a tracking redirect —
    // that doubles the link-lifetime problem (Mailgun's redirect + Supabase's
    // token expiry) and sometimes corrupts the encoded token.
    formData.append('o:tracking-clicks', 'no');
    formData.append('o:tag', 'password-reset');

    const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: formData,
    });

    const mgResult = await mgRes.text();
    console.log('Mailgun response:', mgRes.status, mgResult);

    if (!mgRes.ok) {
      console.error('Mailgun failed:', mgResult);
      throw new Error('Failed to send email');
    }

    console.log('Password reset email sent successfully to:', email);

    return new Response(JSON.stringify({
      success: true,
      message: 'Password reset email sent',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Password reset error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to process request',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
