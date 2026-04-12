
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createSupabaseAdmin } from "../_shared/email/index.ts";
import { processManualEmails, fetchMemberRecipients } from "../_shared/email/recipients.ts";
import { processBatchedRecipients } from "../_shared/email/marketing.ts";
import { setupDatabaseFunctions } from "../_shared/database-functions.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();
    
    // Setup database functions if needed
    await setupDatabaseFunctions(supabase);
    
    console.log('Processing scheduled campaigns...');
    
    // Get current date
    const now = new Date();
    
    // Fetch scheduled campaigns that are due for processing
    const { data: campaigns, error } = await supabase
      .from('scheduled_campaigns')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now.toISOString())
      .order('scheduled_for', { ascending: true });
    
    if (error) throw error;
    
    if (!campaigns || campaigns.length === 0) {
      console.log('No scheduled campaigns found for processing');
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Found ${campaigns.length} campaigns to process`);
    
    // Process each campaign
    const results = [];
    
    for (const campaign of campaigns) {
      try {
        console.log(`Processing campaign ${campaign.id} scheduled for ${campaign.scheduled_for}`);
        
        // Update status to processing
        await supabase
          .from('scheduled_campaigns')
          .update({ status: 'processing' })
          .eq('id', campaign.id);
        
        // Get recipients
        let recipients = [];
        
        // Process manual email addresses if provided
        if (campaign.manual_emails && campaign.manual_emails.length > 0) {
          const manualRecipients = await processManualEmails(campaign.manual_emails);
          recipients = [...manualRecipients];
        }
        
        // If we need to fetch members from the database
        if (!recipients.length && campaign.recipient_filter) {
          const memberRecipients = await fetchMemberRecipients(supabase, campaign.recipient_filter);
          if (memberRecipients.length > 0) {
            recipients = memberRecipients;
          }
        }
        
        if (!recipients || recipients.length === 0) {
          // No recipients found, mark as completed with a note
          await supabase
            .from('scheduled_campaigns')
            .update({ 
              status: 'completed', 
              result: { success: true, sent: 0, message: 'No recipients found' }
            })
            .eq('id', campaign.id);
          
          results.push({ id: campaign.id, success: true, sent: 0 });
          continue;
        }
        
        // Process all recipients
        const result = await processBatchedRecipients(
          supabase,
          recipients,
          campaign.template_name,
          campaign.template_data,
          campaign.sender_name,
          campaign.sender_email,
          campaign.reply_to
        );
        
        // Update campaign status with result
        await supabase
          .from('scheduled_campaigns')
          .update({ 
            status: 'completed', 
            result: result,
            processed_at: new Date().toISOString()
          })
          .eq('id', campaign.id);
        
        results.push({ id: campaign.id, ...result });
        
      } catch (campaignError) {
        console.error(`Error processing campaign ${campaign.id}:`, campaignError);
        
        // Update campaign status with error
        await supabase
          .from('scheduled_campaigns')
          .update({ 
            status: 'failed', 
            result: { success: false, error: campaignError.message }
          })
          .eq('id', campaign.id);
        
        results.push({ 
          id: campaign.id, 
          success: false, 
          error: campaignError.message 
        });
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: campaigns ? campaigns.length : 0,
        results: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in process-scheduled-campaigns function:', error);
    
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
