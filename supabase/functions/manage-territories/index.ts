
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { supabase } from "../_shared/supabase-client.ts";

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
    // Get JWT token from request
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Invalid token or unauthorized');
    }
    
    const { action, territoryData } = await req.json();
    
    let result;
    switch (action) {
      case 'create':
        result = await createTerritory(territoryData);
        break;
      case 'update':
        result = await updateTerritory(territoryData.id, territoryData);
        break;
      case 'assign':
        result = await assignTerritory(territoryData.territoryId, territoryData.franchiseOwnerId);
        break;
      default:
        throw new Error('Invalid action specified');
    }
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error managing territories:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'An unexpected error occurred'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

async function createTerritory(territoryData) {
  const { data, error } = await supabase
    .from('territories')
    .insert([territoryData])
    .select()
    .single();
    
  if (error) throw error;
  return { success: true, data };
}

async function updateTerritory(id, territoryData) {
  const { data, error } = await supabase
    .from('territories')
    .update(territoryData)
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;
  return { success: true, data };
}

async function assignTerritory(territoryId, franchiseOwnerId) {
  const { data, error } = await supabase
    .from('territories')
    .update({
      franchise_owner_id: franchiseOwnerId,
      status: 'assigned',
      assigned_at: new Date().toISOString()
    })
    .eq('id', territoryId)
    .select()
    .single();
    
  if (error) throw error;
  return { success: true, data };
}
