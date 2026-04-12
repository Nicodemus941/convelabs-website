
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
    
    // Setup database functions if needed
    await setupDatabaseFunctions(supabase);
    
    // Call the get_scheduled_campaigns database function
    const { data, error } = await supabase
      .from('scheduled_campaigns')
      .select('*')
      .order('scheduled_for', { ascending: true });
    
    if (error) throw error;
    
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in get-scheduled-campaigns function:', error);
    
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
