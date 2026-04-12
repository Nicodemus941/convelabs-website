
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    // Get domain or subdomain from query parameters
    const url = new URL(req.url);
    const domain = url.searchParams.get('domain');
    const subdomain = url.searchParams.get('subdomain');
    
    if (!domain && !subdomain) {
      return new Response(
        JSON.stringify({ error: 'Either domain or subdomain is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }
    
    // Query the tenants table to find a matching tenant
    let query = supabaseClient
      .from('tenants')
      .select('*');
      
    if (domain) {
      query = query.eq('domain', domain);
    } else if (subdomain) {
      query = query.eq('subdomain', subdomain);
    }
    
    const { data: tenantData, error: tenantError } = await query.maybeSingle();
    
    if (tenantError) {
      return new Response(
        JSON.stringify({ error: tenantError.message }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }
    
    if (!tenantData) {
      return new Response(
        JSON.stringify({ found: false }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      );
    }
    
    return new Response(
      JSON.stringify({ found: true, tenant: tenantData }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
