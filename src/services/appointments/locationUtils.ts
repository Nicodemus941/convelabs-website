
import { BookingFormValues } from '@/types/appointmentTypes';
import { geocodeAddress } from '@/services/geocodingService';

/**
 * Gets coordinates from form data
 */
export async function getCoordinatesFromFormData(formData: BookingFormValues): Promise<{ latitude: number | null, longitude: number | null }> {
  let latitude = null;
  let longitude = null;
  
  if (formData.locationDetails && formData.locationDetails.address) {
    if ('latitude' in formData && 'longitude' in formData) {
      latitude = formData.latitude;
      longitude = formData.longitude;
    } else {
      // Geocode the address
      const formattedAddress = `${formData.locationDetails.address}, ${formData.locationDetails.city}, ${formData.locationDetails.state} ${formData.locationDetails.zipCode}`;
      console.log("Geocoding address:", formattedAddress);
      const coordinates = await geocodeAddress(formattedAddress, formData.locationDetails.zipCode);
      
      if (coordinates) {
        console.log("Address geocoded:", coordinates);
        latitude = coordinates.latitude;
        longitude = coordinates.longitude;
      } else {
        console.log("Geocoding failed, proceeding without coordinates");
      }
    }
  }

  return { latitude, longitude };
}
