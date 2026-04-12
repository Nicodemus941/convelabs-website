
import { supabase } from "@/integrations/supabase/client";

/**
 * Service for geocoding addresses and calculating distances between locations
 */
export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface DistanceResult {
  distance: number;  // Distance in miles
  duration: number;  // Duration in seconds
}

/**
 * Convert an address to geographic coordinates using Google Maps API
 */
export async function geocodeAddress(address: string, zipCode: string): Promise<GeoCoordinates | null> {
  try {
    // First check if we have cached coordinates for this address in our database
    const { data: existingCoordinates } = await supabase
      .from('distance_calculations')
      .select('to_lat, to_lng')
      .ilike('to_address', `%${zipCode}%`)
      .limit(1);

    if (existingCoordinates && existingCoordinates.length > 0) {
      return {
        latitude: existingCoordinates[0].to_lat,
        longitude: existingCoordinates[0].to_lng
      };
    }

    // Call our edge function that handles geocoding
    const { data, error } = await supabase.functions.invoke('geocode', {
      body: { address, zipcode: zipCode }
    });
    
    if (error) {
      console.error('Geocoding error:', error);
      return null;
    }
    
    return { 
      latitude: data.latitude, 
      longitude: data.longitude 
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Calculate the distance and travel time between two geographic coordinates
 */
export async function calculateDistance(
  origin: GeoCoordinates,
  destination: GeoCoordinates
): Promise<DistanceResult | null> {
  try {
    // Check if we have this calculation cached
    const { data: cachedCalculation } = await supabase
      .from('distance_calculations')
      .select('distance_miles, travel_time_seconds')
      .eq('from_lat', origin.latitude)
      .eq('from_lng', origin.longitude)
      .eq('to_lat', destination.latitude)
      .eq('to_lng', destination.longitude)
      .maybeSingle();
    
    if (cachedCalculation) {
      return {
        distance: cachedCalculation.distance_miles,
        duration: cachedCalculation.travel_time_seconds
      };
    }

    // Try to use Google Maps Distance Matrix API if available
    try {
      const { data, error } = await supabase.functions.invoke('calculate-distance', {
        body: { origin, destination }
      });
      
      if (!error && data) {
        // Cache the calculation for future use
        await supabase.from('distance_calculations').insert({
          from_lat: origin.latitude,
          from_lng: origin.longitude,
          to_lat: destination.latitude,
          to_lng: destination.longitude,
          distance_miles: data.distance,
          travel_time_seconds: data.duration
        });
        
        return data;
      }
    } catch (apiError) {
      console.warn('Distance Matrix API error, falling back to Haversine:', apiError);
      // Fall back to Haversine formula if API call fails
    }
    
    // Fallback to Haversine formula if API is not available
    // Earth's radius in miles
    const earthRadius = 3958.8;
    
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
    
    // Cache the calculation for future use
    await supabase.from('distance_calculations').insert({
      from_lat: origin.latitude,
      from_lng: origin.longitude,
      to_lat: destination.latitude,
      to_lng: destination.longitude,
      distance_miles: distance,
      travel_time_seconds: travelTimeSeconds
    });
    
    return { distance, duration: travelTimeSeconds };
  } catch (error) {
    console.error('Distance calculation error:', error);
    return null;
  }
}

/**
 * Determine the buffer time needed between appointments based on distance
 */
export function getBufferTimeMinutes(distanceInMiles: number): number {
  // If distance is less than 15 miles, use a 15-minute buffer
  // Otherwise, calculate buffer based on distance (assuming 30mph average speed)
  if (distanceInMiles <= 15) {
    return 15;
  } else {
    // Calculate driving time in minutes based on 30mph average speed
    const drivingTimeMinutes = Math.ceil((distanceInMiles / 30) * 60);
    // Add 15 minutes for the service duration
    return drivingTimeMinutes + 15;
  }
}
