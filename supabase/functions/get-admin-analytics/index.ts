
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Verify auth token (only super_admin should access this)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Authentication failed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    });
  }
  
  // Check if user is super_admin
  if (user.user_metadata?.role !== 'super_admin') {
    return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 403,
    });
  }
  
  try {
    const { timeRange } = await req.json();
    const timeRangeInDays = timeRange || 30; // Default to 30 days
    
    const timePeriod = `now() - interval '${timeRangeInDays} days'`;
    
    // Parallel requests for efficiency
    const [
      membershipData,
      revenueData,
      appointmentsData,
      pageViewsData,
      phlebotomistCount,
      inventoryAlerts
    ] = await Promise.all([
      // Get membership stats
      supabase
        .from('user_memberships')
        .select('id, plan_id, created_at, status')
        .gte('created_at', `${timePeriod}`),
      
      // Get revenue data (via profitability calculation function)
      supabase.rpc('calculate_profitability', { 
        from_date: `${timePeriod}`, 
        to_date: 'now()' 
      }),
      
      // Get appointments data
      supabase
        .from('appointments')
        .select('id, status, created_at')
        .gte('created_at', `${timePeriod}`),
      
      // Get page view analytics with location data
      supabase
        .from('page_views')
        .select('*, ip_address, city, state, zip_code, country, latitude, longitude')
        .gte('created_at', `${timePeriod}`),
        
      // Get active phlebotomists count
      supabase
        .from('auth.users')
        .select('count')
        .eq('user_metadata->>role', 'phlebotomist'),
        
      // Get inventory items below threshold
      supabase
        .from('inventory_items')
        .select('*')
        .lt('current_quantity', 'reorder_threshold')
    ]);
    
    return new Response(
      JSON.stringify({
        membershipData: membershipData.data,
        revenueData: revenueData.data,
        appointmentsData: appointmentsData.data,
        pageViewsData: pageViewsData.data,
        phlebotomistCount: phlebotomistCount.data?.[0]?.count || 0,
        inventoryAlerts: inventoryAlerts.data || []
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
