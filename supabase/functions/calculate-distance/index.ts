
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.8.0";

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface DistanceRequest {
  origin: {
    latitude: number;
    longitude: number;
  };
  destination: {
    latitude: number;
    longitude: number;
  };
}

interface DistanceResult {
  distance: number;  // Distance in miles
  duration: number;  // Duration in seconds
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
    const data: DistanceRequest = await req.json();
    const { origin, destination } = data;
    
    if (!origin || !destination) {
      return new Response(JSON.stringify({ error: "Origin and destination are required" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // First check if we have cached this calculation
    const { data: cachedResult } = await supabase
      .from('distance_calculations')
      .select('distance_miles, travel_time_seconds')
      .eq('from_lat', origin.latitude)
      .eq('from_lng', origin.longitude)
      .eq('to_lat', destination.latitude)
      .eq('to_lng', destination.longitude)
      .maybeSingle();
      
    if (cachedResult) {
      return new Response(
        JSON.stringify({
          distance: cachedResult.distance_miles,
          duration: cachedResult.travel_time_seconds
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Use Google Maps Distance Matrix API
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    // Format coordinates for the API
    const originStr = `${origin.latitude},${origin.longitude}`;
    const destStr = `${destination.latitude},${destination.longitude}`;
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${originStr}&destinations=${destStr}&key=${GOOGLE_API_KEY}`;
    const response = await fetch(url);
    const distanceResult = await response.json();
    
    // Check if the API returned valid results
    if (distanceResult.status !== 'OK' || 
        !distanceResult.rows || 
        distanceResult.rows.length === 0 || 
        !distanceResult.rows[0].elements || 
        distanceResult.rows[0].elements.length === 0 || 
        distanceResult.rows[0].elements[0].status !== 'OK') {
      
      // Fallback to Haversine formula
      const earthRadius = 3958.8; // in miles
      
      // Convert latitude and longitude from degrees to radians
      const lat1 = origin.latitude * (Math.PI / 180);
      const lon1 = origin.longitude * (Math.PI / 180);
      const lat2 = destination.latitude * (Math.PI / 180);
      const lon2 = destination.longitude * (Math.PI / 180);
      
      // Haversine formula
      const dlon = lon2 - lon1;
      const dlat = lat2 - lat1;
      const a = Math.pow(Math.sin(dlat / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dlon / 2), 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = earthRadius * c;
      
      // Estimate travel time: Assume average speed of 30 mph
      const averageSpeed = 30; // mph
      const travelTimeHours = distance / averageSpeed;
      const travelTimeSeconds = Math.round(travelTimeHours * 3600);
      
      const result: DistanceResult = {
        distance,
        duration: travelTimeSeconds
      };
      
      // Cache the result
      await supabase.from('distance_calculations').insert({
        from_lat: origin.latitude,
        from_lng: origin.longitude,
        to_lat: destination.latitude,
        to_lng: destination.longitude,
        distance_miles: distance,
        travel_time_seconds: travelTimeSeconds
      });
      
      return new Response(
        JSON.stringify(result),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Extract the distance and duration from the API response
    const element = distanceResult.rows[0].elements[0];
    
    // Convert distance from text (e.g. "10.4 mi") to number in miles
    const distanceText = element.distance.text;
    const distanceMiles = parseFloat(distanceText.replace(/[^\d.-]/g, ''));
    
    // Duration in seconds is already provided by the API
    const durationSeconds = element.duration.value;
    
    const result: DistanceResult = {
      distance: distanceMiles,
      duration: durationSeconds
    };
    
    // Cache the result
    await supabase.from('distance_calculations').insert({
      from_lat: origin.latitude,
      from_lng: origin.longitude,
      to_lat: destination.latitude,
      to_lng: destination.longitude,
      distance_miles: distanceMiles,
      travel_time_seconds: durationSeconds
    });
    
    return new Response(
      JSON.stringify(result),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in distance calculation function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
});
