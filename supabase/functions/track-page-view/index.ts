
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Function to get geolocation from IP address
async function getGeolocation(ip: string) {
  try {
    // Using ipapi.co for free IP geolocation (1000 requests per day)
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    return {
      city: data.city || null,
      state: data.region || null,
      zip_code: data.postal || null,
      country: data.country_name || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null
    };
  } catch (error) {
    console.error('Geolocation API error:', error);
    return {
      city: null,
      state: null,
      zip_code: null,
      country: null,
      latitude: null,
      longitude: null
    };
  }
}

// Function to extract real IP address from request
function getRealIP(req: Request): string {
  // Check various headers for the real IP address
  const xForwardedFor = req.headers.get('x-forwarded-for');
  const xRealIP = req.headers.get('x-real-ip');
  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  
  if (cfConnectingIP) return cfConnectingIP;
  if (xRealIP) return xRealIP;
  if (xForwardedFor) {
    // x-forwarded-for can contain multiple IPs, get the first one
    return xForwardedFor.split(',')[0].trim();
  }
  
  // Fallback to a default IP for development
  return '127.0.0.1';
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Parse request body
    const { path, referrer, userAgent, userId } = await req.json();
    
    if (!path) {
      throw new Error("Path is required");
    }
    
    // Get real IP address
    const ipAddress = getRealIP(req);
    
    // Get geolocation data
    const locationData = await getGeolocation(ipAddress);
    
    // Validate UUID format for userId if provided
    let validatedUserId = null;
    if (userId) {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(userId)) {
        console.warn("Invalid UUID format for userId:", userId);
      } else {
        validatedUserId = userId;
      }
    }
    
    // Insert page view with location data into Supabase
    const { data, error } = await supabase
      .from('page_views')
      .insert([
        { 
          path, 
          referrer, 
          user_agent: userAgent, 
          user_id: validatedUserId,
          ip_address: ipAddress,
          city: locationData.city,
          state: locationData.state,
          zip_code: locationData.zip_code,
          country: locationData.country,
          latitude: locationData.latitude,
          longitude: locationData.longitude
        }
      ]);
    
    if (error) {
      console.error("Error inserting page view:", error);
      throw error;
    }
    
    console.log(`Page view tracked for ${path} from ${locationData.city}, ${locationData.state}, ${locationData.country}`);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error tracking page view:', error);
    
    return new Response(JSON.stringify({ error: error.message || "Failed to track page view" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
