
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, html, from, text } = await req.json();
    
    console.log(`Sending email to ${to} with subject: ${subject}`);
    
    const emailFrom = from || "ConveLabs <noreply@convelabs.com>";
    
    // Prepare form data for Mailgun
    const formData = new FormData();
    formData.append("from", emailFrom);
    formData.append("to", Array.isArray(to) ? to.join(",") : to);
    formData.append("subject", subject);
    if (html) formData.append("html", html);
    if (text) formData.append("text", text);
    
    // Send email via Mailgun
    const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mailgun API error: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();

    console.log("Email sent successfully:", data);
    return new Response(
      JSON.stringify({ success: true, data }),
      {
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        },
      }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        },
      }
    );
  }
});
