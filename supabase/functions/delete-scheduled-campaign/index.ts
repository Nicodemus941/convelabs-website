
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createSupabaseAdmin } from "../_shared/email/index.ts";
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
    const { id } = await req.json();
    
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Campaign ID is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }
    
    // Setup database functions if needed
    await setupDatabaseFunctions(supabase);
    
    // Delete the campaign using direct table access with status check
    const { error } = await supabase
      .from('scheduled_campaigns')
      .delete()
      .eq('id', id)
      .eq('status', 'scheduled');
    
    if (error) throw error;
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in delete-scheduled-campaign function:', error);
    
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
