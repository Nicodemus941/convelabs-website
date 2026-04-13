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

    // Generate password reset link using admin API
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim(),
      options: {
        redirectTo: 'https://convelabs.com/reset-password',
      },
    });

    if (error) {
      console.error('Generate link error:', error);
      // If user doesn't exist in auth, check tenant_patients
      const { data: tp } = await supabase
        .from('tenant_patients')
        .select('first_name')
        .ilike('email', email.trim())
        .maybeSingle();

      if (tp) {
        // Patient exists but has no auth account — tell them to sign up
        return new Response(JSON.stringify({
          success: true,
          message: 'If this email is in our system, a reset link has been sent.',
          needsSignup: true,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw error;
    }

    // The action_link goes through Supabase's verification endpoint
    // Extract the token and build a link that goes directly to our reset page
    const actionLink = data?.properties?.action_link;
    const token = data?.properties?.hashed_token;

    if (!actionLink) throw new Error('Failed to generate reset link');

    // Use the Supabase verification link — it handles token exchange and redirects
    const resetLink = actionLink;

    // Get patient name
    const { data: tp } = await supabase
      .from('tenant_patients')
      .select('first_name')
      .ilike('email', email.trim())
      .maybeSingle();

    const firstName = tp?.first_name || 'Patient';

    // Send via Mailgun
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

    if (!MAILGUN_API_KEY) throw new Error('Mailgun not configured');

    const emailHtml = `
      <div style="font-family:Arial;max-width:600px;margin:0 auto;">
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
          <p style="font-size:13px;color:#6b7280;">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
          <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
        </div>
      </div>
    `;

    const formData = new FormData();
    formData.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
    formData.append('to', email.trim());
    formData.append('subject', 'Reset Your ConveLabs Password');
    formData.append('html', emailHtml);

    const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: formData,
    });

    if (!mgRes.ok) {
      const err = await mgRes.text();
      throw new Error(`Mailgun error: ${err}`);
    }

    console.log(`Password reset sent to ${email}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Password reset email sent',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Password reset error:', error);
    return new Response(JSON.stringify({
      success: true, // Always return success to not reveal if email exists
      message: 'If this email is in our system, a reset link has been sent.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
