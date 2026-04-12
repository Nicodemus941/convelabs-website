
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createSupabaseAdmin } from "../_shared/email/index.ts";
import { MarketingCampaignRequest, MarketingCampaignResponse } from "../_shared/email/types.ts";
import { processManualEmails, fetchMemberRecipients } from "../_shared/email/recipients.ts";
import { processEmailRecipient, processBatchedRecipients } from "../_shared/email/marketing.ts";
import { setupDatabaseFunctions } from "../_shared/database-functions.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Handle CORS preflight requests
function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

// Validate the request payload
function validateRequest(payload: MarketingCampaignRequest): { success: boolean; error?: string } {
  if (!payload.templateName) {
    return { 
      success: false, 
      error: "Missing required parameters" 
    };
  }
  return { success: true };
}

// Handle test mode - send only to the first recipient
async function handleTestMode(
  supabase: any,
  recipient: any,
  payload: MarketingCampaignRequest
): Promise<Response> {
  console.log("Running in test mode - sending only to first recipient");
  
  // Process the recipient
  const result = await processEmailRecipient(
    supabase,
    recipient,
    payload.templateName,
    payload.templateData,
    payload.senderName,
    payload.senderEmail,
    payload.replyTo
  );
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      sent: result.success ? 1 : 0,
      test_mode: true,
      recipient: recipient.email
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Save a scheduled campaign to the database
async function saveScheduledCampaign(
  supabase: any,
  payload: MarketingCampaignRequest, 
  recipientCount: number
): Promise<Response> {
  try {
    // Insert the scheduled campaign data
    const { data, error } = await supabase
      .from('scheduled_campaigns')
      .insert({
        template_name: payload.templateName,
        template_data: payload.templateData,
        recipient_filter: payload.recipientFilter,
        manual_emails: payload.manualEmails,
        sender_name: payload.senderName,
        sender_email: payload.senderEmail,
        reply_to: payload.replyTo,
        scheduled_for: payload.scheduledFor,
        estimated_recipients: recipientCount,
        status: 'scheduled'
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        scheduled: true,
        scheduled_id: data.id,
        estimated_recipients: recipientCount,
        scheduled_for: payload.scheduledFor
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scheduling campaign:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to schedule campaign' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
}

// Main handler function
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();
    
    // Setup database functions if needed
    await setupDatabaseFunctions(supabase);
    
    const payload = await req.json() as MarketingCampaignRequest;
    
    // Validate the request
    const validation = validateRequest(payload);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    console.log(`Processing marketing campaign using template: ${payload.templateName}`);
    
    // Array to store all recipients
    let recipients = [];
    
    // Process manual email addresses if provided
    if (payload.manualEmails && payload.manualEmails.length > 0) {
      const manualRecipients = await processManualEmails(payload.manualEmails);
      recipients = [...manualRecipients];
    }
    
    // If we need to fetch members from the database
    if (!recipients.length && payload.recipientFilter) {
      const memberRecipients = await fetchMemberRecipients(supabase, payload.recipientFilter);
      if (memberRecipients.length > 0) {
        recipients = memberRecipients;
      }
    }
    
    // If we have no recipients after all filters, return early
    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          sent: 0,
          message: "No recipients found matching criteria" 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Found ${recipients.length} recipients for campaign`);
    
    // Test mode - only send to the first recipient
    if (payload.testMode) {
      return handleTestMode(supabase, recipients[0], payload);
    }
    
    // Schedule the campaign for future delivery if scheduledFor is provided
    if (payload.scheduledFor) {
      const scheduledDate = new Date(payload.scheduledFor);
      const now = new Date();
      
      // Validate scheduled date is in the future
      if (scheduledDate <= now) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Scheduled date must be in the future" 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      
      return saveScheduledCampaign(supabase, payload, recipients.length);
    }
    
    // Process all recipients in batches immediately if not scheduled
    const result = await processBatchedRecipients(
      supabase,
      recipients,
      payload.templateName,
      payload.templateData,
      payload.senderName,
      payload.senderEmail,
      payload.replyTo
    );
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in send-marketing-campaign function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
