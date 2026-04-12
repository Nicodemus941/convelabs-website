
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

    // Check if user has admin privileges
    const { data: roleData } = await supabase.from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const isAdmin = roleData?.role === 'admin' || roleData?.role === 'super_admin';
    
    if (!isAdmin) {
      throw new Error('Only admins can create the franchise database');
    }

    // Create territories table
    await supabase.rpc('create_territories_table');
    
    // Create franchise_owners table
    await supabase.rpc('create_franchise_owners_table');
    
    // Create franchise_staff table
    await supabase.rpc('create_franchise_staff_table');
    
    // Create franchise_performance table
    await supabase.rpc('create_franchise_performance_table');
    
    return new Response(
      JSON.stringify({ success: true, message: "Franchise database tables created successfully" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error creating franchise database:', error);
    
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
