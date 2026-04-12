
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { sendEmail } from "../_shared/email/index.ts";
import { createSupabaseAdmin } from "../_shared/email/client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      throw new Error("Email is required");
    }

    const supabase = createSupabaseAdmin();
    
    // Generate the password reset link
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://www.convelabs.com"}/reset-password`
      }
    });

    if (error) {
      console.error("Error generating recovery link:", error);
      throw error;
    }

    // If no action link was generated
    if (!data.properties?.action_link) {
      throw new Error("Failed to generate recovery link");
    }

    // Send the email with the recovery link
    const result = await sendEmail({
      to: email,
      subject: "Reset your ConveLabs password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Reset Your Password</h2>
          <p>Hello,</p>
          <p>We received a request to reset your password for your ConveLabs account. Click the button below to reset your password:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${data.properties.action_link}" style="background-color: #d13639; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
              Reset Password
            </a>
          </p>
          <p>If you didn't request this, you can safely ignore this email.</p>
          <p>This link will expire in 10 minutes.</p>
          <p>Best regards,<br>The ConveLabs Team</p>
        </div>
      `,
      from: "ConveLabs <password@convelabs.com>"
    });

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to send recovery email");
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        },
        status: 200
      }
    );
  } catch (error) {
    console.error("Recovery message error:", error);
    
    return new Response(
      JSON.stringify({
        error: error.message || "An unexpected error occurred"
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        },
        status: 400
      }
    );
  }
});
