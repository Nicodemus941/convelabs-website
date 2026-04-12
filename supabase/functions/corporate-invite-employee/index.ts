import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { sendEmail } from "../_shared/email/providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/*
  corporate-invite-employee (REFACTORED for ConveLabs only)
  - Admin/billing users can invite new employees to ConveLabs corporate account
  - Generates a secure invitation token
  - Sends an email invitation
*/

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { email, executiveUpgrade = false } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Check if user has admin role
    const userRole = userData.user.user_metadata?.role;
    const allowedRoles = ["super_admin", "admin", "office_manager", "billing"];
    if (!allowedRoles.includes(userRole)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // Check if employee already exists
    const { data: existing, error: existingErr } = await supabase
      .from("corporate_employees")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();

    if (existingErr) {
      return new Response(JSON.stringify({ error: "Database error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    if (existing) {
      return new Response(JSON.stringify({ error: "Employee already exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Generate invitation token (32 random bytes as hex)
    const invitationToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create employee record
    const { data: employee, error: createErr } = await supabase
      .from("corporate_employees")
      .insert({
        email,
        executive_upgrade: executiveUpgrade,
        status: "invited",
        invitation_token: invitationToken,
        invitation_expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (createErr) {
      console.error("Failed to create employee:", createErr);
      return new Response(JSON.stringify({ error: "Failed to create invitation" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    // Send invitation email using existing email infrastructure
    const origin = req.headers.get("origin") || "https://yluyonhrxxtyuiyrdixl.supabase.co";
    const inviteUrl = `${origin}/corporate-invite/${invitationToken}`;

    const emailResult = await sendEmail({
      to: email,
      subject: `Invitation to join ConveLabs corporate account`,
      from: "ConveLabs <invites@convelabs.com>",
      html: `
        <h1>You're invited to join ConveLabs</h1>
        <p>You've been invited to join the ConveLabs corporate account.</p>
        <p><strong>Account type:</strong> ${executiveUpgrade ? 'Executive' : 'Standard'} seat</p>
        <p><a href="${inviteUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accept Invitation</a></p>
        <p>Or copy and paste this link: ${inviteUrl}</p>
        <p>This invitation expires in 7 days.</p>
        <p>Best regards,<br>The ConveLabs Team</p>
      `,
    });

    if (!emailResult.success) {
      console.error("Failed to send email:", emailResult.error);
      // Still return success since the employee was created
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        employeeId: employee.id,
        invitationSent: emailResult.success 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[corporate-invite-employee] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});