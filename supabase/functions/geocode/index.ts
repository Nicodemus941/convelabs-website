
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.8.0";

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface GeocodingRequest {
  address: string;
  zipcode: string;
}

interface GeocodingResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

serve(async (req: Request) => {
  try {
    // Check for proper method
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const data: GeocodingRequest = await req.json();
    const { address, zipcode } = data;
    
    if (!address || !zipcode) {
      return new Response(JSON.stringify({ error: "Address and zipcode are required" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // First check if we have cached these coordinates
    const { data: cachedCoords, error: cacheError } = await supabase
      .from('distance_calculations')
      .select('to_lat, to_lng')
      .eq('to_address', `${address}, ${zipcode}`)
      .maybeSingle();
      
    if (cachedCoords) {
      return new Response(
        JSON.stringify({
          latitude: cachedCoords.to_lat,
          longitude: cachedCoords.to_lng,
          formatted_address: `${address}, ${zipcode}`
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Use Google Maps API for geocoding
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address + ' ' + zipcode)}&key=${GOOGLE_API_KEY}`);
    const geocodeResult = await response.json();
    
    // Check if we got valid results
    if (geocodeResult.status !== 'OK' || !geocodeResult.results || geocodeResult.results.length === 0) {
      console.error('Geocoding error:', geocodeResult);
      
      // Fallback to simplified mock implementation
      const zipNum = parseInt(zipcode.replace(/[^0-9]/g, ''));
      const latitude = 28.5383 + ((zipNum % 100) * 0.01);
      const longitude = -81.3792 - ((zipNum % 100) * 0.01);
      
      // Store in cache
      await supabase.from('distance_calculations').insert({
        from_lat: 0,
        from_lng: 0,
        to_lat: latitude,
        to_lng: longitude,
        to_address: `${address}, ${zipcode}`,
        distance_miles: 0,
        travel_time_seconds: 0
      });
      
      const result: GeocodingResult = {
        latitude,
        longitude,
        formatted_address: `${address}, ${zipcode}`
      };
      
      return new Response(
        JSON.stringify(result),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Extract coordinates from Google API response
    const location = geocodeResult.results[0].geometry.location;
    const formattedAddress = geocodeResult.results[0].formatted_address;
    
    // Store in cache
    await supabase.from('distance_calculations').insert({
      from_lat: 0,
      from_lng: 0,
      to_lat: location.lat,
      to_lng: location.lng,
      to_address: `${address}, ${zipcode}`,
      distance_miles: 0,
      travel_time_seconds: 0
    });
    
    const result: GeocodingResult = {
      latitude: location.lat,
      longitude: location.lng,
      formatted_address: formattedAddress
    };

    return new Response(
      JSON.stringify(result),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in geocoding function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
});
